import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import { LanguageProvider } from "@/lib/i18n";
import Login from "@/pages/login";
import { getStoredToken, storeToken, clearToken } from "@/lib/api";
import { useState, useEffect, useCallback } from "react";

// Pages
import Dashboard from "@/pages/dashboard";
import Accounts from "@/pages/accounts";
import Keys from "@/pages/keys";
import Models from "@/pages/models";
import Test from "@/pages/test";
import Logs from "@/pages/logs";
import Stats from "@/pages/stats";

const queryClient = new QueryClient();

function Router({ onLogout }: { onLogout: () => void }) {
  return (
    <Layout onLogout={onLogout}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/accounts" component={Accounts} />
        <Route path="/keys" component={Keys} />
        <Route path="/models" component={Models} />
        <Route path="/test" component={Test} />
        <Route path="/logs" component={Logs} />
        <Route path="/stats" component={Stats} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  // null = loading, false = not logged in, true = logged in
  const [authState, setAuthState] = useState<null | boolean>(null);

  const checkAuth = useCallback(async () => {
    const token = getStoredToken();
    if (!token) { setAuthState(false); return; }
    try {
      const res = await fetch("/api/auth/me", {
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
      });
      const data = await res.json() as { loggedIn: boolean };
      setAuthState(data.loggedIn);
      if (!data.loggedIn) clearToken();
    } catch {
      // If API is unreachable, still allow access if token is stored (offline mode)
      setAuthState(!!token);
    }
  }, []);

  useEffect(() => { void checkAuth(); }, [checkAuth]);

  const handleLogin = (token: string) => {
    storeToken(token);
    queryClient.clear();
    setAuthState(true);
  };

  const handleLogout = async () => {
    const token = getStoredToken();
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
      });
    } catch {}
    clearToken();
    queryClient.clear();
    setAuthState(false);
  };

  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            {authState === null ? (
              // Loading auth state
              <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-muted-foreground text-sm">Loading…</div>
              </div>
            ) : authState === false ? (
              <Login onLogin={handleLogin} />
            ) : (
              <Router onLogout={handleLogout} />
            )}
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </LanguageProvider>
  );
}

export default App;
