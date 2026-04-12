import { useGetAdminStatus } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Server, Users, KeyRound, Cpu, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useLang } from "@/lib/i18n";

export default function Dashboard() {
  const { t } = useLang();
  const { data: status, isLoading, isError } = useGetAdminStatus({
    query: { refetchInterval: 10000 }
  });

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
              {status?.online ? (status?.proxyStatusCode || t("dash_running")) : t("dash_offline_val")}
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate" title={status?.proxyUrl}>
              {status?.proxyUrl || 'N/A'}
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
      
      <div className="text-xs text-muted-foreground">
        {t("dash_data_dir")}: <code className="bg-muted px-1 py-0.5 rounded">{status?.dataDir}</code>
      </div>
    </div>
  );
}
