import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Item } from "@shared/schema";
import { Package, Edit, Trash2, Plus } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TriageRecoBadge } from "@/components/TriageRecoBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Inventory() {
  const [filter, setFilter] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: items = [], isLoading } = useQuery<Item[]>({
    queryKey: ['/api/items'],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/items'] });
      toast({
        title: "Item deleted",
        description: "The item has been removed from your inventory.",
      });
      setDeleteId(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete item. Please try again.",
        variant: "destructive",
      });
    },
  });

  const filteredItems = items.filter(item => {
    if (filter === "all") return true;
    return item.status === filter;
  });

  const filters = [
    { value: "all", label: "All Items", count: items.length },
    { value: "draft", label: "Draft", count: items.filter(i => i.status === 'draft').length },
    { value: "posted", label: "Posted", count: items.filter(i => i.status === 'posted').length },
    { value: "sold", label: "Sold", count: items.filter(i => i.status === 'sold').length },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-inventory-title">Inventory</h1>
          <p className="text-muted-foreground mt-1">{items.length} total items</p>
        </div>
        <Link href="/add">
          <Button size="default" data-testid="button-add-item">
            <Plus className="w-4 h-4 mr-2" />
            Add Item
          </Button>
        </Link>
      </div>

      <div className="flex gap-2 flex-wrap sticky top-0 bg-background py-2 z-10">
        {filters.map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f.value)}
            data-testid={`button-filter-${f.value}`}
            className="rounded-full"
          >
            {f.label}
            <Badge variant="secondary" className="ml-2 text-xs">
              {f.count}
            </Badge>
          </Button>
        ))}
      </div>

      {filteredItems.length === 0 ? (
        <Card className="p-12">
          <div className="text-center space-y-3">
            <Package className="w-12 h-12 mx-auto text-muted-foreground" />
            <div>
              <h3 className="font-semibold text-lg">No items found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {filter === "all" 
                  ? "Add your first item to get started"
                  : `No ${filter} items yet`
                }
              </p>
            </div>
            <Link href="/add">
              <Button data-testid="button-add-first-item">
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <Card key={item.id} className="hover-elevate overflow-hidden" data-testid={`card-item-${item.id}`}>
              <div className="aspect-square bg-muted relative">
                {item.images.length > 0 ? (
                  <img 
                    src={item.images[0]} 
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-16 h-16 text-muted-foreground" />
                  </div>
                )}
                <div className="absolute top-2 right-2">
                  <Badge 
                    variant={item.status === 'posted' ? 'default' : item.status === 'sold' ? 'secondary' : 'outline'}
                    className="text-xs"
                    data-testid={`badge-status-${item.id}`}
                  >
                    {item.status}
                  </Badge>
                </div>
              </div>
              
              <CardContent className="p-4">
                <h3 className="font-semibold line-clamp-2 mb-2" data-testid={`text-item-title-${item.id}`}>
                  {item.title}
                </h3>
                
                <p className="text-lg font-bold mb-1" data-testid={`text-price-${item.id}`}>
                  ${(item.price / 100).toFixed(2)}
                </p>
                
                <p className="text-xs text-muted-foreground mb-3">
                  {item.condition} • {item.category}
                </p>
                
                <div className="mb-3">
                  <TriageRecoBadge
                    recommendedAction={item.recommendedAction as any}
                    triageOverride={item.triageOverride as any}
                    triageReasoning={item.triageReasoning}
                    triageOverrideReason={item.triageOverrideReason}
                    triageConfidence={item.triageConfidence}
                    estimatedValue={item.estimatedValue}
                    className="text-xs"
                  />
                </div>
                
                {item.postedAt && (
                  <p className="text-xs text-muted-foreground mb-3">
                    Posted {new Date(item.postedAt).toLocaleDateString()}
                  </p>
                )}
                
                <div className="flex gap-2">
                  <Link href={`/item/${item.id}`} className="flex-1">
                    <Button size="sm" variant="outline" className="w-full" data-testid={`button-edit-${item.id}`}>
                      <Edit className="w-3 h-3 mr-2" />
                      Edit
                    </Button>
                  </Link>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setDeleteId(item.id)}
                    data-testid={`button-delete-${item.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this item? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
