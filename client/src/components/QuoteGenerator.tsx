import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Item } from "@shared/schema";

interface QuoteGeneratorProps {
  item: Item;
  onClose: () => void;
}

const marketplaceTemplates = {
  ebay: {
    name: "eBay",
    template: (item: Item, price: string, shipping: string) => `
${item.title}

${item.description}

Price: $${price}
Shipping: ${shipping}
Condition: ${item.condition}
${item.category ? `Category: ${item.category}` : ''}

Thanks for your interest! Feel free to ask any questions.
    `.trim(),
  },
  facebook: {
    name: "Facebook Marketplace",
    template: (item: Item, price: string, shipping: string) => `
${item.title}

${item.description}

Price: $${price}
Shipping: ${shipping}
Condition: ${item.condition}

Pickup or delivery available. Message me with any questions!
    `.trim(),
  },
  craigslist: {
    name: "Craigslist",
    template: (item: Item, price: string, shipping: string) => `
${item.title} - $${price}

${item.description}

Details:
- Price: $${price}
- Shipping: ${shipping}
- Condition: ${item.condition}
${item.category ? `- Category: ${item.category}` : ''}

Cash or Venmo accepted. Contact for more info.
    `.trim(),
  },
  custom: {
    name: "Custom",
    template: (item: Item, price: string, shipping: string) => `
${item.title}

${item.description}

Price: $${price}
Shipping: ${shipping}
Condition: ${item.condition}
    `.trim(),
  },
};

export default function QuoteGenerator({ item, onClose }: QuoteGeneratorProps) {
  const [marketplace, setMarketplace] = useState<keyof typeof marketplaceTemplates>("ebay");
  const [customPrice, setCustomPrice] = useState((item.price / 100).toFixed(2));
  const [shipping, setShipping] = useState("Free shipping");
  const [customTemplate, setCustomTemplate] = useState("");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const generatedQuote = marketplace === "custom" && customTemplate
    ? customTemplate
    : marketplaceTemplates[marketplace].template(item, customPrice, shipping);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedQuote);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Quote copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Copy failed",
        description: "Could not copy to clipboard",
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>Generate Quote</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="marketplace">Marketplace</Label>
              <Select
                value={marketplace}
                onValueChange={(value) => setMarketplace(value as keyof typeof marketplaceTemplates)}
              >
                <SelectTrigger id="marketplace" data-testid="select-marketplace">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(marketplaceTemplates).map(([key, { name }]) => (
                    <SelectItem key={key} value={key}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Price ($)</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                placeholder="0.00"
                data-testid="input-custom-price"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="shipping">Shipping</Label>
            <Input
              id="shipping"
              value={shipping}
              onChange={(e) => setShipping(e.target.value)}
              placeholder="e.g., Free shipping, $10 flat rate"
              data-testid="input-shipping"
            />
          </div>

          {marketplace === "custom" && (
            <div className="space-y-2">
              <Label htmlFor="custom-template">Custom Template</Label>
              <Textarea
                id="custom-template"
                value={customTemplate}
                onChange={(e) => setCustomTemplate(e.target.value)}
                placeholder="Write your custom quote template..."
                className="min-h-[100px]"
                data-testid="textarea-custom-template"
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Generated Quote</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopy}
                data-testid="button-copy-quote"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <Textarea
              value={generatedQuote}
              readOnly
              className="min-h-[200px] font-mono text-sm"
              data-testid="textarea-generated-quote"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={onClose}
              data-testid="button-close-quote"
            >
              Close
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
