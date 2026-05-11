import { eq, desc, and, sql } from "drizzle-orm";
import { db } from "./db";
import {
  type Item,
  type InsertItem,
  type SmsMessage,
  type InsertSmsMessage,
  type User,
  type InsertUser,
  type Account,
  type InsertAccount,
  type AccountMembership,
  type InsertAccountMembership,
  type PhoneNumber,
  type InsertPhoneNumber,
  type ItemAiInsight,
  type InsertItemAiInsight,
  type Subscription,
  type InsertSubscription,
  type SubscriptionIntent,
  type InsertSubscriptionIntent,
  type SubscriptionUsage,
  type InsertSubscriptionUsage,
  items,
  smsMessages,
  users,
  accounts,
  accountMemberships,
  phoneNumbers,
  itemAiInsights,
  subscriptions,
  subscriptionIntents,
  subscriptionUsage,
} from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Accounts
  getAccount(id: string): Promise<Account | undefined>;
  createAccount(account: InsertAccount): Promise<Account>;
  getUserAccounts(userId: string): Promise<Account[]>;
  
  // Account Memberships
  createAccountMembership(membership: InsertAccountMembership): Promise<AccountMembership>;
  getAccountMembers(accountId: string): Promise<User[]>;
  
  // Items - require accountId for security
  getItems(accountId: string, filters?: { status?: string }): Promise<Item[]>;
  getItem(id: string, accountId: string): Promise<Item | undefined>;
  createItem(item: InsertItem): Promise<Item>;
  updateItem(id: string, accountId: string, updates: Partial<InsertItem>): Promise<Item | undefined>;
  deleteItem(id: string, accountId: string): Promise<boolean>;
  
  // SMS Messages
  getSmsMessages(accountId?: string): Promise<SmsMessage[]>;
  getSmsMessage(messageId: string): Promise<SmsMessage | undefined>;
  createSmsMessage(message: InsertSmsMessage): Promise<SmsMessage>;
  updateSmsMessage(id: string, updates: Partial<InsertSmsMessage>): Promise<SmsMessage | undefined>;
  
  // Phone Numbers
  getPhoneNumbers(): Promise<PhoneNumber[]>;
  getPhoneNumber(phoneNumber: string): Promise<PhoneNumber | undefined>;
  getPhoneNumbersByAccount(accountId: string): Promise<PhoneNumber[]>;
  createPhoneNumber(phoneNumber: InsertPhoneNumber): Promise<PhoneNumber>;
  assignPhoneNumber(phoneNumber: string, accountId: string): Promise<PhoneNumber | undefined>;
  unassignPhoneNumber(phoneNumber: string): Promise<PhoneNumber | undefined>;
  
  // AI Insights
  createAiInsight(insight: InsertItemAiInsight): Promise<ItemAiInsight>;
  getLatestAiInsight(imageUrl: string, accountId: string): Promise<ItemAiInsight | undefined>;
  getItemAiInsights(itemId: string, accountId: string): Promise<ItemAiInsight[]>;
  findAiInsightByHash(accountId: string, imageHash: string): Promise<ItemAiInsight | undefined>;
  upsertAiInsight(insight: InsertItemAiInsight): Promise<ItemAiInsight>;
  linkAiInsightToItem(analysisRunId: string, itemId: string): Promise<void>;
  markAiInsightProcessed(analysisRunId: string, updates: {
    status: 'completed' | 'failed' | 'stale';
    processedAt: Date;
    decisions?: any;
    error?: string;
  }): Promise<void>;
  updateAiInsight(analysisRunId: string, updates: Partial<ItemAiInsight>): Promise<ItemAiInsight | undefined>;
  
  // Subscriptions
  getSubscription(userId: string, accountId: string): Promise<Subscription | undefined>;
  getSubscriptionById(id: string): Promise<Subscription | undefined>;
  getSubscriptionByAccountId(accountId: string): Promise<Subscription | undefined>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  updateSubscription(id: string, updates: Partial<InsertSubscription>): Promise<Subscription | undefined>;
  cancelSubscription(id: string): Promise<Subscription | undefined>;
  
  // Subscription Intents
  createSubscriptionIntent(intent: InsertSubscriptionIntent): Promise<SubscriptionIntent>;
  getSubscriptionIntentByNonce(nonce: string): Promise<SubscriptionIntent | undefined>;
  updateSubscriptionIntent(id: string, updates: Partial<InsertSubscriptionIntent>): Promise<SubscriptionIntent | undefined>;
  markIntentCompleted(nonce: string): Promise<void>;
  cleanupExpiredIntents(): Promise<void>;
  
  // Subscription Usage
  getUsage(accountId: string, month: string): Promise<SubscriptionUsage | undefined>;
  getSubscriptionUsage(accountId: string, month: string): Promise<SubscriptionUsage | undefined>;
  incrementUsage(accountId: string, month: string, field: 'itemsCreated' | 'smsReceived'): Promise<SubscriptionUsage>;
}

