import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { useLocation } from "wouter";

interface UpgradePromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan: 'free' | 'starter' | 'pro' | 'business';
  limitType: 'items' | 'sms' | 'autoPost';
  current?: number;
  limit?: number;
}

const PLAN_UPGRADES = {
  free: {
    name: 'Free',
    suggestedPlan: 'starter',
    suggestedPlanName: 'Starter',
    price: '$29',
    features: [
      '50 items per month',
      '100 SMS messages per month',
      'AI-powered listing generation',
      'Multi-marketplace support',
    ],
  },
  starter: {
    name: 'Starter',
    suggestedPlan: 'pro',
    suggestedPlanName: 'Pro',
    price: '$49',
    features: [
      'Unlimited items',
      'Unlimited SMS',
      'Auto-post to eBay & Etsy',
      'Priority support',
    ],
  },
  pro: {
    name: 'Pro',
    suggestedPlan: 'business',
    suggestedPlanName: 'Business',
    price: '$99',
    features: [
      'Everything in Pro',
      'Team collaboration (10 members)',
      'Advanced analytics',
      'Dedicated account manager',
    ],
  },
  business: {
    name: 'Business',
    suggestedPlan: null,
    suggestedPlanName: null,
    price: null,
    features: [],
  },
};

const LIMIT_MESSAGES = {
  items: (current: number, limit: number) => 
    `You've created ${current} of ${limit} items this month.`,
  sms: (current: number, limit: number) => 
    `You've used ${current} of ${limit} SMS messages this month.`,
  autoPost: () => 
    'Auto-posting to marketplaces is available on Pro and Business plans.',
};

export function UpgradePrompt({ 
  open, 
  onOpenChange, 
  currentPlan, 
  limitType,
  current = 0,
  limit = 0,
}: UpgradePromptProps) {
  const [, setLocation] = useLocation();
  const upgrade = PLAN_UPGRADES[currentPlan];

  if (!upgrade.suggestedPlan) {
    return null;
  }

  const handleUpgrade = () => {
    onOpenChange(false);
    setLocation('/pricing');
  };

  const message = limitType === 'autoPost' 
    ? LIMIT_MESSAGES.autoPost()
    : LIMIT_MESSAGES[limitType](current, limit);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-upgrade-prompt">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="rounded-full bg-primary/10 p-2">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <Badge variant="outline">{upgrade.name} Plan</Badge>
          </div>
          <DialogTitle className="text-xl">Upgrade to unlock more</DialogTitle>
          <DialogDescription className="text-base pt-2" data-testid="text-upgrade-message">
            {message} Upgrade to {upgrade.suggestedPlanName} to continue growing your business.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="font-semibold text-lg" data-testid="text-suggested-plan-name">{upgrade.suggestedPlanName}</h4>
                <div className="text-right shrink-0" data-testid="text-plan-price">
                  <span className="text-2xl font-bold">{upgrade.price}</span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {upgrade.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm" data-testid={`text-feature-${idx}`}>
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="gap-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-upgrade"
          >
            Not now
          </Button>
          <Button 
            onClick={handleUpgrade}
            data-testid="button-upgrade-now"
          >
            Upgrade now
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
