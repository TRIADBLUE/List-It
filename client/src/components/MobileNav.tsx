import { Link, useLocation } from "wouter";
import { Home, Package, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MobileNav() {
  const [location] = useLocation();

  const navItems = [
    { path: "/", icon: Home, label: "Dashboard" },
    { path: "/inventory", icon: Package, label: "Inventory" },
    { path: "/add", icon: Plus, label: "Add" },
    { path: "/settings", icon: Settings, label: "Settings" },
  ];

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t md:hidden z-50 shadow-lg">
      <div className="flex items-center justify-around h-16">
        {navItems.map(({ path, icon: Icon, label }) => (
          <Link key={path} href={path}>
            <Button
              variant="ghost"
              size="sm"
              className={`flex flex-col items-center justify-center h-full gap-1 px-4 ${
                isActive(path) ? "text-primary" : "text-muted-foreground"
              }`}
              data-testid={`nav-${label.toLowerCase()}`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs">{label}</span>
            </Button>
          </Link>
        ))}
      </div>
    </nav>
  );
}
