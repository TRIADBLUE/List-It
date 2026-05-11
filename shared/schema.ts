import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, index, uniqueIndex, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table - authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Accounts table - separate businesses/inventories
export const accounts = pgTable("accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  plan: text("plan").notNull().default('basic'), // basic, team, multi_business
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Account memberships - many-to-many relationship between users and accounts
export const accountMemberships = pgTable("account_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  accountId: varchar("account_id").notNull().references(() => accounts.id),
  role: text("role").notNull().default('member'), // owner, member
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  // Unique constraint: a user can only have one membership per account
  uniqueUserAccount: sql`UNIQUE (${table.userId}, ${table.accountId})`,
}));

// Items table - storage unit items (now with account association)
export const items = pgTable("items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().default(sql`gen_random_uuid()`).references(() => accounts.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  price: integer("price").notNull(), // Price in cents
  condition: text("condition").notNull(), // New, Like New, Good, Fair, Poor
  category: text("category").notNull(),
  images: text("images").array().notNull().default(sql`ARRAY[]::text[]`),
  status: text("status").notNull().default('draft'), // draft, posted, sold
  source: text("source").notNull().default('manual'), // sms, manual
  phoneNumber: text("phone_number"), // SMS source phone number
  
  // AI triage recommendation fields
  recommendedAction: text("recommended_action"), // post_now, clean_and_post, skip, insufficient_data
  triageConfidence: integer("triage_confidence"), // 0-100
  estimatedValue: integer("estimated_value"), // Estimated market value in cents
  triageReasoning: text("triage_reasoning"), // Explanation for the recommendation
  triageOverride: text("triage_override"), // User's manual override (null = use auto)
  triageOverrideReason: text("triage_override_reason"), // Why user overrode
  triageUpdatedAt: timestamp("triage_updated_at"), // Last triage calculation
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  postedAt: timestamp("posted_at"),
});

// SMS messages table - tracking incoming messages (now with account association)
export const smsMessages = pgTable("sms_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().default(sql`gen_random_uuid()`).references(() => accounts.id),
  messageId: text("message_id").notNull().unique(), // Telnyx message ID
  fromNumber: text("from_number").notNull(),
  toNumber: text("to_number").notNull(),
  body: text("body"),
  mediaUrls: text("media_urls").array().default(sql`ARRAY[]::text[]`),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
  processed: integer("processed").notNull().default(0), // 0 = pending, 1 = processed
  itemId: varchar("item_id").references(() => items.id),
});

// Phone Numbers table - SaaS provisioned numbers for multi-tenant SMS
export const phoneNumbers = pgTable("phone_numbers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").references(() => accounts.id), // null = unassigned
  phoneNumber: text("phone_number").notNull().unique(), // E.164 format: +15551234567
  telnyxPhoneNumberId: text("telnyx_phone_number_id"), // Telnyx's internal ID
  messagingProfileId: text("messaging_profile_id"), // Telnyx messaging profile ID
  status: text("status").notNull().default('active'), // active, inactive
  assignedAt: timestamp("assigned_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  accountIdx: index("phone_numbers_account_idx").on(table.accountId),
}));

