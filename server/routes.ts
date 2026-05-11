import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { setupWebSocket } from "./websocket";
import { SearchApiService } from "./searchApi";
import { TriageService } from "./triageService";
import { getNMIService } from "./payment/nmi";
import { insertItemSchema, insertSmsMessageSchema } from "@shared/schema";
import { checkItemLimit, getCurrentMonthKey, checkLimit } from "./middleware/subscription";
import multer from "multer";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import OpenAI from "openai";
// @ts-ignore - no types available for heic-convert
import heicConvert from "heic-convert";
import sharp from "sharp";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  }
});

// Extend Express session type
declare module 'express-session' {
  interface SessionData {
    userId: string;
    accountId: string;
  }
}

// Authentication middleware
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

// Bearer token authentication middleware
function requireBearerToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Bearer token required" });
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  if (!token) {
    return res.status(401).json({ error: "Invalid bearer token" });
  }
  
  // Validate token against secret
  const expectedToken = process.env.AGENT_API_KEY;
  if (!expectedToken) {
    console.error("AGENT_API_KEY not configured in secrets");
    return res.status(500).json({ error: "Agent authentication not configured" });
  }

  if (token !== expectedToken) {
    return res.status(401).json({ error: "Invalid bearer token" });
  }

  next();
}

// Get account from session (or error if not authenticated)
async function getSessionAccount(req: Request): Promise<string> {
  if (!req.session.accountId) {
    throw new Error("No account in session");
  }
  return req.session.accountId;
}

