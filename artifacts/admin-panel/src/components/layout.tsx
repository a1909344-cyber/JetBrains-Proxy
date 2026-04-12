import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Users, 
  KeyRound, 
  Cpu, 
  TerminalSquare, 
  Activity, 
  Menu
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Accounts", href: "/accounts", icon: Users },
  { name: "API Keys", href: "/keys", icon: KeyRound },
  { name: "Models", href: "/models", icon: Cpu },
  { name: "API Tester", href: "/test", icon: Activity },
  { name: "Logs", href: "/logs", icon: TerminalSquare },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  const NavLinks = () => (
    <div className="flex flex-col gap-1 w-full">
      {navigation.map((item) => {
        const isActive = location === item.href;
        return (
          <Link key={item.name} href={item.href}>
            <Button
              variant={isActive ? "secondary" : "ghost"}
              className={`w-full justify-start ${
                isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground"
              }`}
              onClick={() => setOpen(false)}
              data-testid={`nav-${item.name.toLowerCase().replace(" ", "-")}`}
            >
              <item.icon className="mr-2 h-4 w-4" />
              {item.name}
            </Button>
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6">
        <div className="flex items-center gap-2 px-2 mb-8 text-primary">
          <TerminalSquare className="h-6 w-6" />
          <h1 className="text-xl font-bold tracking-tight">JB Proxy Admin</h1>
        </div>
        <nav className="flex-1">
          <NavLinks />
        </nav>
      </aside>

      {/* Mobile Header & Sidebar */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="md:hidden flex items-center justify-between border-b border-border bg-background px-4 py-3">
          <div className="flex items-center gap-2 text-primary">
            <TerminalSquare className="h-5 w-5" />
            <span className="font-bold">JB Proxy</span>
          </div>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="btn-mobile-menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar border-sidebar-border p-6">
              <div className="flex items-center gap-2 mb-8 text-primary">
                <TerminalSquare className="h-6 w-6" />
                <h1 className="text-xl font-bold">JB Proxy Admin</h1>
              </div>
              <NavLinks />
            </SheetContent>
          </Sheet>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
