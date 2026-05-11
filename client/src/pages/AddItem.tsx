import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { insertItemSchema, type InsertItem } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Camera, X, Plus, Upload, Sparkles, Check, XCircle, Loader2, TrendingUp, TrendingDown, AlertCircle, Zap } from "lucide-react";
import { PriceInput } from "@/components/PriceInput";
import { UpgradePrompt } from "@/components/UpgradePrompt";

interface AiSuggestions {
  title?: string;
  description?: string;
  category?: string;
  price?: number; // Price in cents
  recommendedAction?: 'post_now' | 'clean_and_post' | 'skip' | 'insufficient_data';
  estimatedValue?: number; // Price in cents
  triageReasoning?: string;
  triageConfidence?: number;
  status: 'idle' | 'analyzing' | 'completed' | 'failed';
}

interface ImageMetadata {
  url: string;
  hash: string;
}

interface UpgradePromptState {
  open: boolean;
  currentPlan: 'free' | 'starter' | 'pro' | 'business';
  limitType: 'items' | 'sms' | 'autoPost';
  current: number;
  limit: number;
}

export default function AddItem() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [images, setImages] = useState<string[]>([]);
  const [imageMetadata, setImageMetadata] = useState<ImageMetadata[]>([]);
  const [uploading, setUploading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestions>({ status: 'idle' });
  const [upgradePrompt, setUpgradePrompt] = useState<UpgradePromptState>({
    open: false,
    currentPlan: 'free',
    limitType: 'items',
    current: 0,
    limit: 0,
  });

  const form = useForm<InsertItem>({
    resolver: zodResolver(insertItemSchema),
    defaultValues: {
      title: "",
      description: "",
      price: 0,
      condition: "Good",
      category: "",
      images: [],
      status: "draft",
      source: "manual",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertItem) => {
      return await apiRequest("POST", "/api/items", { ...data, images });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/items'] });
      toast({
        title: "Item added",
        description: "Your item has been added to inventory.",
      });
      setLocation("/inventory");
    },
    onError: (error: any) => {
      const errorData = error?.body;
      
      if (errorData?.upgradeRequired) {
        setUpgradePrompt({
          open: true,
          currentPlan: errorData.plan || 'free',
          limitType: 'items',
          current: errorData.current || 0,
          limit: errorData.limit || 0,
        });
      } else {
        toast({
          title: "Error",
          description: errorData?.message || "Failed to add item. Please try again.",
          variant: "destructive",
        });
      }
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const isFirstImage = images.length === 0;
    
    try {
      const uploadedUrls: string[] = [];
      const uploadedMetadata: ImageMetadata[] = [];
      
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        
        if (response.ok) {
          const { url, imageHash } = await response.json();
          uploadedUrls.push(url);
          uploadedMetadata.push({ url, hash: imageHash });
        }
      }
      
      setImages(prev => [...prev, ...uploadedUrls]);
      setImageMetadata(prev => [...prev, ...uploadedMetadata]);
      
      // Trigger AI analysis on first image upload
      if (isFirstImage && uploadedMetadata.length > 0) {
        analyzeImage(uploadedMetadata[0]);
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Could not upload images. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const analyzeImage = async (metadata: ImageMetadata) => {
    setAiSuggestions({ status: 'analyzing' });
    
    try {
      const response = await fetch('/api/ai/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: metadata.url, imageHash: metadata.hash }),
      });
      
      if (!response.ok) {
        throw new Error('Analysis failed');
      }
      
      const result = await response.json();
      
      if (result.status === 'completed') {
        // Call triage analysis endpoint to get worth-it assessment
        let triageData = {};
        try {
          const triageRes = await fetch('/api/ai/triage-preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              insights: [result],
              imageCount: imageMetadata.length
            }),
          });
          if (triageRes.ok) {
            triageData = await triageRes.json();
          }
        } catch (err) {
          console.error('Triage preview failed:', err);
        }
        
        setAiSuggestions({
          title: result.suggestedTitle || undefined,
          description: result.suggestedDescription || undefined,
          category: result.suggestedCategory || undefined,
          price: result.suggestedPrice || undefined,
          ...triageData,
          status: 'completed',
        });
      } else if (result.status === 'failed') {
        setAiSuggestions({ status: 'failed' });
        toast({
          title: "Analysis unavailable",
          description: result.error || "Could not analyze image.",
          variant: "destructive",
        });
      }
    } catch (error) {
      setAiSuggestions({ status: 'failed' });
      console.error('AI analysis error:', error);
    }
  };

  const acceptSuggestion = (field: 'title' | 'description' | 'category' | 'price') => {
    const value = aiSuggestions[field];
    if (value !== undefined) {
      form.setValue(field, value);
      toast({
        title: "Suggestion applied",
        description: `${field.charAt(0).toUpperCase() + field.slice(1)} updated from AI analysis.`,
      });
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = (data: InsertItem) => {
    createMutation.mutate(data);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-add-item-title">Add New Item</h1>
        <p className="text-muted-foreground mt-1">Fill in the details for your storage unit find</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Photos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {images.map((url, index) => (
                  <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                    <img src={url} alt={`Upload ${index + 1}`} className="w-full h-full object-cover" />
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="absolute top-2 right-2 h-8 w-8"
                      onClick={() => removeImage(index)}
                      data-testid={`button-remove-image-${index}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                
                <label className="aspect-square rounded-lg border-2 border-dashed border-border hover-elevate flex flex-col items-center justify-center cursor-pointer bg-muted/30">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageUpload}
                    disabled={uploading}
                    data-testid="input-image-upload"
                  />
                  {uploading ? (
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  ) : (
                    <>
                      <Camera className="w-8 h-8 text-muted-foreground mb-2" />
                      <span className="text-xs text-muted-foreground">Add Photo</span>
                    </>
                  )}
                </label>
              </div>
            </CardContent>
          </Card>

          {aiSuggestions.status === 'analyzing' && (
            <Alert data-testid="alert-ai-analyzing">
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription className="ml-2">
                Analyzing your photo with AI...
              </AlertDescription>
            </Alert>
          )}

          {aiSuggestions.status === 'completed' && (aiSuggestions.title || aiSuggestions.description || aiSuggestions.category || aiSuggestions.price) && (
            <Card data-testid="card-ai-suggestions">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">AI Suggestions</CardTitle>
                  <Badge variant="secondary" className="ml-auto">From photo</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {aiSuggestions.title && (
                  <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-md">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">Suggested Title</p>
                      <p className="text-sm font-medium truncate">{aiSuggestions.title}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => acceptSuggestion('title')}
                      data-testid="button-accept-title"
                      className="shrink-0"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Accept
                    </Button>
                  </div>
                )}
                
                {aiSuggestions.description && (
                  <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-md">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">Suggested Description</p>
                      <p className="text-sm line-clamp-2">{aiSuggestions.description}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => acceptSuggestion('description')}
                      data-testid="button-accept-description"
                      className="shrink-0"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Accept
                    </Button>
                  </div>
                )}
                
                {aiSuggestions.category && (
                  <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-md">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">Suggested Category</p>
                      <p className="text-sm font-medium">{aiSuggestions.category}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => acceptSuggestion('category')}
                      data-testid="button-accept-category"
                      className="shrink-0"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Accept
                    </Button>
                  </div>
                )}
                
                {aiSuggestions.price && (
                  <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-md">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">Suggested Price</p>
                      <p className="text-sm font-medium">${(aiSuggestions.price / 100).toFixed(2)}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => acceptSuggestion('price')}
                      data-testid="button-accept-price"
                      className="shrink-0"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Accept
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {aiSuggestions.recommendedAction && (
            <Card className={
              aiSuggestions.recommendedAction === 'post_now' ? 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20' :
              aiSuggestions.recommendedAction === 'skip' ? 'border-red-500/50 bg-red-50/50 dark:bg-red-950/20' :
              aiSuggestions.recommendedAction === 'clean_and_post' ? 'border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20' :
              'border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20'
            } data-testid="card-worth-it-assessment">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  {aiSuggestions.recommendedAction === 'post_now' && <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />}
                  {aiSuggestions.recommendedAction === 'skip' && <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />}
                  {aiSuggestions.recommendedAction === 'clean_and_post' && <Zap className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />}
                  {aiSuggestions.recommendedAction === 'insufficient_data' && <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
                  
                  <CardTitle className="text-lg">
                    {aiSuggestions.recommendedAction === 'post_now' && <span className="text-green-600 dark:text-green-400">WORTH IT - List now!</span>}
                    {aiSuggestions.recommendedAction === 'skip' && <span className="text-red-600 dark:text-red-400">SKIP - Not worth it</span>}
                    {aiSuggestions.recommendedAction === 'clean_and_post' && <span className="text-yellow-600 dark:text-yellow-400">Clean & Post</span>}
                    {aiSuggestions.recommendedAction === 'insufficient_data' && <span className="text-blue-600 dark:text-blue-400">Need More Info</span>}
                  </CardTitle>
                  
                  {aiSuggestions.triageConfidence && (
                    <Badge variant="secondary" className="ml-auto">
                      {aiSuggestions.triageConfidence}% confidence
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {aiSuggestions.estimatedValue && (
                  <div className="flex items-center justify-between p-3 bg-background/50 rounded-md">
                    <span className="text-sm text-muted-foreground">Estimated Value</span>
                    <span className="text-lg font-bold">${(aiSuggestions.estimatedValue / 100).toFixed(2)}</span>
                  </div>
                )}
                
                {aiSuggestions.triageReasoning && (
                  <div className="text-sm text-muted-foreground">
                    {aiSuggestions.triageReasoning}
                  </div>
                )}
                
                {imageMetadata.length < 3 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="ml-2">
                      <strong>Pro tip:</strong> Upload 3 photos (different angles) for more accurate value estimates and recommendations.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

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
                      <Input placeholder="Vintage desk lamp" {...field} data-testid="input-title" className="h-12" />
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
                      <Textarea 
                        placeholder="Describe the item in detail..."
                        className="min-h-32"
                        {...field}
                        data-testid="input-description"
                      />
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
                          data-testid="input-price"
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
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-condition" className="h-12">
                            <SelectValue placeholder="Select condition" />
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
                      <Input placeholder="Furniture, Electronics, etc." {...field} data-testid="input-category" className="h-12" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation("/inventory")}
              className="flex-1 h-12"
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 h-12"
              disabled={createMutation.isPending}
              data-testid="button-save"
            >
              {createMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>

      <UpgradePrompt
        open={upgradePrompt.open}
        onOpenChange={(open) => setUpgradePrompt(prev => ({ ...prev, open }))}
        currentPlan={upgradePrompt.currentPlan}
        limitType={upgradePrompt.limitType}
        current={upgradePrompt.current}
        limit={upgradePrompt.limit}
      />
    </div>
  );
}