export class DrizzleStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email));
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }

  // Accounts
  async getAccount(id: string): Promise<Account | undefined> {
    const result = await db.select().from(accounts).where(eq(accounts.id, id));
    return result[0];
  }

  async createAccount(account: InsertAccount): Promise<Account> {
    const result = await db.insert(accounts).values(account).returning();
    return result[0];
  }

  async getUserAccounts(userId: string): Promise<Account[]> {
    const result = await db
      .select({ account: accounts })
      .from(accountMemberships)
      .innerJoin(accounts, eq(accountMemberships.accountId, accounts.id))
      .where(eq(accountMemberships.userId, userId));
    return result.map(r => r.account);
  }

  // Account Memberships
  async createAccountMembership(membership: InsertAccountMembership): Promise<AccountMembership> {
    const result = await db.insert(accountMemberships).values(membership).returning();
    return result[0];
  }

  async getAccountMembers(accountId: string): Promise<User[]> {
    const result = await db
      .select({ user: users })
      .from(accountMemberships)
      .innerJoin(users, eq(accountMemberships.userId, users.id))
      .where(eq(accountMemberships.accountId, accountId));
    return result.map(r => r.user);
  }

  // Items - ALL methods enforce account scoping for security
  async getItems(accountId: string, filters?: { status?: string }): Promise<Item[]> {
    const conditions = [eq(items.accountId, accountId)];
    
    if (filters?.status) {
      conditions.push(eq(items.status, filters.status));
    }
    
    const result = await db
      .select()
      .from(items)
      .where(and(...conditions))
      .orderBy(desc(items.createdAt));
    
    return result;
  }

  async getItem(id: string, accountId: string): Promise<Item | undefined> {
    const result = await db
      .select()
      .from(items)
      .where(and(eq(items.id, id), eq(items.accountId, accountId)));
    return result[0];
  }

  async createItem(item: InsertItem): Promise<Item> {
    const result = await db.insert(items).values({
      ...item,
      postedAt: item.status === 'posted' ? new Date() : null,
    }).returning();
    return result[0];
  }

  async updateItem(id: string, accountId: string, updates: Partial<InsertItem>): Promise<Item | undefined> {
    const result = await db
      .update(items)
      .set({
        ...updates,
        postedAt: updates.status === 'posted' ? new Date() : undefined,
      })
      .where(and(eq(items.id, id), eq(items.accountId, accountId)))
      .returning();
    return result[0];
  }

  async deleteItem(id: string, accountId: string): Promise<boolean> {
    const result = await db
      .delete(items)
      .where(and(eq(items.id, id), eq(items.accountId, accountId)))
      .returning();
    return result.length > 0;
  }

  // SMS Messages
  async getSmsMessages(accountId?: string): Promise<SmsMessage[]> {
    if (accountId) {
      const result = await db
        .select()
        .from(smsMessages)
        .where(eq(smsMessages.accountId, accountId))
        .orderBy(desc(smsMessages.receivedAt));
      return result;
    }
    
    const result = await db
      .select()
      .from(smsMessages)
      .orderBy(desc(smsMessages.receivedAt));
    return result;
  }

  async getSmsMessage(messageId: string): Promise<SmsMessage | undefined> {
    const result = await db.select().from(smsMessages).where(eq(smsMessages.messageId, messageId));
    return result[0];
  }

  async createSmsMessage(message: InsertSmsMessage): Promise<SmsMessage> {
    const result = await db.insert(smsMessages).values(message).returning();
    return result[0];
  }

  async updateSmsMessage(id: string, updates: Partial<InsertSmsMessage>): Promise<SmsMessage | undefined> {
    const result = await db
      .update(smsMessages)
      .set(updates)
      .where(eq(smsMessages.id, id))
      .returning();
    return result[0];
  }

  // Phone Numbers
  async getPhoneNumbers(): Promise<PhoneNumber[]> {
    const result = await db.select().from(phoneNumbers).orderBy(phoneNumbers.createdAt);
    return result;
  }

  async getPhoneNumber(phoneNumber: string): Promise<PhoneNumber | undefined> {
    const result = await db.select().from(phoneNumbers).where(eq(phoneNumbers.phoneNumber, phoneNumber));
    return result[0];
  }

  async getPhoneNumbersByAccount(accountId: string): Promise<PhoneNumber[]> {
    const result = await db.select().from(phoneNumbers).where(eq(phoneNumbers.accountId, accountId));
    return result;
  }

  async createPhoneNumber(phoneNumberData: InsertPhoneNumber): Promise<PhoneNumber> {
    const result = await db.insert(phoneNumbers).values(phoneNumberData).returning();
    return result[0];
  }

  async assignPhoneNumber(phoneNumber: string, accountId: string): Promise<PhoneNumber | undefined> {
    const result = await db
      .update(phoneNumbers)
      .set({ accountId, assignedAt: new Date() })
      .where(eq(phoneNumbers.phoneNumber, phoneNumber))
      .returning();
    return result[0];
  }

  async unassignPhoneNumber(phoneNumber: string): Promise<PhoneNumber | undefined> {
    const result = await db
      .update(phoneNumbers)
      .set({ accountId: null, assignedAt: null })
      .where(eq(phoneNumbers.phoneNumber, phoneNumber))
      .returning();
    return result[0];
  }

  // AI Insights
  async createAiInsight(insight: InsertItemAiInsight): Promise<ItemAiInsight> {
    const result = await db.insert(itemAiInsights).values(insight).returning();
    return result[0];
  }

  async getLatestAiInsight(imageUrl: string, accountId: string): Promise<ItemAiInsight | undefined> {
    const result = await db
      .select()
      .from(itemAiInsights)
      .where(and(eq(itemAiInsights.imageUrl, imageUrl), eq(itemAiInsights.accountId, accountId)))
      .orderBy(desc(itemAiInsights.createdAt))
      .limit(1);
    return result[0];
  }

  async getItemAiInsights(itemId: string, accountId: string): Promise<ItemAiInsight[]> {
    const result = await db
      .select()
      .from(itemAiInsights)
      .where(and(eq(itemAiInsights.itemId, itemId), eq(itemAiInsights.accountId, accountId)))
      .orderBy(desc(itemAiInsights.createdAt));
    return result;
  }

  async findAiInsightByHash(accountId: string, imageHash: string): Promise<ItemAiInsight | undefined> {
    const result = await db
      .select()
      .from(itemAiInsights)
      .where(and(eq(itemAiInsights.accountId, accountId), eq(itemAiInsights.imageHash, imageHash)))
      .limit(1);
    return result[0];
  }

  async upsertAiInsight(insight: InsertItemAiInsight): Promise<ItemAiInsight> {
    // Use ON CONFLICT to update existing record or insert new one
    // Update all fields including analysisRunId for re-analysis support
    const result = await db
      .insert(itemAiInsights)
      .values(insight)
      .onConflictDoUpdate({
        target: [itemAiInsights.accountId, itemAiInsights.imageHash],
        set: {
          // Update run-scoped fields for new analysis
          analysisRunId: insight.analysisRunId,
          source: insight.source,
          triggerStage: insight.triggerStage,
          // Update analysis results
          status: insight.status || 'processing',
          labels: insight.labels,
          webEntities: insight.webEntities,
          dominantColors: insight.dominantColors,
          contentSignature: insight.contentSignature,
          suggestedTitle: insight.suggestedTitle,
          suggestedDescription: insight.suggestedDescription,
          suggestedCategory: insight.suggestedCategory,
          decisions: insight.decisions,
          error: insight.error,
          // Clear processedAt for new analysis run
          processedAt: null as any,
        },
      })
      .returning();
    return result[0];
  }

  async linkAiInsightToItem(analysisRunId: string, itemId: string): Promise<void> {
    // Verify item exists and get its accountId
    const item = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
    if (!item[0]) {
      throw new Error(`Item ${itemId} not found`);
    }

    // Update insight and verify account matches
    const result = await db
      .update(itemAiInsights)
      .set({ itemId })
      .where(
        and(
          eq(itemAiInsights.analysisRunId, analysisRunId),
          eq(itemAiInsights.accountId, item[0].accountId)
        )
      )
      .returning();

    if (result.length === 0) {
      throw new Error(`AI insight ${analysisRunId} not found or account mismatch`);
    }
  }

  async markAiInsightProcessed(
    analysisRunId: string,
    updates: {
      status: 'completed' | 'failed' | 'stale';
      processedAt: Date;
      decisions?: any;
      error?: string;
    }
  ): Promise<void> {
    await this.updateAiInsight(analysisRunId, updates);
  }

  async updateAiInsight(analysisRunId: string, updates: Partial<ItemAiInsight>): Promise<ItemAiInsight | undefined> {
    const result = await db
      .update(itemAiInsights)
      .set(updates as any) // Cast to any since we're updating with potentially any column
      .where(eq(itemAiInsights.analysisRunId, analysisRunId))
      .returning();
    return result[0];
  }

  // Subscriptions
  async getSubscription(userId: string, accountId: string): Promise<Subscription | undefined> {
    const result = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.accountId, accountId)))
      .limit(1);
    return result[0];
  }

  async getSubscriptionById(id: string): Promise<Subscription | undefined> {
    const result = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, id))
      .limit(1);
    return result[0];
  }

  async getSubscriptionByAccountId(accountId: string): Promise<Subscription | undefined> {
    const result = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.accountId, accountId))
      .limit(1);
    return result[0];
  }

  async createSubscription(subscription: InsertSubscription): Promise<Subscription> {
    const result = await db.insert(subscriptions).values(subscription).returning();
    return result[0];
  }

  async updateSubscription(id: string, updates: Partial<InsertSubscription>): Promise<Subscription | undefined> {
    const result = await db
      .update(subscriptions)
      .set(updates)
      .where(eq(subscriptions.id, id))
      .returning();
    return result[0];
  }

  async cancelSubscription(id: string): Promise<Subscription | undefined> {
    const result = await db
      .update(subscriptions)
      .set({ 
        cancelAtPeriodEnd: 1,
        status: 'canceled'
      })
      .where(eq(subscriptions.id, id))
      .returning();
    return result[0];
  }

  // Subscription Intents
  async createSubscriptionIntent(intent: InsertSubscriptionIntent): Promise<SubscriptionIntent> {
    const result = await db.insert(subscriptionIntents).values(intent).returning();
    return result[0];
  }

  async getSubscriptionIntentByNonce(nonce: string): Promise<SubscriptionIntent | undefined> {
    const result = await db
      .select()
      .from(subscriptionIntents)
      .where(and(
        eq(subscriptionIntents.nonce, nonce),
        eq(subscriptionIntents.completed, 0)
      ))
      .limit(1);
    return result[0];
  }

  async updateSubscriptionIntent(id: string, updates: Partial<InsertSubscriptionIntent>): Promise<SubscriptionIntent | undefined> {
    const result = await db
      .update(subscriptionIntents)
      .set(updates)
      .where(eq(subscriptionIntents.id, id))
      .returning();
    return result[0];
  }

  async markIntentCompleted(nonce: string): Promise<void> {
    await db
      .update(subscriptionIntents)
      .set({ completed: 1 })
      .where(eq(subscriptionIntents.nonce, nonce));
  }

  async cleanupExpiredIntents(): Promise<void> {
    const now = new Date();
    await db
      .delete(subscriptionIntents)
      .where(sql`${subscriptionIntents.expiresAt} < ${now}`);
  }

  // Subscription Usage
  async getUsage(accountId: string, month: string): Promise<SubscriptionUsage | undefined> {
    const result = await db
      .select()
      .from(subscriptionUsage)
      .where(and(
        eq(subscriptionUsage.accountId, accountId),
        eq(subscriptionUsage.month, month)
      ))
      .limit(1);
    return result[0];
  }

  async getSubscriptionUsage(accountId: string, month: string): Promise<SubscriptionUsage | undefined> {
    // Query by accountId (works for both free and paid tiers)
    const result = await db
      .select()
      .from(subscriptionUsage)
      .where(and(
        eq(subscriptionUsage.accountId, accountId),
        eq(subscriptionUsage.month, month)
      ))
      .limit(1);
    return result[0];
  }

  async incrementUsage(accountId: string, month: string, field: 'itemsCreated' | 'smsReceived'): Promise<SubscriptionUsage> {
    // First, try to get existing usage record by accountId
    const existing = await this.getUsage(accountId, month);
    
    if (existing) {
      // Update existing record
      const updates = field === 'itemsCreated' 
        ? { itemsCreated: existing.itemsCreated + 1 }
        : { smsReceived: existing.smsReceived + 1 };
      
      const result = await db
        .update(subscriptionUsage)
        .set(updates)
        .where(eq(subscriptionUsage.id, existing.id))
        .returning();
      return result[0];
    } else {
      // Create new usage record with accountId
      // Get subscription ID if exists (for paid tiers)
      const subscription = await this.getSubscriptionByAccountId(accountId);
      
      const newUsage = {
        accountId,
        subscriptionId: subscription?.id || null,
        month,
        itemsCreated: field === 'itemsCreated' ? 1 : 0,
        smsReceived: field === 'smsReceived' ? 1 : 0,
      };
      
      const result = await db.insert(subscriptionUsage).values(newUsage).returning();
      return result[0];
    }
  }
}

export const storage = new DrizzleStorage();
