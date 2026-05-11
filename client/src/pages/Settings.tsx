import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SmsMessage } from "@shared/schema";
import { MessageSquare, Phone, Check, Clock, CreditCard, TrendingUp, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import { useEffect } from "react";

const PLAN_LIMITS: Record<string, { items: number; name: string }> = {
  free: { items: 5, name: 'Free' },
  starter: { items: 50, name: 'Starter' },
  pro: { items: -1, name: 'Pro' }, // -1 = unlimited
  business: { items: -1, name: 'Business' },
};

export default function Settings() {
  const { toast } = useToast();

  // Check for subscription status in URL (from callback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('subscription');
    
    if (status === 'success') {
      toast({
        title: "Subscription Activated!",
        description: "Your subscription is now active. Welcome!",
      });
      // Clean up URL
      window.history.replaceState({}, '', '/settings');
      queryClient.invalidateQueries({ queryKey: ['/api/subscriptions/current'] });
    } else if (status === 'failed') {
      toast({
        title: "Payment Failed",
        description: "There was an issue processing your payment. Please try again.",
        variant: "destructive",
      });
      window.history.replaceState({}, '', '/settings');
    } else if (status === 'error') {
      toast({
        title: "Error",
        description: "An error occurred. Please contact support.",
        variant: "destructive",
      });
      window.history.replaceState({}, '', '/settings');
    }
  }, [toast]);

  const { data: subscriptionData, isLoading: subLoading } = useQuery<{
    subscription: any;
    usage: any;
  } | null>({
    queryKey: ['/api/subscriptions/current'],
  });

  const { data: messages = [], isLoading } = useQuery<SmsMessage[]>({
    queryKey: ['/api/sms/messages'],
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/subscriptions/cancel', {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Subscription Canceled",
        description: "Your subscription will remain active until the end of the billing period.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/subscriptions/current'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel subscription",
        variant: "destructive",
      });
    },
  });

  const subscription = subscriptionData?.subscription;
  const usage = subscriptionData?.usage;
  const currentPlan = subscription?.plan || 'free';
  const planLimit = PLAN_LIMITS[currentPlan];

  const sharedPhoneNumber = "+1 (555) 123-4567";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-settings-title">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your subscription, SMS, and marketplace integrations</p>
      </div>

      {/* Subscription/Billing Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Subscription & Billing
          </CardTitle>
          <CardDescription>
            Manage your plan and usage
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {subLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <>
              {/* Current Plan */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Current Plan</p>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold" data-testid="text-current-plan">
                      {planLimit.name}
                    </p>
                    {subscription?.status === 'active' && (
                      <Badge variant="default" data-testid="badge-subscription-active">Active</Badge>
                    )}
                    {subscription?.cancelAtPeriodEnd === 1 && (
                      <Badge variant="destructive" data-testid="badge-subscription-canceling">
                        Canceling
                      </Badge>
                    )}
                  </div>
                  {subscription && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {subscription.cancelAtPeriodEnd === 1 
                        ? `Active until ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                        : `Renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                      }
                    </p>
                  )}
                </div>
                {currentPlan === 'free' ? (
                  <Button asChild data-testid="button-upgrade">
                    <Link href="/pricing">
                      <TrendingUp className="mr-2 h-4 w-4" />
                      Upgrade
                    </Link>
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    {subscription?.cancelAtPeriodEnd !== 1 && (
                      <Button 
                        variant="outline" 
                        onClick={() => cancelMutation.mutate()}
                        disabled={cancelMutation.isPending}
                        data-testid="button-cancel-subscription"
                      >
                        Cancel Plan
                      </Button>
                    )}
                    <Button asChild variant="default" data-testid="button-change-plan">
                      <Link href="/pricing">Change Plan</Link>
                    </Button>
                  </div>
                )}
              </div>

              {/* Usage This Month */}
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">Items Created This Month</p>
                    <p className="text-sm text-muted-foreground" data-testid="text-items-usage">
                      {usage?.itemsCreated || 0} / {planLimit.items === -1 ? '∞' : planLimit.items}
                    </p>
                  </div>
                  {planLimit.items > 0 && (
                    <Progress 
                      value={((usage?.itemsCreated || 0) / planLimit.items) * 100} 
                      className="h-2"
                      data-testid="progress-items-usage"
                    />
                  )}
                  {planLimit.items > 0 && (usage?.itemsCreated || 0) >= planLimit.items && (
                    <div className="flex items-center gap-2 mt-2 text-sm text-destructive">
                      <AlertCircle className="w-4 h-4" />
                      <span>You've reached your monthly limit</span>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">SMS Messages Received</p>
                    <p className="text-sm text-muted-foreground" data-testid="text-sms-usage">
                      {usage?.smsReceived || 0}
                    </p>
                  </div>
                </div>
              </div>

              {/* Plan Features */}
              {currentPlan !== 'free' && subscription && (
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-3">Your Plan Features</p>
                  <div className="space-y-2">
                    {currentPlan === 'starter' && (
                      <>
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="w-4 h-4 text-primary" />
                          <span>50 items per month</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="w-4 h-4 text-primary" />
                          <span>Priority support</span>
                        </div>
                      </>
                    )}
                    {(currentPlan === 'pro' || currentPlan === 'business') && (
                      <>
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="w-4 h-4 text-primary" />
                          <span>Unlimited items</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="w-4 h-4 text-primary" />
                          <span>Auto-post to eBay & Etsy (coming soon)</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="w-4 h-4 text-primary" />
                          <span>Advanced analytics</span>
                        </div>
                      </>
                    )}
                    {currentPlan === 'business' && (
                      <>
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="w-4 h-4 text-primary" />
                          <span>Team collaboration (5 users)</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="w-4 h-4 text-primary" />
                          <span>Custom integrations</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Text to Create Listings
          </CardTitle>
          <CardDescription>
            Send photos and details via SMS to instantly create listings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-6 bg-primary/5 rounded-lg border-2 border-primary/20 text-center">
            <Phone className="w-12 h-12 mx-auto mb-3 text-primary" />
            <p className="text-sm text-muted-foreground mb-2">Text your items to</p>
            <p className="text-3xl font-bold font-mono mb-3" data-testid="text-shared-phone-number">
              {sharedPhoneNumber}
            </p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Send photos with optional description. Our AI will analyze your items and create listings automatically.
            </p>
          </div>

          <div className="space-y-3 pt-4">
            <p className="text-sm font-medium">How it works:</p>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span className="font-bold text-foreground">1.</span>
                <span>Take a photo of your item</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-foreground">2.</span>
                <span>Text it to {sharedPhoneNumber}</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-foreground">3.</span>
                <span>AI analyzes and creates a listing draft</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-foreground">4.</span>
                <span>Review and post to marketplaces</span>
              </li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Recent SMS Messages
          </CardTitle>
          <CardDescription>
            {messages.length} message{messages.length !== 1 ? 's' : ''} received
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No SMS messages received yet</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {messages.map((msg) => (
                <div 
                  key={msg.id}
                  className="p-4 rounded-lg border hover-elevate"
                  data-testid={`sms-message-${msg.id}`}
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span className="font-mono text-sm">{msg.fromNumber}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {msg.processed === 1 ? (
                        <Badge variant="default" className="text-xs">
                          <Check className="w-3 h-3 mr-1" />
                          Processed
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          <Clock className="w-3 h-3 mr-1" />
                          Pending
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  {msg.body && (
                    <p className="text-sm mb-2">{msg.body}</p>
                  )}
                  
                  {msg.mediaUrls && msg.mediaUrls.length > 0 && (
                    <div className="flex gap-2 mb-2">
                      <Badge variant="secondary" className="text-xs">
                        {msg.mediaUrls.length} image{msg.mediaUrls.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  )}
                  
                  <p className="text-xs text-muted-foreground">
                    {new Date(msg.receivedAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Marketplace Integrations</CardTitle>
          <CardDescription>
            Copy formatted listings to these platforms
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold">
                e
              </div>
              <div>
                <p className="font-medium">eBay</p>
                <p className="text-xs text-muted-foreground">Copy-paste listings</p>
              </div>
            </div>
            <Badge variant="outline">Manual</Badge>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-blue-600 flex items-center justify-center text-white">
                f
              </div>
              <div>
                <p className="font-medium">Facebook Marketplace</p>
                <p className="text-xs text-muted-foreground">Copy-paste listings</p>
              </div>
            </div>
            <Badge variant="outline">Manual</Badge>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-purple-600 flex items-center justify-center text-white font-bold">
                CL
              </div>
              <div>
                <p className="font-medium">Craigslist</p>
                <p className="text-xs text-muted-foreground">Copy-paste listings</p>
              </div>
            </div>
            <Badge variant="outline">Manual</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
