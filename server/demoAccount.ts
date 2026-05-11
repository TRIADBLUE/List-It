import { storage } from "./storage";

// Demo account management for development
// TODO: Replace with proper authentication system

let demoAccountId: string | null = null;

export async function getDemoAccount(): Promise<string> {
  if (demoAccountId) {
    return demoAccountId;
  }

  // Find or create demo user
  let demoUser = await storage.getUserByEmail('demo@storageflip.com');
  
  if (!demoUser) {
    demoUser = await storage.createUser({
      email: 'demo@storageflip.com',
      name: 'Demo User',
      passwordHash: 'demo-hash', // Not used in demo mode
    });
  }

  // Find existing demo account for this user
  const existingAccounts = await storage.getUserAccounts(demoUser.id);
  if (existingAccounts.length > 0) {
    demoAccountId = existingAccounts[0].id;
    return demoAccountId;
  }

  // Create demo account
  const account = await storage.createAccount({
    name: 'Demo Account',
    plan: 'basic',
  });

  // Link user to account
  await storage.createAccountMembership({
    userId: demoUser.id,
    accountId: account.id,
    role: 'owner',
  });

  demoAccountId = account.id;
  return demoAccountId;
}
