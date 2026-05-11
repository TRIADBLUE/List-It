import { Request, Response, NextFunction } from "express";
import { IStorage } from "../storage";

// Plan limits configuration
export const PLAN_LIMITS = {
  free: {
    itemsPerMonth: 5,
    smsPerMonth: 10,
    autoPost: false,
    teamMembers: 1,
  },
  starter: {
    itemsPerMonth: 50,
    smsPerMonth: 100,
    autoPost: false,
    teamMembers: 1,
  },
  pro: {
    itemsPerMonth: Infinity, // Unlimited
    smsPerMonth: Infinity,
    autoPost: true,
    teamMembers: 1,
  },
  business: {
    itemsPerMonth: Infinity,
    smsPerMonth: Infinity,
    autoPost: true,
    teamMembers: 10,
  },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;

// Helper to get current month key (YYYY-MM)
export function getCurrentMonthKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Get user's current plan and subscription status
export async function getUserPlan(storage: IStorage, accountId: string): Promise<{
  plan: PlanType;
  status: string;
  isActive: boolean;
}> {
  const subscription = await storage.getSubscriptionByAccountId(accountId);
  
  if (!subscription) {
    return {
      plan: 'free',
      status: 'none',
      isActive: true, // Free plan always active
    };
  }

  const isActive = ['active', 'trialing'].includes(subscription.status);
  
  return {
    plan: subscription.plan as PlanType,
    status: subscription.status,
    isActive,
  };
}

// Get current usage for account
export async function getUsage(storage: IStorage, accountId: string): Promise<{
  itemsCreated: number;
  smsReceived: number;
}> {
  // Always query by accountId (works for both free and paid tiers)
  const month = getCurrentMonthKey();
  const usage = await storage.getSubscriptionUsage(accountId, month);
  
  return {
    itemsCreated: usage?.itemsCreated || 0,
    smsReceived: usage?.smsReceived || 0,
  };
}

// Check if account has reached their plan limit
export async function checkLimit(
  storage: IStorage,
  accountId: string,
  type: 'items' | 'sms'
): Promise<{ allowed: boolean; plan: PlanType; current: number; limit: number }> {
  const { plan, isActive } = await getUserPlan(storage, accountId);
  
  if (!isActive) {
    return {
      allowed: false,
      plan,
      current: 0,
      limit: 0,
    };
  }

  const usage = await getUsage(storage, accountId);
  const limits = PLAN_LIMITS[plan];
  
  const current = type === 'items' ? usage.itemsCreated : usage.smsReceived;
  const limit = type === 'items' ? limits.itemsPerMonth : limits.smsPerMonth;
  
  return {
    allowed: current < limit,
    plan,
    current,
    limit,
  };
}

// Middleware: Require active subscription
export function requireSubscription(storage: IStorage) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const accountId = req.session.accountId;
    if (!accountId) {
      return res.status(400).json({ error: "No account selected" });
    }

    const { isActive } = await getUserPlan(storage, accountId);
    
    if (!isActive) {
      return res.status(403).json({ 
        error: "Subscription required",
        message: "Your subscription is not active. Please subscribe to continue.",
      });
    }

    next();
  };
}

// Middleware: Check item creation limit
export function checkItemLimit(storage: IStorage) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const accountId = req.session.accountId;
    if (!accountId) {
      return res.status(400).json({ error: "No account selected" });
    }

    const result = await checkLimit(storage, accountId, 'items');
    
    if (!result.allowed) {
      return res.status(403).json({
        error: "Item limit reached",
        message: `You've reached your ${result.plan} plan limit of ${result.limit} items per month.`,
        plan: result.plan,
        current: result.current,
        limit: result.limit,
        upgradeRequired: true,
      });
    }

    next();
  };
}

// Middleware: Check SMS limit
export function checkSmsLimit(storage: IStorage) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const accountId = req.session?.accountId;
    if (!accountId) {
      // For webhook endpoints, we'll check limit after determining account
      return next();
    }

    const result = await checkLimit(storage, accountId, 'sms');
    
    if (!result.allowed) {
      return res.status(403).json({
        error: "SMS limit reached",
        message: `You've reached your ${result.plan} plan limit of ${result.limit} SMS messages per month.`,
        plan: result.plan,
        current: result.current,
        limit: result.limit,
        upgradeRequired: true,
      });
    }

    next();
  };
}

// Middleware: Require Pro or Business plan for auto-posting
export function requireAutoPostPlan(storage: IStorage) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const accountId = req.session.accountId;
    if (!accountId) {
      return res.status(400).json({ error: "No account selected" });
    }

    const { plan, isActive } = await getUserPlan(storage, accountId);
    
    if (!isActive) {
      return res.status(403).json({
        error: "Subscription required",
        message: "Auto-posting requires an active subscription.",
      });
    }

    const limits = PLAN_LIMITS[plan];
    if (!limits.autoPost) {
      return res.status(403).json({
        error: "Plan upgrade required",
        message: "Auto-posting is only available on Pro and Business plans.",
        plan,
        upgradeRequired: true,
      });
    }

    next();
  };
}
