import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Plan {
  id: string;
  name: string;
  price: number;
  features: string[];
}

const PLANS: Record<string, Plan> = {
  starter: {
    id: 'starter',
    name: 'Starter Plan',
    price: 29,
    features: [
      '50 items per month',
      'SMS photo uploads',
      'AI listing generation',
      'Manual copy-paste to marketplaces',
      'Priority support',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro Plan',
    price: 49,
    features: [
      'Unlimited items',
      'SMS photo uploads',
      'AI listing generation',
      'Auto-post to eBay & Etsy',
      'Manual copy-paste for other platforms',
      'Priority support',
      'Advanced analytics',
    ],
  },
  business: {
    id: 'business',
    name: 'Business Plan',
    price: 99,
    features: [
      'Unlimited items',
      'SMS photo uploads',
      'AI listing generation',
      'Auto-post to eBay & Etsy',
      'Team collaboration (5 users)',
      'Shared phone numbers',
      'Priority support',
      'Advanced analytics',
      'Custom integrations',
    ],
  },
};

export default function Subscribe() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<string>('');

  // Get plan from URL query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const planId = params.get('plan');
    if (planId && PLANS[planId]) {
      setSelectedPlan(planId);
    } else {
      setLocation('/pricing');
    }
  }, [setLocation]);

  // Get user info
  const { data: user } = useQuery({
    queryKey: ['/api/auth/me'],
  });

  // Check if user already has a subscription
  const { data: subscription } = useQuery({
    queryKey: ['/api/subscriptions/current'],
    enabled: !!user,
  });

  // Initiate subscription
  const initiateMutation = useMutation({
    mutationFn: async (plan: string) => {
      const response = await apiRequest('POST', '/api/subscriptions/initiate', { plan });
      return response.json();
    },
    onSuccess: (data: any) => {
      // Redirect to NMI payment page
      if (data.formUrl) {
        window.location.href = data.formUrl;
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to initiate subscription",
        variant: "destructive",
      });
    },
  });

  const plan = PLANS[selectedPlan];

  if (!plan) {
    return null;
  }

  // If user already has a subscription
  if (subscription) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Subscription Active</CardTitle>
            <CardDescription>
              You already have an active subscription
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Visit your settings page to manage your subscription or upgrade to a different plan.
            </p>
          </CardContent>
          <CardFooter>
            <Button 
              onClick={() => setLocation('/settings')} 
              className="w-full"
              data-testid="button-goto-settings"
            >
              Go to Settings
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle data-testid="text-plan-name">Start Your {plan.name}</CardTitle>
          <CardDescription>
            14-day free trial, then ${plan.price}/month
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-4xl font-bold" data-testid="text-plan-price">
                ${plan.price}
              </span>
              <span className="text-muted-foreground">/month</span>
            </div>
            <p className="text-sm text-muted-foreground">
              After 14-day free trial
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-3">What's included:</h3>
            <ul className="space-y-2">
              {plan.features.map((feature, idx) => (
                <li 
                  key={idx} 
                  className="flex items-start gap-2"
                  data-testid={`feature-${idx}`}
                >
                  <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-muted/50 p-4 rounded-lg">
            <p className="text-sm text-muted-foreground">
              You'll be redirected to our secure payment processor to complete your subscription. 
              You can cancel anytime from your settings.
            </p>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button 
            onClick={() => initiateMutation.mutate(selectedPlan)}
            disabled={initiateMutation.isPending}
            className="w-full"
            data-testid="button-start-trial"
          >
            {initiateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              'Start Free Trial'
            )}
          </Button>
          
          <Button 
            variant="ghost" 
            onClick={() => setLocation('/pricing')}
            className="w-full"
            data-testid="button-back-pricing"
          >
            Back to Pricing
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
