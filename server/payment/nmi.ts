/**
 * NMI Payment Gateway Integration
 * 
 * Implements subscription billing using NMI's Three-Step Redirect API
 * and Customer Vault for secure recurring payments.
 * 
 * Documentation: https://support.nmi.com/hc/en-gb/articles/14525725002385
 */

export interface NMIConfig {
  securityKey: string;
  gatewayUrl: string;
}

export interface NMISubscriptionParams {
  userId: string;
  accountId: string;
  plan: 'starter' | 'pro' | 'business';
  customerEmail: string;
  customerName: string;
  redirectUrl: string;
  nonce: string; // Secure token for callback verification
}

export interface NMIThreeStepResponse {
  formUrl: string;
  tokenId: string;
}

export interface NMISubscriptionResult {
  success: boolean;
  customerVaultId?: string;
  subscriptionId?: string;
  response?: string;
  responseText?: string;
  error?: string;
}

export interface PlanConfig {
  name: string;
  amount: number; // in dollars
  planId: string;
}

// Plan configurations
export const PLANS: Record<string, PlanConfig> = {
  starter: {
    name: 'Starter Plan',
    amount: 29,
    planId: 'list-it-starter',
  },
  pro: {
    name: 'Pro Plan',
    amount: 49,
    planId: 'list-it-pro',
  },
  business: {
    name: 'Business Plan',
    amount: 99,
    planId: 'list-it-business',
  },
};

export class NMIPaymentService {
  private config: NMIConfig;

  constructor(config: NMIConfig) {
    this.config = config;
  }

  /**
   * Step 1: Initiate Three-Step Redirect for subscription sign-up
   * Returns a URL to redirect the user to NMI's hosted payment page
   */
  async initiateSubscription(params: NMISubscriptionParams): Promise<NMIThreeStepResponse> {
    const plan = PLANS[params.plan];
    if (!plan) {
      throw new Error(`Invalid plan: ${params.plan}`);
    }

    const formData = new URLSearchParams({
      security_key: this.config.securityKey,
      redirect_url: params.redirectUrl,
      type: 'sale',
      amount: plan.amount.toFixed(2),
      
      // Customer Vault - save payment method
      customer_vault: 'add_customer',
      
      // Recurring subscription
      recurring: 'add_subscription',
      plan_payments: '0', // Infinite (until canceled)
      plan_amount: plan.amount.toFixed(2),
      month_frequency: '1', // Bill monthly
      day_of_month: '1', // Bill on the 1st of each month
      
      // Customer info
      first_name: params.customerName.split(' ')[0] || params.customerName,
      last_name: params.customerName.split(' ').slice(1).join(' ') || '',
      email: params.customerEmail,
      
      // Custom fields for tracking - include nonce for callback verification
      order_id: params.nonce,
      orderid: params.nonce, // NMI uses both formats
    });

    const response = await fetch(`${this.config.gatewayUrl}/api/v2/three-step`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      throw new Error(`NMI API error: ${response.statusText}`);
    }

    const data = await response.text();
    const parsed = new URLSearchParams(data);

    if (parsed.get('response') !== '1') {
      throw new Error(parsed.get('responsetext') || 'Unknown NMI error');
    }

    return {
      formUrl: parsed.get('form-url') || '',
      tokenId: parsed.get('token-id') || '',
    };
  }

  /**
   * Step 3: Parse the callback from NMI after payment
   * Extract customer vault ID and subscription ID
   */
  parseCallback(callbackData: URLSearchParams): NMISubscriptionResult {
    const response = callbackData.get('response');
    const responseText = callbackData.get('responsetext');
    const customerVaultId = callbackData.get('customer_vault_id');
    const subscriptionId = callbackData.get('subscription_id');

    if (response === '1') {
      // Success
      return {
        success: true,
        customerVaultId: customerVaultId || undefined,
        subscriptionId: subscriptionId || undefined,
        response,
        responseText: responseText || undefined,
      };
    } else {
      // Declined or error
      return {
        success: false,
        response: response || undefined,
        responseText: responseText || undefined,
        error: responseText || 'Payment declined',
      };
    }
  }

  /**
   * Cancel a subscription with NMI
   */
  async cancelNMISubscription(subscriptionId: string): Promise<boolean> {
    const formData = new URLSearchParams({
      security_key: this.config.securityKey,
      recurring: 'delete_subscription',
      subscription_id: subscriptionId,
    });

    const response = await fetch(`${this.config.gatewayUrl}/api/transact.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      throw new Error(`NMI API error: ${response.statusText}`);
    }

    const data = await response.text();
    const parsed = new URLSearchParams(data);

    return parsed.get('response') === '1';
  }

  /**
   * Update payment method (requires new Three-Step flow)
   */
  async updatePaymentMethod(params: {
    customerVaultId: string;
    redirectUrl: string;
  }): Promise<NMIThreeStepResponse> {
    const formData = new URLSearchParams({
      security_key: this.config.securityKey,
      redirect_url: params.redirectUrl,
      type: 'sale',
      amount: '0.00', // $0 authorization to update payment method
      
      // Update existing customer vault
      customer_vault: 'update_customer',
      customer_vault_id: params.customerVaultId,
    });

    const response = await fetch(`${this.config.gatewayUrl}/api/v2/three-step`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      throw new Error(`NMI API error: ${response.statusText}`);
    }

    const data = await response.text();
    const parsed = new URLSearchParams(data);

    if (parsed.get('response') !== '1') {
      throw new Error(parsed.get('responsetext') || 'Unknown NMI error');
    }

    return {
      formUrl: parsed.get('form-url') || '',
      tokenId: parsed.get('token-id') || '',
    };
  }
}

// Singleton instance (will be initialized with env vars)
let nmiService: NMIPaymentService | null = null;

export function getNMIService(): NMIPaymentService {
  if (!nmiService) {
    const securityKey = process.env.NMI_SECURITY_KEY || process.env.SWIPESBLUE_SECURITY_KEY;
    const gatewayUrl = process.env.NMI_GATEWAY_URL || 'https://secure.nmi.com';

    if (!securityKey) {
      throw new Error('NMI_SECURITY_KEY or SWIPESBLUE_SECURITY_KEY environment variable is required');
    }

    nmiService = new NMIPaymentService({
      securityKey,
      gatewayUrl,
    });
  }

  return nmiService;
}