// AI Insights table - Google Vision API analysis results
export const itemAiInsights = pgTable("item_ai_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").references(() => items.id),
  accountId: varchar("account_id").notNull().default(sql`gen_random_uuid()`).references(() => accounts.id),
  imageUrl: text("image_url").notNull(),
  imageHash: text("image_hash").notNull(), // SHA256 hash for deduplication
  analysisRunId: text("analysis_run_id").notNull().unique(), // Unique identifier per analysis
  source: text("source").notNull(), // 'manual' | 'sms'
  triggerStage: text("trigger_stage").notNull(), // 'pre_item' | 'post_item'
  labels: jsonb("labels"), // Array of {description, score, confidence}
  webEntities: jsonb("web_entities"), // Product matches and descriptions
  dominantColors: jsonb("dominant_colors"), // Color palette
  contentSignature: jsonb("content_signature"), // Normalized fields for cross-image dedupe
  suggestedTitle: text("suggested_title"),
  suggestedDescription: text("suggested_description"),
  suggestedCategory: text("suggested_category"),
  suggestedPrice: integer("suggested_price"), // Price in cents
  decisions: jsonb("decisions"), // Per-field { value, status: 'pending'|'accepted'|'rejected', decidedBy, decidedAt }
  status: text("status").notNull().default('processing'), // 'processing' | 'completed' | 'failed' | 'stale'
  error: text("error"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  accountItemIdx: index("item_ai_insights_account_item_idx").on(table.accountId, table.itemId),
  accountHashUniq: uniqueIndex("item_ai_insights_account_hash_uniq").on(table.accountId, table.imageHash),
  analysisRunIdx: index("item_ai_insights_analysis_run_idx").on(table.analysisRunId),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertAccountSchema = createInsertSchema(accounts).omit({
  id: true,
  createdAt: true,
}).extend({
  plan: z.enum(['basic', 'team', 'multi_business']).optional(),
});

export const insertAccountMembershipSchema = createInsertSchema(accountMemberships).omit({
  id: true,
  createdAt: true,
}).extend({
  role: z.enum(['owner', 'member']).optional(),
});

export const insertItemSchema = createInsertSchema(items).omit({
  id: true,
  createdAt: true,
  postedAt: true,
}).extend({
  price: z.number().int().positive(),
  condition: z.enum(['New', 'Like New', 'Good', 'Fair', 'Poor']),
  status: z.enum(['draft', 'posted', 'sold']).optional(),
  source: z.enum(['sms', 'manual']).optional(),
});

export const itemUpdateSchema = insertItemSchema.pick({
  title: true,
  description: true,
  price: true,
  condition: true,
  category: true,
  status: true,
});

export const insertSmsMessageSchema = createInsertSchema(smsMessages).omit({
  id: true,
  receivedAt: true,
});

export const insertPhoneNumberSchema = createInsertSchema(phoneNumbers).omit({
  id: true,
  createdAt: true,
  assignedAt: true,
}).extend({
  status: z.enum(['active', 'inactive']).optional(),
});

export const insertItemAiInsightSchema = createInsertSchema(itemAiInsights).omit({
  id: true,
  createdAt: true,
  processedAt: true,
}).extend({
  source: z.enum(['manual', 'sms']),
  triggerStage: z.enum(['pre_item', 'post_item']),
  status: z.enum(['processing', 'completed', 'failed', 'stale']).optional(),
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accounts.$inferSelect;
export type InsertAccountMembership = z.infer<typeof insertAccountMembershipSchema>;
export type AccountMembership = typeof accountMemberships.$inferSelect;
export type InsertItem = z.infer<typeof insertItemSchema>;
export type UpdateItem = z.infer<typeof itemUpdateSchema>;
export type Item = typeof items.$inferSelect;
export type InsertSmsMessage = z.infer<typeof insertSmsMessageSchema>;
export type SmsMessage = typeof smsMessages.$inferSelect;
export type InsertPhoneNumber = z.infer<typeof insertPhoneNumberSchema>;
export type PhoneNumber = typeof phoneNumbers.$inferSelect;
export type InsertItemAiInsight = z.infer<typeof insertItemAiInsightSchema>;
export type ItemAiInsight = typeof itemAiInsights.$inferSelect;

// Subscriptions table - user subscription management
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  accountId: varchar("account_id").notNull().references(() => accounts.id),
  plan: text("plan").notNull().default('free'), // free, starter, pro, business
  status: text("status").notNull().default('trialing'), // trialing, active, past_due, canceled, paused
  nmiCustomerVaultId: text("nmi_customer_vault_id"), // Encrypted vault ID for payment method
  nmiSubscriptionId: text("nmi_subscription_id"), // NMI's subscription ID
  currentPeriodStart: timestamp("current_period_start").notNull().defaultNow(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  cancelAtPeriodEnd: integer("cancel_at_period_end").notNull().default(0), // 0=false, 1=true
  trialEndsAt: timestamp("trial_ends_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userAccountIdx: index("subscriptions_user_account_idx").on(table.userId, table.accountId),
  uniqueAccountSubscription: unique("subscriptions_account_uniq").on(table.accountId),
}));

// Subscription Intents table - track pending subscription signups before NMI callback
export const subscriptionIntents = pgTable("subscription_intents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nonce: varchar("nonce").notNull().unique(), // Secure random token for callback verification
  userId: varchar("user_id").notNull().references(() => users.id),
  accountId: varchar("account_id").notNull().references(() => accounts.id),
  plan: text("plan").notNull(), // Intended plan: starter, pro, business
  nmiTokenId: text("nmi_token_id"), // NMI's Three-Step token ID
  completed: integer("completed").notNull().default(0), // 0=pending, 1=completed/consumed
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(), // Intent expires after 1 hour
}, (table) => ({
  nonceIdx: uniqueIndex("subscription_intents_nonce_uniq").on(table.nonce),
}));

// Subscription Usage table - track usage per billing period
export const subscriptionUsage = pgTable("subscription_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subscriptionId: varchar("subscription_id").references(() => subscriptions.id), // Nullable for free tier
  accountId: varchar("account_id").notNull().references(() => accounts.id), // Always present
  month: text("month").notNull(), // YYYY-MM format
  itemsCreated: integer("items_created").notNull().default(0),
  smsReceived: integer("sms_received").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  accountMonthIdx: uniqueIndex("subscription_usage_account_month_uniq").on(table.accountId, table.month),
}));

// Subscription insert schemas
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
}).extend({
  plan: z.enum(['free', 'starter', 'pro', 'business']).optional(),
  status: z.enum(['trialing', 'active', 'past_due', 'canceled', 'paused']).optional(),
});

export const insertSubscriptionIntentSchema = createInsertSchema(subscriptionIntents).omit({
  id: true,
  createdAt: true,
}).extend({
  plan: z.enum(['starter', 'pro', 'business']),
});

export const insertSubscriptionUsageSchema = createInsertSchema(subscriptionUsage).omit({
  id: true,
  createdAt: true,
});

// Subscription types
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscriptionIntent = z.infer<typeof insertSubscriptionIntentSchema>;
export type SubscriptionIntent = typeof subscriptionIntents.$inferSelect;
export type InsertSubscriptionUsage = z.infer<typeof insertSubscriptionUsageSchema>;
export type SubscriptionUsage = typeof subscriptionUsage.$inferSelect;

// Marketplace formatting helpers
export interface MarketplaceListing {
  ebay: string;
  facebook: string;
  craigslist: string;
}
