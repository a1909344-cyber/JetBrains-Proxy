import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Users, 
  KeyRound, 
  Cpu, 
  TerminalSquare, 
  Activity, 
  BarChart2,
  Menu,
  Languages,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { useLang } from "@/lib/i18n";

interface LayoutProps {
  children: React.ReactNode;
  onLogout?: () => void;
}

export function Layout({ children, onLogout }: LayoutProps) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const { t, lang, setLang } = useLang();

  const navigation = [
    { key: "nav_dashboard", href: "/", icon: LayoutDashboard },
    { key: "nav_accounts", href: "/accounts", icon: Users },
    { key: "nav_apikeys", href: "/keys", icon: KeyRound },
    { key: "nav_models", href: "/models", icon: Cpu },
    { key: "nav_tester", href: "/test", icon: Activity },
    { key: "nav_logs", href: "/logs", icon: TerminalSquare },
    { key: "nav_stats", href: "/stats", icon: BarChart2 },
  ] as const;

  const LangToggle = () => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setLang(lang === "zh" ? "en" : "zh")}
      className="w-full justify-start gap-2 text-sidebar-foreground text-xs font-mono mt-1"
      title={lang === "zh" ? "Switch to English" : "切换为中文"}
    >
      <Languages className="h-4 w-4 shrink-0" />
      {lang === "zh" ? "EN / 英文" : "中文 / ZH"}
    </Button>
  );

  const LogoutButton = () => onLogout ? (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        if (window.confirm(t("login_logout_confirm"))) onLogout();
      }}
      className="w-full justify-start gap-2 text-sidebar-foreground text-xs mt-1 hover:text-destructive hover:bg-destructive/10"
      title={t("login_logout")}
    >
      <LogOut className="h-4 w-4 shrink-0" />
      {t("login_logout")}
    </Button>
  ) : null;

  const NavLinks = () => (
    <div className="flex flex-col gap-1 w-full">
      {navigation.map((item) => {
        const isActive = location === item.href;
        const name = t(item.key as any);
        return (
          <Link key={item.key} href={item.href}>
            <Button
              variant={isActive ? "secondary" : "ghost"}
              className={`w-full justify-start ${
                isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground"
              }`}
              onClick={() => setOpen(false)}
              data-testid={`nav-${item.key.replace("nav_", "")}`}
            >
              <item.icon className="mr-2 h-4 w-4" />
              {name}
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
          <h1 className="text-xl font-bold tracking-tight">{t("app_title")}</h1>
        </div>
        <nav className="flex-1">
          <NavLinks />
        </nav>
        <div className="border-t border-sidebar-border pt-3 mt-3">
          <LangToggle />
          <LogoutButton />
        </div>
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
                <h1 className="text-xl font-bold">{t("app_title")}</h1>
              </div>
              <NavLinks />
              <div className="border-t border-sidebar-border pt-3 mt-3">
                <LangToggle />
                <LogoutButton />
              </div>
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
