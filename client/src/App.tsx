import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MobileNav } from "@/components/MobileNav";
import { DesktopNav } from "@/components/DesktopNav";
import { websocketClient } from "@/lib/websocket";
import Dashboard from "@/pages/Dashboard";
import Inventory from "@/pages/Inventory";
import AddItem from "@/pages/AddItem";
import ItemDetail from "@/pages/ItemDetail";
import Settings from "@/pages/Settings";
import Pricing from "@/pages/Pricing";
import Subscribe from "@/pages/Subscribe";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import NotFound from "@/pages/not-found";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  
  const { data: user, isLoading } = useQuery({
    queryKey: ['/api/auth/me'],
    retry: false,
  });

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation('/login');
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/subscribe">
        <AuthGuard>
          <Subscribe />
        </AuthGuard>
      </Route>
      <Route path="/">
        <AuthGuard>
          <Dashboard />
        </AuthGuard>
      </Route>
      <Route path="/inventory">
        <AuthGuard>
          <Inventory />
        </AuthGuard>
      </Route>
      <Route path="/add">
        <AuthGuard>
          <AddItem />
        </AuthGuard>
      </Route>
      <Route path="/item/:id">
        <AuthGuard>
          <ItemDetail />
        </AuthGuard>
      </Route>
      <Route path="/settings">
        <AuthGuard>
          <Settings />
        </AuthGuard>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [location] = useLocation();
  const isAuthPage = location === '/login' || location === '/signup' || location === '/pricing';

  useEffect(() => {
    if (!isAuthPage) {
      websocketClient.connect();
      return () => {
        websocketClient.disconnect();
      };
    }
  }, [isAuthPage]);

  if (isAuthPage) {
    return <Router />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="hidden md:block">
        <DesktopNav />
      </div>
      
      <main className="container mx-auto px-4 py-6 pb-24 md:pb-6">
        <Router />
      </main>

      <div className="md:hidden">
        <MobileNav />
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
