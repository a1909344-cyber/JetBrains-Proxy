import { useState } from "react";
import { useGetAdminStatus } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, Server, Users, KeyRound, Cpu, AlertTriangle, Wifi, WifiOff, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useLang } from "@/lib/i18n";
import { adminFetch } from "@/lib/api";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

type NetResult = { name: string; url: string; ok: boolean; status?: number; error?: string; ms: number };

export default function Dashboard() {
  const { t, lang } = useLang();
  const { data: status, isLoading, isError } = useGetAdminStatus({
    query: { refetchInterval: 10000 }
  });

  const [netTesting, setNetTesting] = useState(false);
  const [netResults, setNetResults] = useState<NetResult[] | null>(null);

  const handleNetworkTest = async () => {
    setNetTesting(true);
    setNetResults(null);
    try {
      const res = await adminFetch(`${BASE}/api/admin/network-test`);
      const data = await res.json();
      setNetResults(data.results);
    } catch (e) {
      setNetResults([{ name: "API Server", url: "", ok: false, error: (e as Error).message, ms: 0 }]);
    } finally {
      setNetTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">{t("dash_title")}</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">{t("dash_title")}</h1>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("common_error")}</AlertTitle>
          <AlertDescription>{t("dash_err_desc")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t("dash_title")}</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="relative flex h-3 w-3">
            {status?.online && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${status?.online ? 'bg-primary' : 'bg-destructive'}`}></span>
          </span>
          <span data-testid="status-online">{status?.online ? t("dash_online") : t("dash_offline")}</span>
        </div>
      </div>

      {status?.error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("dash_error")}</AlertTitle>
          <AlertDescription data-testid="status-error">{status.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className={!status?.online ? 'border-destructive' : 'border-primary/50'}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("dash_proxy_status")}</CardTitle>
            <Server className={`h-4 w-4 ${status?.online ? 'text-primary' : 'text-destructive'}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-status-code">
              {status?.online
                ? (status?.proxyStatusCode === 200 ? (lang === "en" ? "OK" : "正常") : `HTTP ${status?.proxyStatusCode}`)
                : t("dash_offline_val")}
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate" title={status?.proxyUrl}>
              {status?.online && status?.proxyStatusCode === 401
                ? (lang === "en" ? "Running · no API key set" : "运行中 · 未配置 API Key")
                : (status?.proxyUrl || "N/A")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("dash_accounts")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-account-count">{status?.accountCount ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">{t("dash_accounts_sub")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("dash_apikeys")}</CardTitle>
            <KeyRound className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-key-count">{status?.keyCount ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">{t("dash_apikeys_sub")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("dash_models")}</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-model-count">{status?.modelCount ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">{t("dash_models_sub")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Network connectivity diagnostics */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wifi className="h-4 w-4" />
              {lang === "en" ? "Container Network Diagnostics" : "容器网络诊断"}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {lang === "en"
                ? "Test if the API server container can reach JetBrains servers"
                : "检测 API 服务容器能否访问 JetBrains 外部服务器"}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleNetworkTest} disabled={netTesting}>
            {netTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
            <span className="ml-2">{netTesting ? (lang === "en" ? "Testing…" : "检测中…") : (lang === "en" ? "Run Test" : "开始检测")}</span>
          </Button>
        </CardHeader>
        {netResults && (
          <CardContent>
            <div className="space-y-2">
              {netResults.map((r, i) => (
                <div key={i} className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${r.ok ? 'bg-primary/5 text-primary' : 'bg-destructive/5 text-destructive'}`}>
                  <div className="flex items-center gap-2">
                    {r.ok
                      ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                      : <XCircle className="h-4 w-4 shrink-0" />}
                    <span className="font-medium">{r.name}</span>
                    {r.error && <span className="text-xs opacity-70 truncate max-w-xs">{r.error}</span>}
                  </div>
                  <span className="text-xs opacity-60 shrink-0 ml-2">
                    {r.ok ? `HTTP ${r.status} · ${r.ms}ms` : `${r.ms}ms`}
                  </span>
                </div>
              ))}
              {netResults.every(r => !r.ok) && (
                <p className="text-xs text-muted-foreground pt-1">
                  {lang === "en"
                    ? "All checks failed. The container may not have internet access. Check your Docker DNS settings or firewall rules."
                    : "全部检测失败。容器可能无法访问外网，请检查 Docker DNS 配置或防火墙规则。"}
                </p>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      <div className="text-xs text-muted-foreground">
        {t("dash_data_dir")}: <code className="bg-muted px-1 py-0.5 rounded">{status?.dataDir}</code>
      </div>
    </div>
  );
}
