import { useState } from "react";
import { Link } from "wouter";
import { Check, Zap, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PlanFeature {
  text: string;
  included: boolean;
}

interface PricingTier {
  id: string;
  name: string;
  price: number;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  features: PlanFeature[];
  cta: string;
  popular?: boolean;
  itemLimit: string;
  marketplaces: string[];
}

const pricingTiers: PricingTier[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    description: 'Perfect for trying out List It',
    icon: Zap,
    itemLimit: '5 items/month',
    marketplaces: ['Manual copy-paste'],
    features: [
      { text: '5 items per month', included: true },
      { text: 'SMS photo uploads', included: true },
      { text: 'AI listing generation', included: true },
      { text: 'Manual copy-paste to marketplaces', included: true },
      { text: 'Auto-post to eBay & Etsy', included: false },
      { text: 'Team collaboration', included: false },
    ],
    cta: 'Get Started Free',
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 29,
    description: 'For individual sellers',
    icon: TrendingUp,
    itemLimit: '50 items/month',
    marketplaces: ['Manual copy-paste'],
    features: [
      { text: '50 items per month', included: true },
      { text: 'SMS photo uploads', included: true },
      { text: 'AI listing generation', included: true },
      { text: 'Manual copy-paste to marketplaces', included: true },
      { text: 'Priority support', included: true },
      { text: 'Auto-post to eBay & Etsy', included: false },
      { text: 'Team collaboration', included: false },
    ],
    cta: 'Start Free Trial',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 49,
    description: 'For power sellers',
    icon: Zap,
    itemLimit: 'Unlimited items',
    marketplaces: ['eBay API', 'Etsy API', 'Manual copy-paste'],
    popular: true,
    features: [
      { text: 'Unlimited items', included: true },
      { text: 'SMS photo uploads', included: true },
      { text: 'AI listing generation', included: true },
      { text: 'Auto-post to eBay & Etsy', included: true },
      { text: 'Manual copy-paste for other platforms', included: true },
      { text: 'Priority support', included: true },
      { text: 'Advanced analytics', included: true },
      { text: 'Team collaboration', included: false },
    ],
    cta: 'Start Free Trial',
  },
  {
    id: 'business',
    name: 'Business',
    price: 99,
    description: 'For teams and businesses',
    icon: Users,
    itemLimit: 'Unlimited items',
    marketplaces: ['eBay API', 'Etsy API', 'Manual copy-paste'],
    features: [
      { text: 'Unlimited items', included: true },
      { text: 'SMS photo uploads', included: true },
      { text: 'AI listing generation', included: true },
      { text: 'Auto-post to eBay & Etsy', included: true },
      { text: 'Team collaboration (5 users)', included: true },
      { text: 'Shared phone numbers', included: true },
      { text: 'Priority support', included: true },
      { text: 'Advanced analytics', included: true },
      { text: 'Custom integrations', included: true },
    ],
    cta: 'Start Free Trial',
  },
];

export default function Pricing() {
  const [billingCycle] = useState<'monthly' | 'yearly'>('monthly');

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Choose the plan that fits your business. All plans include a 14-day free trial.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {pricingTiers.map((tier) => {
            const Icon = tier.icon;
            
            return (
              <Card 
                key={tier.id} 
                className={`relative flex flex-col ${tier.popular ? 'border-primary shadow-lg' : ''}`}
                data-testid={`card-pricing-${tier.id}`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge data-testid="badge-popular" className="bg-primary text-primary-foreground">
                      Most Popular
                    </Badge>
                  </div>
                )}

                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <Icon className="h-8 w-8 text-primary" />
                  </div>
                  <CardTitle className="text-2xl" data-testid={`text-plan-name-${tier.id}`}>
                    {tier.name}
                  </CardTitle>
                  <CardDescription data-testid={`text-plan-description-${tier.id}`}>
                    {tier.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="flex-1">
                  <div className="mb-6">
                    <div className="flex items-baseline">
                      <span className="text-4xl font-bold" data-testid={`text-price-${tier.id}`}>
                        ${tier.price}
                      </span>
                      <span className="text-muted-foreground ml-2">/month</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1" data-testid={`text-limit-${tier.id}`}>
                      {tier.itemLimit}
                    </p>
                  </div>

                  <ul className="space-y-3">
                    {tier.features.map((feature, idx) => (
                      <li 
                        key={idx} 
                        className="flex items-start gap-2"
                        data-testid={`feature-${tier.id}-${idx}`}
                      >
                        <Check 
                          className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                            feature.included ? 'text-primary' : 'text-muted-foreground/30'
                          }`} 
                        />
                        <span 
                          className={`text-sm ${
                            feature.included ? 'text-foreground' : 'text-muted-foreground/50'
                          }`}
                        >
                          {feature.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter>
                  {tier.id === 'free' ? (
                    <Button 
                      asChild 
                      variant="outline" 
                      className="w-full"
                      data-testid={`button-select-${tier.id}`}
                    >
                      <Link href="/signup">{tier.cta}</Link>
                    </Button>
                  ) : (
                    <Button 
                      asChild 
                      variant={tier.popular ? 'default' : 'outline'}
                      className="w-full"
                      data-testid={`button-select-${tier.id}`}
                    >
                      <Link href={`/subscribe?plan=${tier.id}`}>{tier.cta}</Link>
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto mt-16">
          <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
          
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-2">What marketplaces can I post to?</h3>
              <p className="text-muted-foreground">
                Free and Starter plans support manual copy-paste to any marketplace (eBay, Facebook Marketplace, 
                Craigslist, Mercari, etc.). Pro and Business plans add automatic API posting to eBay and Etsy.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">How does the free trial work?</h3>
              <p className="text-muted-foreground">
                All paid plans include a 14-day free trial. No credit card required to start. 
                You'll only be charged after your trial ends.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Can I change plans later?</h3>
              <p className="text-muted-foreground">
                Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately, 
                and we'll prorate any charges.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">What happens if I exceed my item limit?</h3>
              <p className="text-muted-foreground">
                On the Free plan, you'll be prompted to upgrade when you reach 5 items per month. 
                On the Starter plan, you'll be prompted at 50 items. Pro and Business have unlimited items.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">How does SMS-to-listing work?</h3>
              <p className="text-muted-foreground">
                Text a photo to your dedicated phone number, and our AI automatically identifies the product, 
                generates a title and description, and creates a listing ready to post to your marketplaces.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
