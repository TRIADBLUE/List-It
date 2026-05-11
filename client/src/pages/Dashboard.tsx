import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Item } from "@shared/schema";
import { Package, TrendingUp, DollarSign, Plus, Edit, Trash2 } from "lucide-react";
import { TriageRecoBadge } from "@/components/TriageRecoBadge";
import logoImage from "@assets/Logo_1763024403442.png";

export default function Dashboard() {
  const { data: items = [], isLoading } = useQuery<Item[]>({
    queryKey: ['/api/items'],
  });

  const stats = {
    total: items.length,
    posted: items.filter(i => i.status === 'posted').length,
    draft: items.filter(i => i.status === 'draft').length,
    sold: items.filter(i => i.status === 'sold').length,
    totalValue: items.filter(i => i.status !== 'sold').reduce((sum, i) => sum + i.price, 0),
  };

  const recentItems = items.slice(0, 6);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <img 
          src={logoImage} 
          alt="List It" 
          className="h-12" 
          data-testid="img-logo"
        />
        <p className="text-muted-foreground">The fastest way to sell anything</p>
        <div className="flex justify-end">
          <Link href="/add">
            <Button size="default" data-testid="button-add-item">
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-stat-total">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <Package className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-items">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.draft} draft, {stats.posted} posted
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-posted">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Posted Today</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-posted-today">
              {items.filter(i => {
                const today = new Date().toDateString();
                return i.postedAt && new Date(i.postedAt).toDateString() === today;
              }).length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Listed on marketplaces
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-pending">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Listings</CardTitle>
            <Package className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending-listings">{stats.draft}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Ready to post
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-value">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-value">
              ${(stats.totalValue / 100).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Active inventory
            </p>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Recent Items</h2>
          <Link href="/inventory">
            <Button variant="ghost" size="sm" data-testid="link-view-all">
              View All
            </Button>
          </Link>
        </div>

        {recentItems.length === 0 ? (
          <Card className="p-12">
            <div className="text-center space-y-3">
              <Package className="w-12 h-12 mx-auto text-muted-foreground" />
              <div>
                <h3 className="font-semibold text-lg">No items yet</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Add your first item to get started
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
            {recentItems.map((item) => (
              <Card key={item.id} className="hover-elevate" data-testid={`card-item-${item.id}`}>
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    {item.images.length > 0 ? (
                      <div className="w-20 h-20 rounded-md bg-muted flex-shrink-0 overflow-hidden">
                        <img 
                          src={item.images[0]} 
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                        <Package className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-semibold line-clamp-2 text-sm" data-testid={`text-item-title-${item.id}`}>
                          {item.title}
                        </h3>
                        <Badge 
                          variant={item.status === 'posted' ? 'default' : item.status === 'sold' ? 'secondary' : 'outline'}
                          className="text-xs flex-shrink-0"
                          data-testid={`badge-status-${item.id}`}
                        >
                          {item.status}
                        </Badge>
                      </div>
                      
                      <p className="text-lg font-bold mb-2" data-testid={`text-price-${item.id}`}>
                        ${(item.price / 100).toFixed(2)}
                      </p>
                      
                      <div className="mb-2">
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
                      
                      <div className="flex items-center gap-2">
                        <Link href={`/item/${item.id}`}>
                          <Button size="sm" variant="ghost" data-testid={`button-edit-${item.id}`}>
                            <Edit className="w-3 h-3" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
