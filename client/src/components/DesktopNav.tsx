import { Link, useLocation } from "wouter";
import { Home, Package, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoImage from "@assets/Logo_1763024403442.png";

export function DesktopNav() {
  const [location] = useLocation();

  const navItems = [
    { path: "/", icon: Home, label: "Dashboard" },
    { path: "/inventory", icon: Package, label: "Inventory" },
    { path: "/add", icon: Plus, label: "Add Item" },
    { path: "/settings", icon: Settings, label: "Settings" },
  ];

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center px-4">
        <Link href="/">
          <img 
            src={logoImage} 
            alt="List It" 
            className="h-8 mr-8 cursor-pointer" 
            data-testid="img-nav-logo"
          />
        </Link>

        <nav className="flex items-center gap-2 flex-1">
          {navItems.map(({ path, icon: Icon, label }) => (
            <Link key={path} href={path}>
              <Button
                variant={isActive(path) ? "default" : "ghost"}
                size="sm"
                className="gap-2"
                data-testid={`nav-${label.toLowerCase().replace(' ', '-')}`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Button>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
