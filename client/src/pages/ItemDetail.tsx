import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { itemUpdateSchema, type UpdateItem, type Item } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Package, Copy, Check, ArrowLeft, Save, FileText, Edit2, DollarSign, Gauge } from "lucide-react";
import { SiFacebook } from "react-icons/si";
import QuoteGenerator from "@/components/QuoteGenerator";
import { TriageRecoBadge } from "@/components/TriageRecoBadge";
import { PriceInput } from "@/components/PriceInput";

export default function ItemDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showQuoteGenerator, setShowQuoteGenerator] = useState(false);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [overrideAction, setOverrideAction] = useState<string>("");
  const [overrideReason, setOverrideReason] = useState("");

  const { data: item, isLoading } = useQuery<Item>({
    queryKey: ['/api/items', id],
  });

  const form = useForm<UpdateItem>({
    resolver: zodResolver(itemUpdateSchema),
    values: item ? {
      title: item.title,
      description: item.description,
      price: item.price,
      condition: item.condition as any,
      category: item.category,
      status: item.status as any,
    } : undefined,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: UpdateItem) => {
      return await apiRequest("PATCH", `/api/items/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/items', id] });
      toast({
        title: "Item updated",
        description: "Your changes have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update item. Please try again.",
        variant: "destructive",
      });
    },
  });

  const overrideMutation = useMutation({
    mutationFn: async (data: { triageOverride: string; triageOverrideReason: string }) => {
      return await apiRequest("PATCH", `/api/items/${id}/triage-override`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/items', id] });
      setShowOverrideDialog(false);
      setOverrideAction("");
      setOverrideReason("");
      toast({
        title: "Override saved",
        description: "Your triage decision has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save override. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleOverrideSubmit = () => {
    if (!overrideAction) {
      toast({
        title: "Selection required",
        description: "Please select a triage decision.",
        variant: "destructive",
      });
      return;
    }
    overrideMutation.mutate({
      triageOverride: overrideAction,
      triageOverrideReason: overrideReason,
    });
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
      toast({
        title: "Copied!",
        description: "Listing copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const generateMarketplaceListing = (platform: 'ebay' | 'facebook' | 'craigslist') => {
    if (!item) return "";

    const price = (item.price / 100).toFixed(2);
    
    switch (platform) {
      case 'ebay':
        return `${item.title}

${item.description}

Condition: ${item.condition}
Category: ${item.category}
Price: $${price}

Photos: ${item.images.length} image${item.images.length !== 1 ? 's' : ''} attached

Payment: PayPal, Credit Cards accepted
Shipping: Calculated at checkout
Returns: 30 day return policy`;

      case 'facebook':
        return `${item.title} - $${price}

${item.description}

Condition: ${item.condition}
Category: ${item.category}

Local pickup available. Message for more details!`;

      case 'craigslist':
        return `${item.title} - $${price} (Your City)

${item.description}

Condition: ${item.condition}
Category: ${item.category}

Cash or Venmo accepted
Local pickup only
Serious inquiries only please

Contact via email for fastest response`;

      default:
        return "";
    }
  };

  const onSubmit = (data: UpdateItem) => {
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Package className="w-16 h-16 text-muted-foreground" />
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Item not found</h2>
          <p className="text-muted-foreground mb-4">This item may have been deleted</p>
          <Button onClick={() => setLocation("/inventory")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Inventory
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/inventory")} data-testid="button-back">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold" data-testid="text-item-title">{item.title}</h1>
          <p className="text-muted-foreground mt-1">
            Added {new Date(item.createdAt).toLocaleDateString()}
            {item.source === 'sms' && ' via SMS'}
          </p>
        </div>
        <Badge variant={item.status === 'posted' ? 'default' : item.status === 'sold' ? 'secondary' : 'outline'}>
          {item.status}
        </Badge>
      </div>

      <Tabs defaultValue="edit" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="edit" data-testid="tab-edit">Edit Details</TabsTrigger>
          <TabsTrigger value="listings" data-testid="tab-listings">Marketplace Listings</TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="space-y-6">
          {item && (item.recommendedAction || item.triageOverride) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>AI Triage Analysis</span>
                  <Dialog open={showOverrideDialog} onOpenChange={(open) => {
                    if (open && item) {
                      // Pre-populate with existing override data when opening
                      setOverrideAction(item.triageOverride || "");
                      setOverrideReason(item.triageOverrideReason || "");
                    }
                    setShowOverrideDialog(open);
                  }}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" data-testid="button-override-triage">
                        <Edit2 className="h-4 w-4 mr-2" />
                        Override
                      </Button>
                    </DialogTrigger>
                    <DialogContent data-testid="dialog-override-triage">
                      <DialogHeader>
                        <DialogTitle>Override Triage Decision</DialogTitle>
                        <DialogDescription>
                          Manually set the recommended action for this item. This will override the AI recommendation.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-3">
                          <Label>Recommendation</Label>
                          <RadioGroup value={overrideAction} onValueChange={setOverrideAction}>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="post_now" id="post_now" data-testid="radio-post-now" />
                              <Label htmlFor="post_now" className="font-normal cursor-pointer">
                                Post Now - Item is ready to list
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="clean_and_post" id="clean_and_post" data-testid="radio-clean-and-post" />
                              <Label htmlFor="clean_and_post" className="font-normal cursor-pointer">
                                Clean & Post - Needs cleanup first
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="skip" id="skip" data-testid="radio-skip" />
                              <Label htmlFor="skip" className="font-normal cursor-pointer">
                                Skip - Not worth posting
                              </Label>
                            </div>
                          </RadioGroup>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="reason">Reason (Optional)</Label>
                          <Textarea
                            id="reason"
                            placeholder="Why are you overriding the AI recommendation?"
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            className="min-h-20"
                            data-testid="textarea-override-reason"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setShowOverrideDialog(false)}
                          data-testid="button-cancel-override"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleOverrideSubmit}
                          disabled={overrideMutation.isPending}
                          data-testid="button-submit-override"
                        >
                          {overrideMutation.isPending ? "Saving..." : "Save Override"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Recommendation</p>
                      <TriageRecoBadge
                        recommendedAction={item.recommendedAction as any}
                        triageOverride={item.triageOverride as any}
                        triageReasoning={item.triageReasoning}
                        triageOverrideReason={item.triageOverrideReason}
                        triageConfidence={item.triageConfidence}
                        estimatedValue={item.estimatedValue}
                      />
                    </div>
                    {item.triageReasoning && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">AI Reasoning</p>
                        <p className="text-sm" data-testid="text-triage-reasoning">{item.triageReasoning}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      {item.estimatedValue !== null && item.estimatedValue !== undefined && (
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">Estimated Value</p>
                            <p className="font-semibold" data-testid="text-estimated-value">
                              ${(item.estimatedValue / 100).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      )}
                      {item.triageConfidence !== null && item.triageConfidence !== undefined && (
                        <div className="flex items-center gap-2">
                          <Gauge className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">Confidence</p>
                            <p className="font-semibold" data-testid="text-triage-confidence">
                              {item.triageConfidence}%
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Photos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {item.images.length > 0 ? (
                      <div className="grid grid-cols-2 gap-4">
                        {item.images.map((url, index) => (
                          <div key={index} className="aspect-square rounded-lg overflow-hidden bg-muted">
                            <img src={url} alt={`Item ${index + 1}`} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="aspect-square rounded-lg bg-muted flex items-center justify-center">
                        <Package className="w-12 h-12 text-muted-foreground" />
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Item Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Title</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-edit-title" className="h-12" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea className="min-h-32" {...field} data-testid="input-edit-description" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="price"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Price</FormLabel>
                            <FormControl>
                              <PriceInput
                                value={field.value}
                                onChange={field.onChange}
                                onBlur={field.onBlur}
                                className="h-12"
                                data-testid="input-edit-price"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="condition"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Condition</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-edit-condition" className="h-12">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="New">New</SelectItem>
                                <SelectItem value="Like New">Like New</SelectItem>
                                <SelectItem value="Good">Good</SelectItem>
                                <SelectItem value="Fair">Fair</SelectItem>
                                <SelectItem value="Poor">Poor</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-edit-category" className="h-12" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-status" className="h-12">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="draft">Draft</SelectItem>
                              <SelectItem value="posted">Posted</SelectItem>
                              <SelectItem value="sold">Sold</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </div>

              <Button type="submit" className="w-full h-12" disabled={updateMutation.isPending} data-testid="button-save-changes">
                {updateMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </form>
          </Form>
        </TabsContent>

        <TabsContent value="listings" className="space-y-4">
          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Copy className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">Copy & Paste Listings</h3>
                  <p className="text-sm text-muted-foreground">
                    We've generated optimized listings for each marketplace. Click the copy button below each listing, 
                    then paste it into the marketplace platform when you create your listing there.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowQuoteGenerator(true)}
                  data-testid="button-generate-quote"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Custom Quote
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-primary-foreground font-bold text-sm">
                  e
                </div>
                <CardTitle>eBay Listing</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea 
                value={generateMarketplaceListing('ebay')}
                readOnly
                className="font-mono text-sm min-h-64"
                data-testid="textarea-ebay-listing"
              />
              <Button 
                variant="outline" 
                className="w-full h-12"
                onClick={() => copyToClipboard(generateMarketplaceListing('ebay'), 'ebay')}
                data-testid="button-copy-ebay"
              >
                {copiedField === 'ebay' ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy eBay Listing
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <SiFacebook className="w-6 h-6 text-blue-600" />
                <CardTitle>Facebook Marketplace</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea 
                value={generateMarketplaceListing('facebook')}
                readOnly
                className="font-mono text-sm min-h-48"
                data-testid="textarea-facebook-listing"
              />
              <Button 
                variant="outline"
                className="w-full h-12"
                onClick={() => copyToClipboard(generateMarketplaceListing('facebook'), 'facebook')}
                data-testid="button-copy-facebook"
              >
                {copiedField === 'facebook' ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Facebook Listing
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-purple-600 rounded flex items-center justify-center text-white font-bold text-sm">
                  CL
                </div>
                <CardTitle>Craigslist</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea 
                value={generateMarketplaceListing('craigslist')}
                readOnly
                className="font-mono text-sm min-h-56"
                data-testid="textarea-craigslist-listing"
              />
              <Button 
                variant="outline"
                className="w-full h-12"
                onClick={() => copyToClipboard(generateMarketplaceListing('craigslist'), 'craigslist')}
                data-testid="button-copy-craigslist"
              >
                {copiedField === 'craigslist' ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Craigslist Listing
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {showQuoteGenerator && (
        <QuoteGenerator
          item={item}
          onClose={() => setShowQuoteGenerator(false)}
        />
      )}
    </div>
  );
}
