import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { BarChart2, KeyRound, Users, RefreshCcw, Trash2 } from "lucide-react";
import { adminFetch } from "@/lib/api";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

type StatEntry = {
  label: string;
  call_count: number;
  input_chars: number;
  output_chars: number;
  last_call_at: number;
};

function formatChars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatTime(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString();
}

function StatRow({ label, entry, lang }: { label: string; entry: StatEntry; lang: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-xs truncate max-w-[180px]" title={label}>{label}</span>
      </div>
      <div className="flex items-center gap-6 text-right shrink-0">
        <div>
          <div className="text-sm font-bold tabular-nums">{entry.call_count.toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground">{lang === "en" ? "calls" : "次调用"}</div>
        </div>
        <div>
          <div className="text-sm font-bold tabular-nums text-blue-500">{formatChars(entry.input_chars)}</div>
          <div className="text-[10px] text-muted-foreground">{lang === "en" ? "in chars" : "输入字符"}</div>
        </div>
        <div>
          <div className="text-sm font-bold tabular-nums text-green-500">{formatChars(entry.output_chars)}</div>
          <div className="text-[10px] text-muted-foreground">{lang === "en" ? "out chars" : "输出字符"}</div>
        </div>
        <div className="hidden md:block">
          <div className="text-xs text-muted-foreground">{formatTime(entry.last_call_at)}</div>
          <div className="text-[10px] text-muted-foreground">{lang === "en" ? "last call" : "最近调用"}</div>
        </div>
      </div>
    </div>
  );
}

export default function Stats() {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [resetting, setResetting] = useState(false);

  const { data: rawStats, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["adminStats"],
    queryFn: async () => {
      const res = await adminFetch(`${BASE}/api/admin/stats`);
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json() as Promise<Record<string, StatEntry>>;
    },
    refetchInterval: 15000,
  });

  const keyEntries = Object.entries(rawStats ?? {})
    .filter(([k]) => k.startsWith("apikey:"))
    .map(([, v]) => v)
    .sort((a, b) => b.call_count - a.call_count);

  const accountEntries = Object.entries(rawStats ?? {})
    .filter(([k]) => k.startsWith("license:"))
    .map(([, v]) => v)
    .sort((a, b) => b.call_count - a.call_count);

  const totalCalls = keyEntries.reduce((s, e) => s + e.call_count, 0) || accountEntries.reduce((s, e) => s + e.call_count, 0);
  const totalIn = keyEntries.reduce((s, e) => s + e.input_chars, 0) || accountEntries.reduce((s, e) => s + e.input_chars, 0);
  const totalOut = keyEntries.reduce((s, e) => s + e.output_chars, 0) || accountEntries.reduce((s, e) => s + e.output_chars, 0);

  const handleReset = async () => {
    if (!window.confirm(lang === "en" ? "Reset all usage statistics? This cannot be undone." : "确认重置所有调用统计？此操作不可撤销。")) return;
    setResetting(true);
    try {
      const res = await adminFetch(`${BASE}/api/admin/stats/reset`, { method: "POST" });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["getAdminStats"] });
        await refetch();
        toast({ title: lang === "en" ? "Stats reset" : "统计已重置" });
      }
    } catch (e) {
      toast({ title: lang === "en" ? "Reset failed" : "重置失败", variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("nav_stats")}</h1>
          <p className="text-muted-foreground mt-1">
            {lang === "en" ? "API call counts and character usage per key and account" : "按 API 密钥和 JetBrains 账号统计调用次数与字符用量"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            {lang === "en" ? "Refresh" : "刷新"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} disabled={resetting} className="text-destructive hover:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            {lang === "en" ? "Reset All" : "重置统计"}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{lang === "en" ? "Total Calls" : "总调用次数"}</CardTitle>
            <BarChart2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold">{totalCalls.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{lang === "en" ? "Input Characters" : "输入字符总量"}</CardTitle>
            <BarChart2 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold text-blue-500">{formatChars(totalIn)}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{lang === "en" ? "Output Characters" : "输出字符总量"}</CardTitle>
            <BarChart2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold text-green-500">{formatChars(totalOut)}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-API-key stats */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">
              {lang === "en" ? "Per Client API Key" : "按客户端 API 密钥统计"}
            </CardTitle>
            <Badge variant="secondary">{keyEntries.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : keyEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4 text-center">
              {lang === "en"
                ? "No data yet. Per-key tracking starts after the next API call."
                : "暂无数据。下次 API 调用后会自动开始统计。"}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {keyEntries.map((e, i) => (
                <StatRow key={i} label={e.label} entry={e} lang={lang} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-JetBrains-account stats */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">
              {lang === "en" ? "Per JetBrains Account" : "按 JetBrains 账号统计"}
            </CardTitle>
            <Badge variant="secondary">{accountEntries.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : accountEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4 text-center">
              {lang === "en" ? "No data yet." : "暂无数据。"}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {accountEntries.map((e, i) => (
                <StatRow key={i} label={e.label} entry={e} lang={lang} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