// Compute SHA-256 hash of buffer
function computeImageHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Normalize phone number to E.164 format: +[country code][number]
function normalizePhoneNumber(phoneNumber: string): string {
  phoneNumber = phoneNumber.trim();
  if (!phoneNumber.startsWith('+')) {
    // Assume US/Canada if no country code
    phoneNumber = '+1' + phoneNumber.replace(/\D/g, '');
  } else {
    // Keep + and digits only
    phoneNumber = '+' + phoneNumber.slice(1).replace(/\D/g, '');
  }
  return phoneNumber;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const objectStorageService = new ObjectStorageService();
  const searchApiService = new SearchApiService();
  const triageService = new TriageService();
  const httpServer = createServer(app);
  const ws = setupWebSocket(httpServer);

  /**
   * Run triage analysis for an item after AI insight is completed
   * Updates the item with triage recommendation and broadcasts the full updated item
   * @returns The updated item or null if triage failed/skipped
   */
  async function runTriageForItem(itemId: string, accountId: string): Promise<any | null> {
    try {
      // Get the item to determine image count
      const item = await storage.getItem(itemId, accountId);
      if (!item) {
        console.log(`Item ${itemId} not found, skipping triage`);
        return null;
      }

      // Get all AI insights for this item
      const insights = await storage.getItemAiInsights(itemId, accountId);
      const completedInsights = insights.filter((insight) => insight.status === 'completed');
      
      if (completedInsights.length === 0) {
        console.log(`No completed insights for item ${itemId}, skipping triage`);
        return null;
      }

      // Get image count from item
      const imageCount = item.images?.length || completedInsights.length;

      // Run triage analysis
      const triageResult = triageService.analyzeItem(completedInsights, imageCount);
      
      // Only update if user hasn't manually overridden triage
      // (preserve triageOverride when auto-triage runs)
      if (!item.triageOverride) {
        await storage.updateItem(itemId, accountId, {
          recommendedAction: triageResult.recommendedAction,
          triageConfidence: triageResult.confidence,
          estimatedValue: triageResult.estimatedValue,
          triageReasoning: triageResult.reasoning,
          triageUpdatedAt: new Date(),
        });
      } else {
        // Just update the timestamp if override exists
        await storage.updateItem(itemId, accountId, {
          triageUpdatedAt: new Date(),
        });
      }

      console.log(`Triage completed for item ${itemId}: ${triageResult.recommendedAction} (${triageResult.confidence}% confidence)`);
      
      // Re-fetch the updated item and broadcast it
      const updatedItem = await storage.getItem(itemId, accountId);
      if (updatedItem) {
        ws.broadcast('item:updated', updatedItem);
        return updatedItem;
      }
      
      return null;
    } catch (error) {
      console.error(`Failed to run triage for item ${itemId}:`, error);
      // Don't throw - triage failure shouldn't break the main workflow
      return null;
    }
  }

  // Serve objects from object storage
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Upload file endpoint
  app.post("/api/upload", requireAuth, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      let fileToUpload = req.file;

      // Convert HEIC to JPEG automatically (iPhone photos)
      if (req.file.mimetype === 'image/heic' || req.file.mimetype === 'image/heif' || 
          req.file.originalname.toLowerCase().endsWith('.heic') || 
          req.file.originalname.toLowerCase().endsWith('.heif')) {
        try {
          console.log(`[Upload] Converting HEIC to JPEG: ${req.file.originalname}`);
          
          // Convert HEIC to JPEG
          const jpegBuffer = await heicConvert({
            buffer: req.file.buffer,
            format: 'JPEG',
            quality: 0.92,
          });

          // Optimize with sharp
          const optimizedBuffer = await sharp(jpegBuffer)
            .jpeg({ quality: 90 })
            .toBuffer();

          // Create new file object with JPEG data
          fileToUpload = {
            ...req.file,
            buffer: optimizedBuffer,
            mimetype: 'image/jpeg',
            originalname: req.file.originalname.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg'),
          };
          
          console.log(`[Upload] HEIC conversion successful, size: ${optimizedBuffer.length} bytes`);
        } catch (conversionError) {
          console.error("[Upload] HEIC conversion failed:", conversionError);
          // Fall back to original file if conversion fails
          fileToUpload = req.file;
        }
      }

      // Compute hash of the final image
      const imageHash = computeImageHash(fileToUpload.buffer);
      const url = await objectStorageService.uploadFile(fileToUpload);
      
      res.json({ url, imageHash });
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  // Authentication routes
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { name, email, password } = req.body;

      // Validate input
      if (!name || !email || !password) {
        return res.status(400).json({ error: "Name, email and password are required" });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ error: "Email already registered" });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user
      const user = await storage.createUser({
        name,
        email,
        passwordHash,
      });

      // Create default account (Basic plan)
      const account = await storage.createAccount({
        name: `${name}'s Account`,
        plan: 'basic',
      });

      // Link user to account as owner
      await storage.createAccountMembership({
        userId: user.id,
        accountId: account.id,
        role: 'owner',
      });

      // Set session
      req.session.userId = user.id;
      req.session.accountId = account.id;

      // Explicitly save session before sending response
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      res.status(201).json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        account: {
          id: account.id,
          name: account.name,
          plan: account.plan,
        },
      });
    } catch (error) {
      console.error("Error during signup:", error);
      res.status(500).json({ error: "Failed to create account" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      // Find user
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Verify password
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Get user's accounts
      const accounts = await storage.getUserAccounts(user.id);
      if (accounts.length === 0) {
        return res.status(500).json({ error: "No account found" });
      }

      // Use first account (will add account switching later)
      const account = accounts[0];

      // Set session
      req.session.userId = user.id;
      req.session.accountId = account.id;

      // Explicitly save session before sending response
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        account: {
          id: account.id,
          name: account.name,
          plan: account.plan,
        },
      });
    } catch (error) {
      console.error("Error during login:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const account = await storage.getAccount(req.session.accountId!);

      if (!user || !account) {
        return res.status(404).json({ error: "User or account not found" });
      }

      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        account: {
          id: account.id,
          name: account.name,
          plan: account.plan,
        },
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // AI Agent endpoint with bearer token auth
  app.post("/api/agent", requireBearerToken, async (req, res) => {
    try {
      const { messages } = req.body;

      // Validate messages array
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Messages array is required" });
      }

      if (messages.length === 0) {
        return res.status(400).json({ error: "Messages array cannot be empty" });
      }

      // Initialize OpenAI with Replit AI Integrations
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      // Call OpenAI Chat Completions API
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000,
      });

      // Extract response
      const response = completion.choices[0]?.message?.content || "";

      res.json({ response });
    } catch (error: any) {
      console.error("Error processing agent request:", error);
      res.status(500).json({ 
        error: "Failed to process request",
        details: error.message 
      });
    }
  });

  // Items endpoints
  app.get("/api/items", requireAuth, async (req, res) => {
    try {
      const accountId = await getSessionAccount(req);
      const status = req.query.status as string | undefined;
      const items = await storage.getItems(accountId, status ? { status } : undefined);
      res.json(items);
    } catch (error) {
      console.error("Error fetching items:", error);
      res.status(500).json({ error: "Failed to fetch items" });
    }
  });

  app.get("/api/items/:id", requireAuth, async (req, res) => {
    try {
      const accountId = await getSessionAccount(req);
      const item = await storage.getItem(req.params.id, accountId);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Error fetching item:", error);
      res.status(500).json({ error: "Failed to fetch item" });
    }
  });

  app.post("/api/items", requireAuth, checkItemLimit(storage), async (req, res) => {
    try {
      const accountId = await getSessionAccount(req);
      const validatedData = insertItemSchema.parse({ ...req.body, accountId });
      let item = await storage.createItem(validatedData);
      
      // Link pre-item AI insights to this item by matching image hashes
      if (item.images && item.images.length > 0) {
        for (const imageUrl of item.images) {
          // Extract hash from image URL (format: /objects/public/{hash}_{timestamp}.ext)
          // Case-insensitive to handle both lowercase and uppercase hashes
          const match = imageUrl.match(/\/([A-Fa-f0-9]{64})_/i);
          if (match) {
            const imageHash = match[1].toLowerCase(); // Normalize to lowercase for storage lookup
            const existingInsight = await storage.findAiInsightByHash(accountId, imageHash);
            
            if (existingInsight && !existingInsight.itemId) {
              // Link this insight to the new item
              await storage.updateAiInsight(existingInsight.analysisRunId, {
                itemId: item.id,
                triggerStage: 'post_item',
              });
              console.log(`Linked AI insight ${existingInsight.analysisRunId} to item ${item.id}`);
            }
          }
        }
        
        // Run triage analysis after linking insights
        // This will also broadcast item:updated with full triage data
        const triageItem = await runTriageForItem(item.id, accountId);
        if (triageItem) {
          item = triageItem;
        }
      }
      
      // Track usage for subscription billing
      try {
        const month = getCurrentMonthKey();
        await storage.incrementUsage(accountId, month, 'itemsCreated');
      } catch (usageError) {
        console.error("Error tracking usage:", usageError);
        // Don't fail the request if usage tracking fails
      }
      
      ws.broadcast('item:created', item);
      res.status(201).json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating item:", error);
      res.status(500).json({ error: "Failed to create item" });
    }
  });

  app.patch("/api/items/:id", requireAuth, async (req, res) => {
    try {
      const accountId = await getSessionAccount(req);
      const validatedData = insertItemSchema.partial().parse(req.body);
      const item = await storage.updateItem(req.params.id, accountId, validatedData);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      ws.broadcast('item:updated', item);
      res.json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error updating item:", error);
      res.status(500).json({ error: "Failed to update item" });
    }
  });

  app.delete("/api/items/:id", requireAuth, async (req, res) => {
    try {
      const accountId = await getSessionAccount(req);
      const deleted = await storage.deleteItem(req.params.id, accountId);
      if (!deleted) {
        return res.status(404).json({ error: "Item not found" });
      }
      ws.broadcast('item:deleted', { id: req.params.id });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting item:", error);
      res.status(500).json({ error: "Failed to delete item" });
    }
  });

  // Triage Override endpoint
  app.patch("/api/items/:id/triage-override", requireAuth, async (req, res) => {
    try {
      const accountId = await getSessionAccount(req);
      const { triageOverride, triageOverrideReason } = req.body;

      // Validate override action
      const validActions = ['post_now', 'clean_and_post', 'skip'];
      if (!triageOverride || !validActions.includes(triageOverride)) {
        return res.status(400).json({ 
          error: "Invalid triageOverride. Must be one of: post_now, clean_and_post, skip" 
        });
      }

      // Reason is optional but recommended
      const updates = {
        triageOverride,
        triageOverrideReason: triageOverrideReason || null,
        triageUpdatedAt: new Date(),
      };

      const item = await storage.updateItem(req.params.id, accountId, updates);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      ws.broadcast('item:updated', item);
      res.json(item);
    } catch (error) {
      console.error("Error updating triage override:", error);
      res.status(500).json({ error: "Failed to update triage override" });
    }
  });

  // Triage preview endpoint (for manual workflow before item creation)
  app.post('/api/ai/triage-preview', requireAuth, async (req, res) => {
    try {
      const { insights, imageCount } = req.body;
      
      if (!insights || !Array.isArray(insights) || !imageCount) {
        return res.status(400).json({ error: 'insights (array) and imageCount required' });
      }
      
      const triageService = new TriageService();
      const result = triageService.analyzeItem(insights, imageCount);
      
      res.json(result);
    } catch (error) {
      console.error('Triage preview error:', error);
      res.status(500).json({ error: 'Triage preview failed' });
    }
  });

  // AI Image Analysis endpoint
  app.post("/api/ai/analyze-image", requireAuth, async (req, res) => {
    try {
      const accountId = await getSessionAccount(req);
      const { imageUrl, imageHash, forceRefresh } = req.body;

      if (!imageUrl || !imageHash) {
        return res.status(400).json({ error: "imageUrl and imageHash are required" });
      }

      // Check if we already have analysis for this image hash
      if (!forceRefresh) {
        const existing = await storage.findAiInsightByHash(accountId, imageHash);
        if (existing && existing.status === 'completed') {
          return res.json(existing);
        }
      }

      // Generate unique analysis run ID
      const analysisRunId = crypto.randomUUID();

      // Create or update insight record (processing state)
      const insight = await storage.upsertAiInsight({
        accountId,
        imageUrl,
        imageHash,
        analysisRunId,
        source: 'manual',
        triggerStage: 'pre_item',
        status: 'processing',
      });

      // Convert relative URL to full public URL for SearchAPI.io
      let fullImageUrl = imageUrl;
      if (imageUrl.startsWith('/')) {
        const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
        const host = req.headers.host || 'localhost:5000';
        fullImageUrl = `${protocol}://${host}${imageUrl}`;
      }

      // Perform SearchAPI analysis with full URL
      const analysisResult = await searchApiService.analyzeImage(fullImageUrl);
      
      // Update insight with results
      const updatedInsight = await storage.updateAiInsight(analysisRunId, {
        labels: analysisResult.labels as any,
        webEntities: analysisResult.webEntities as any,
        dominantColors: analysisResult.dominantColors as any,
        suggestedTitle: analysisResult.suggestedTitle,
        suggestedDescription: analysisResult.suggestedDescription,
        suggestedCategory: analysisResult.suggestedCategory,
        suggestedPrice: analysisResult.suggestedPrice,
        status: analysisResult.status as "processing" | "completed" | "failed" | "stale",
        error: analysisResult.error,
        processedAt: new Date(),
      });

      if (!updatedInsight) {
        throw new Error('Failed to update insight after analysis');
      }

      // If this insight is linked to an item, re-run triage
      if (updatedInsight.itemId) {
        await runTriageForItem(updatedInsight.itemId, accountId);
      }

      res.json(updatedInsight);
    } catch (error) {
      console.error("Error analyzing image:", error);
      res.status(500).json({ error: "Failed to analyze image" });
    }
  });

  // Phone Number Management endpoints
  app.get("/api/phone-numbers", requireAuth, async (req, res) => {
    try {
      const phoneNumbers = await storage.getPhoneNumbers();
      res.json(phoneNumbers);
    } catch (error) {
      console.error("Error fetching phone numbers:", error);
      res.status(500).json({ error: "Failed to fetch phone numbers" });
    }
  });

  app.post("/api/phone-numbers", requireAuth, async (req, res) => {
    try {
      let { phoneNumber, telnyxPhoneNumberId, messagingProfileId } = req.body;
      
      if (!phoneNumber) {
        return res.status(400).json({ error: "phoneNumber is required" });
      }

      // Normalize to E.164 format
      phoneNumber = normalizePhoneNumber(phoneNumber);

      const newPhoneNumber = await storage.createPhoneNumber({
        phoneNumber,
        telnyxPhoneNumberId,
        messagingProfileId,
        status: 'active',
      });
      
      res.status(201).json(newPhoneNumber);
    } catch (error) {
      console.error("Error creating phone number:", error);
      res.status(500).json({ error: "Failed to create phone number" });
    }
  });

  app.patch("/api/phone-numbers/:phoneNumber/assign", requireAuth, async (req, res) => {
    try {
      const accountId = await getSessionAccount(req);
      const phoneNumber = normalizePhoneNumber(req.params.phoneNumber);
      
      const updated = await storage.assignPhoneNumber(phoneNumber, accountId);
      if (!updated) {
        return res.status(404).json({ error: "Phone number not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error assigning phone number:", error);
      res.status(500).json({ error: "Failed to assign phone number" });
    }
  });

  app.patch("/api/phone-numbers/:phoneNumber/unassign", requireAuth, async (req, res) => {
    try {
      const phoneNumber = normalizePhoneNumber(req.params.phoneNumber);
      
      const updated = await storage.unassignPhoneNumber(phoneNumber);
      if (!updated) {
        return res.status(404).json({ error: "Phone number not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error unassigning phone number:", error);
      res.status(500).json({ error: "Failed to unassign phone number" });
    }
  });

  // SMS endpoints
  app.get("/api/sms/messages", requireAuth, async (req, res) => {
    try {
      const accountId = await getSessionAccount(req);
      const messages = await storage.getSmsMessages(accountId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching SMS messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Telnyx webhook endpoint (public - no auth required)
  app.post("/api/sms/webhook", async (req, res) => {
    // Always return 200 to Telnyx to prevent retries (wrap entire handler)
    try {
      const event = req.body;

      // Telnyx message.received event
      if (event.data?.event_type === 'message.received') {
        try {
          const payload = event.data.payload;
          const toNumber = normalizePhoneNumber(payload.to[0].phone_number);

          // Look up phone number to find account (SaaS multi-tenant routing)
          const phoneNumberRecord = await storage.getPhoneNumber(toNumber);
          if (!phoneNumberRecord || !phoneNumberRecord.accountId) {
            console.error(`Phone number ${toNumber} not assigned to any account - message ignored`);
            return res.status(200).json({ 
              received: true, 
              status: "ignored",
              message: "Phone number not assigned to any account" 
            });
          }

          const accountId = phoneNumberRecord.accountId;
          
          // Check SMS and item limits (enforce plan restrictions for webhooks)
          const smsLimitResult = await checkLimit(storage, accountId, 'sms');
          const itemLimitResult = await checkLimit(storage, accountId, 'items');
          
          if (!smsLimitResult.allowed) {
            console.log(`SMS limit reached for account ${accountId} (${smsLimitResult.current}/${smsLimitResult.limit})`);
            return res.status(200).json({ 
              received: true, 
              status: "limit_reached",
              message: `SMS limit reached for ${smsLimitResult.plan} plan` 
            });
          }
          
          if (!itemLimitResult.allowed) {
            console.log(`Item limit reached for account ${accountId} (${itemLimitResult.current}/${itemLimitResult.limit})`);
            return res.status(200).json({ 
              received: true, 
              status: "limit_reached",
              message: `Item limit reached for ${itemLimitResult.plan} plan` 
            });
          }
          
          // Create SMS message record
          const smsMessage = await storage.createSmsMessage({
            accountId,
            messageId: payload.id,
            fromNumber: payload.from.phone_number,
            toNumber: toNumber,
            body: payload.text || null,
            mediaUrls: payload.media?.map((m: any) => m.url) || [],
            processed: 0,
          });

          // Auto-create item from SMS if there's content
          if (payload.text || (payload.media && payload.media.length > 0)) {
            try {
            // Download and save MMS media to object storage with hash computation
            const savedImageUrls: string[] = [];
            const imageHashes: string[] = [];
            
            if (payload.media && payload.media.length > 0) {
              for (const mediaItem of payload.media) {
                try {
                  // Download image from Telnyx (ephemeral URL - must save immediately)
                  const response = await fetch(mediaItem.url);
                  if (response.ok) {
                    const buffer = Buffer.from(await response.arrayBuffer());
                    const contentType = response.headers.get('content-type') || 'image/jpeg';
                    
                    // Compute SHA-256 hash for deduplication
                    const imageHash = computeImageHash(buffer);
                    imageHashes.push(imageHash);
                    
                    // Determine file extension
                    const extension = contentType.split('/')[1] || 'jpg';
                    
                    // Save to object storage
                    const savedUrl = await objectStorageService.uploadFile({
                      buffer,
                      mimetype: contentType,
                      originalname: `sms-image-${imageHash.slice(0, 8)}.${extension}`,
                    } as Express.Multer.File);
                    
                    savedImageUrls.push(savedUrl);
                  }
                } catch (error) {
                  console.error("Error downloading MMS media:", error);
                }
              }
            }
            
            // Parse SMS text for item details
            const text = payload.text || "";
            const lines = text.split('\n').filter((l: string) => l.trim());
            
            // Simple parsing: first line is title, rest is description
            const title = lines[0] || "Item from SMS";
            const description = lines.slice(1).join('\n') || "No description provided";
            
            // Default price - user can edit later
            const price = 1000; // $10.00 default

            const item = await storage.createItem({
              accountId,
              title,
              description,
              price,
              condition: "Good",
              category: "Uncategorized",
              images: savedImageUrls,
              status: "draft",
              source: "sms",
              phoneNumber: payload.from.phone_number,
            });

            // Mark message as processed and link to item
            await storage.updateSmsMessage(smsMessage.id, {
              processed: 1,
              itemId: item.id,
            });

            // Track usage for subscription billing (both SMS received and item created)
            try {
              const month = getCurrentMonthKey();
              await storage.incrementUsage(accountId, month, 'smsReceived');
              await storage.incrementUsage(accountId, month, 'itemsCreated');
            } catch (usageError) {
              console.error("Error tracking SMS usage:", usageError);
              // Don't fail the webhook if usage tracking fails
            }

            // Trigger post-creation AI analysis for each image (background process)
            if (savedImageUrls.length > 0 && imageHashes.length > 0) {
              for (let i = 0; i < savedImageUrls.length; i++) {
                const imageUrl = savedImageUrls[i];
                const imageHash = imageHashes[i];
                
                // Check if we already analyzed this image hash
                const existingInsight = await storage.findAiInsightByHash(accountId, imageHash);
                if (existingInsight && existingInsight.status === 'completed') {
                  // Create a new insight record linked to this item with the same analysis results
                  const analysisRunId = crypto.randomUUID();
                  await storage.upsertAiInsight({
                    accountId,
                    itemId: item.id,
                    imageUrl,
                    imageHash,
                    analysisRunId,
                    source: 'sms',
                    triggerStage: 'post_item',
                    status: 'completed',
                    labels: existingInsight.labels as any,
                    webEntities: existingInsight.webEntities as any,
                    dominantColors: existingInsight.dominantColors as any,
                    suggestedTitle: existingInsight.suggestedTitle,
                    suggestedDescription: existingInsight.suggestedDescription,
                    suggestedCategory: existingInsight.suggestedCategory,
                  });
                  await storage.updateAiInsight(analysisRunId, {
                    processedAt: new Date(),
                  });
                  console.log(`Reused existing AI analysis for SMS item ${item.id}, image ${i + 1}`);
                  
                  // Run triage since we have a completed insight
                  await runTriageForItem(item.id, accountId);
                } else {
                  // Trigger new async AI analysis (don't await - background process)
                  const analysisRunId = crypto.randomUUID();
                  
                  // Create processing record
                  storage.upsertAiInsight({
                    accountId,
                    itemId: item.id,
                    imageUrl,
                    imageHash,
                    analysisRunId,
                    source: 'sms',
                    triggerStage: 'post_item',
                    status: 'processing',
                  }).then(() => {
                    // Perform analysis
                    return searchApiService.analyzeImage(imageUrl);
                  }).then((analysisResult) => {
                    // Update with results
                    return storage.updateAiInsight(analysisRunId, {
                      labels: analysisResult.labels as any,
                      webEntities: analysisResult.webEntities as any,
                      dominantColors: analysisResult.dominantColors as any,
                      suggestedTitle: analysisResult.suggestedTitle,
                      suggestedDescription: analysisResult.suggestedDescription,
                      suggestedCategory: analysisResult.suggestedCategory,
                      suggestedPrice: analysisResult.suggestedPrice,
                      status: analysisResult.status as "processing" | "completed" | "failed" | "stale",
                      error: analysisResult.error,
                      processedAt: new Date(),
                    });
                  }).then(async (updatedInsight) => {
                    console.log(`AI analysis completed for SMS item ${item.id}, image ${i + 1}`);
                    // Broadcast update when AI completes
                    ws.broadcast('item:ai-analyzed', { itemId: item.id, insight: updatedInsight });
                    
                    // Run triage analysis after AI completes
                    await runTriageForItem(item.id, accountId);
                  }).catch((error) => {
                    console.error(`AI analysis failed for SMS item ${item.id}:`, error);
                  });
                }
              }
            }

              // Broadcast real-time update
              ws.broadcast('sms:received', { message: smsMessage, item });
            } catch (error) {
              console.error("Error creating item from SMS:", error);
              // Continue to return 200 even if item creation fails
            }
          }
        } catch (error) {
          console.error("Error processing message:", error);
          // Continue to return 200 even if message processing fails
        }
      }

      res.status(200).json({ received: true, status: "ok" });
    } catch (error) {
      console.error("Error processing SMS webhook:", error);
      // Even on catastrophic failure, return 200 to prevent Telnyx retries
      res.status(200).json({ received: true, status: "error", message: "Internal error" });
    }
  });

  // ===== SUBSCRIPTION ROUTES =====
  
  // Get current user's subscription
  app.get("/api/subscriptions/current", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const accountId = await getSessionAccount(req);
      
      const subscription = await storage.getSubscription(userId, accountId);
      
      // Get usage data by accountId (works for both free and paid tiers)
      const month = getCurrentMonthKey();
      const usage = await storage.getSubscriptionUsage(accountId, month);
      
      // Return null for users without subscription (free tier still gets usage data)
      if (!subscription) {
        return res.json({ 
          subscription: null, 
          usage: usage || { itemsCreated: 0, smsReceived: 0 } 
        });
      }
      
      res.json({ subscription, usage: usage || { itemsCreated: 0, smsReceived: 0 } });
    } catch (error: any) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get subscription usage statistics
  app.get("/api/subscriptions/usage", requireAuth, async (req: Request, res: Response) => {
    try {
      const accountId = await getSessionAccount(req);
      const month = getCurrentMonthKey();
      const usage = await storage.getSubscriptionUsage(accountId, month);
      
      res.json({
        itemsCreated: usage?.itemsCreated || 0,
        smsReceived: usage?.smsReceived || 0,
        month,
      });
    } catch (error: any) {
      console.error("Error fetching usage:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Initiate subscription signup (Three-Step Redirect)
  app.post("/api/subscriptions/initiate", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const accountId = await getSessionAccount(req);
      const { plan } = req.body;

      if (!plan || !['starter', 'pro', 'business'].includes(plan)) {
        return res.status(400).json({ error: "Invalid plan" });
      }

      // Check if user already has a subscription
      const existingSubscription = await storage.getSubscription(userId, accountId);
      if (existingSubscription && existingSubscription.status === 'active') {
        return res.status(400).json({ error: "User already has an active subscription" });
      }

      // Get user info
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Generate secure nonce for callback verification
      const nonce = crypto.randomBytes(32).toString('hex');
      
      // Calculate expiration (1 hour from now)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      // Store subscription intent before redirecting to NMI
      const intent = await storage.createSubscriptionIntent({
        nonce,
        userId,
        accountId,
        plan: plan as 'starter' | 'pro' | 'business',
        expiresAt,
      });

      const nmiService = getNMIService();
      const redirectUrl = `${req.protocol}://${req.get('host')}/api/subscriptions/callback`;

      const result = await nmiService.initiateSubscription({
        userId,
        accountId,
        plan,
        customerEmail: user.email,
        customerName: user.name || user.email,
        redirectUrl,
        nonce, // Pass nonce to NMI for callback verification
      });

      // Update intent with NMI token ID for correlation
      await storage.updateSubscriptionIntent(intent.id, { nmiTokenId: result.tokenId });

      res.json(result);
    } catch (error: any) {
      console.error("Error initiating subscription:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Handle NMI callback after payment (SECURED with nonce verification)
  // NMI sends callbacks via POST with form data
  app.post("/api/subscriptions/callback", async (req: Request, res: Response) => {
    try {
      // Parse NMI callback from POST body (not query params)
      const callbackData = new URLSearchParams();
      for (const [key, value] of Object.entries(req.body)) {
        callbackData.set(key, String(value));
      }
      
      // Extract nonce from NMI callback (passed via order_id)
      const nonce = callbackData.get('order_id') || callbackData.get('orderid');
      if (!nonce) {
        console.error("Missing nonce in callback");
        return res.redirect('/settings?subscription=error');
      }

      // Verify nonce exists and retrieve subscription intent
      const intent = await storage.getSubscriptionIntentByNonce(nonce);
      if (!intent) {
        console.error("Invalid or expired nonce:", nonce);
        return res.redirect('/settings?subscription=error');
      }

      // Check intent hasn't expired
      if (new Date() > new Date(intent.expiresAt)) {
        console.error("Subscription intent expired:", nonce);
        return res.redirect('/settings?subscription=error');
      }

      // Parse NMI callback
      const nmiService = getNMIService();
      const result = nmiService.parseCallback(callbackData);

      if (result.success && result.customerVaultId && result.subscriptionId) {
        // Verify payment succeeded
        console.log(`Subscription payment succeeded for nonce: ${nonce}`);

        // Calculate billing period (14-day trial + 1 month)
        const currentPeriodStart = new Date();
        const currentPeriodEnd = new Date();
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
        
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 14); // 14-day trial

        // Create subscription record (idempotent via unique constraint on accountId)
        try {
          await storage.createSubscription({
            userId: intent.userId,
            accountId: intent.accountId,
            plan: intent.plan as 'free' | 'starter' | 'pro' | 'business',
            status: 'trialing', // Start in trial
            nmiCustomerVaultId: result.customerVaultId,
            nmiSubscriptionId: result.subscriptionId,
            currentPeriodStart,
            currentPeriodEnd,
            trialEndsAt,
            cancelAtPeriodEnd: 0,
          });

          // Mark intent as completed to prevent reuse
          await storage.markIntentCompleted(nonce);

          console.log(`Subscription created for account ${intent.accountId}, plan: ${intent.plan}`);
          res.redirect('/settings?subscription=success');
        } catch (error: any) {
          // Handle duplicate subscription error (idempotency)
          if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
            console.log("Duplicate subscription callback - already processed:", nonce);
            await storage.markIntentCompleted(nonce);
            res.redirect('/settings?subscription=success');
          } else {
            throw error;
          }
        }
      } else {
        // Payment failed
        console.error("Subscription payment failed:", result.error);
        res.redirect('/settings?subscription=failed');
      }
    } catch (error: any) {
      console.error("Error processing subscription callback:", error);
      res.redirect('/settings?subscription=error');
    }
  });

  // Cancel subscription
  app.post("/api/subscriptions/cancel", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const accountId = await getSessionAccount(req);

      const subscription = await storage.getSubscription(userId, accountId);
      if (!subscription) {
        return res.status(404).json({ error: "No subscription found" });
      }

      if (subscription.status === 'canceled') {
        return res.status(400).json({ error: "Subscription already canceled" });
      }

      // Cancel with NMI
      if (subscription.nmiSubscriptionId) {
        const nmiService = getNMIService();
        await nmiService.cancelNMISubscription(subscription.nmiSubscriptionId);
      }

      // Update local subscription
      await storage.cancelSubscription(subscription.id);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error canceling subscription:", error);
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
