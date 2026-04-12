import { useState } from "react";
import { useGetJetbrainsAccounts, usePutJetbrainsAccounts, getGetJetbrainsAccountsQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Edit, Plus, CheckCircle2, XCircle, Clock, Power, FlaskConical, Loader2, ChevronDown, ChevronUp, BarChart2, RotateCcw, Zap, BookOpen, Copy, Check, LogIn, ExternalLink, KeyRound, Eye, EyeOff } from "lucide-react";
import { JetbrainsAccount } from "@workspace/api-client-react/src/generated/api.schemas";
import { Skeleton } from "@/components/ui/skeleton";
import { useLang } from "@/lib/i18n";
import { adminFetch } from "@/lib/api";

type ExtendedAccount = JetbrainsAccount & {
  enabled?: boolean;
  grazieAgent?: string;
  jwtRefreshUrl?: string;
  extraRefreshHeaders?: Record<string, string>;
  extraRefreshBody?: Record<string, unknown>;
};

const DEFAULT_GRAZIE_AGENT = '{"name":"aia:pycharm","version":"251.26094.80.13:251.26094.141"}';
const DEFAULT_JWT_URL = "https://api.jetbrains.ai/auth/jetbrains-jwt/provide-access/license/v2";
const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

type AccountStats = {
  label: string;
  call_count: number;
  input_chars: number;
  output_chars: number;
  last_call_at: number;
};

function accountKey(acc: ExtendedAccount): string {
  if (acc.licenseId) return `license:${acc.licenseId}`;
  const jwt = acc.jwt || "";
  return `jwt:${jwt.slice(0, 16)}`;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function estTokens(chars: number): string {
  return fmtNum(Math.round(chars / 4));
}

async function callTestJwtRefresh(params: {
  licenseId: string;
  authorization: string;
  grazieAgent?: string;
  jwtRefreshUrl?: string;
  extraHeaders?: Record<string, string>;
  extraBody?: Record<string, unknown>;
}) {
  const res = await adminFetch(`${BASE}/api/admin/test-jwt-refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      licenseId: params.licenseId,
      authorization: params.authorization,
      grazieAgent: params.grazieAgent || DEFAULT_GRAZIE_AGENT,
      includeGrazieAgent: true,
      url: params.jwtRefreshUrl || DEFAULT_JWT_URL,
      extraHeaders: params.extraHeaders || {},
      extraBody: params.extraBody || {},
    }),
  });
  return res.json();
}

function parseJsonSafe(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s); } catch { return null; }
}

export default function Accounts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t, lang } = useLang();

  const { data: accounts, isLoading } = useGetJetbrainsAccounts();
  const putAccounts = usePutJetbrainsAccounts();

  const { data: statsData, refetch: refetchStats } = useQuery<Record<string, AccountStats>>({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const res = await adminFetch(`${BASE}/api/admin/stats`);
      return res.ok ? res.json() : {};
    },
    refetchInterval: 10000,
  });

  const [resettingStats, setResettingStats] = useState(false);
  const handleResetStats = async () => {
    setResettingStats(true);
    try {
      await adminFetch(`${BASE}/api/admin/stats/reset`, { method: "POST" });
      refetchStats();
      toast({ title: t("acc_stats_reset_ok") });
    } catch {
      toast({ title: t("acc_error"), variant: "destructive" });
    } finally {
      setResettingStats(false);
    }
  };

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [testingIndex, setTestingIndex] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, { ok: boolean; detail: string; debug?: unknown }>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [guideTab, setGuideTab] = useState<"capture" | "win" | "mac" | "linux">("capture");
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Password login state
  const [pwEmail, setPwEmail] = useState("");
  const [pwPassword, setPwPassword] = useState("");
  const [pwShowPass, setPwShowPass] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handlePasswordLogin = async () => {
    if (!pwEmail.trim()) { setPwMsg({ ok: false, text: t("add_pw_err_email") }); return; }
    if (!pwPassword.trim()) { setPwMsg({ ok: false, text: t("add_pw_err_pass") }); return; }
    setPwLoading(true);
    setPwMsg(null);
    try {
      const res = await adminFetch(`${BASE}/api/admin/password-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pwEmail.trim(), password: pwPassword.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.message || data.error || "Login failed";
        setPwMsg({ ok: false, text: msg });
        return;
      }
      queryClient.invalidateQueries({ queryKey: getGetJetbrainsAccountsQueryKey() });
      const desc = data.trialActivated
        ? t("add_pw_success_trial", { email: data.email })
        : t("add_pw_success", { email: data.email });
      toast({ title: t("acc_saved"), description: desc });
      setPwEmail("");
      setPwPassword("");
      setIsAddOpen(false);
    } catch (e) {
      setPwMsg({ ok: false, text: (e as Error).message });
    } finally {
      setPwLoading(false);
    }
  };

  // OAuth flow state
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);
  const [oauthCallbackUrl, setOauthCallbackUrl] = useState("");
  const [oauthLicenseId, setOauthLicenseId] = useState("");
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthMsg, setOauthMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleOauthStart = async () => {
    setOauthLoading(true);
    setOauthMsg(null);
    setOauthUrl(null);
    try {
      const res = await adminFetch(`${BASE}/api/admin/oauth/start`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get OAuth URL");
      setOauthUrl(data.url);
    } catch (e) {
      setOauthMsg({ ok: false, text: (e as Error).message });
    } finally {
      setOauthLoading(false);
    }
  };

  const handleOauthCallback = async () => {
    if (!oauthCallbackUrl.trim()) { setOauthMsg({ ok: false, text: t("add_oauth_err_url") }); return; }
    if (!oauthLicenseId.trim()) { setOauthMsg({ ok: false, text: t("add_oauth_err_lid") }); return; }
    setOauthLoading(true);
    setOauthMsg(null);
    try {
      const res = await adminFetch(`${BASE}/api/admin/oauth/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_url: oauthCallbackUrl.trim(), license_id: oauthLicenseId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "OAuth callback failed");
      queryClient.invalidateQueries({ queryKey: getGetJetbrainsAccountsQueryKey() });
      toast({ title: t("acc_saved"), description: t("add_oauth_success", { email: data.email }) });
      setOauthUrl(null);
      setOauthCallbackUrl("");
      setOauthLicenseId("");
      setIsAddOpen(false);
    } catch (e) {
      setOauthMsg({ ok: false, text: (e as Error).message });
    } finally {
      setOauthLoading(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  };

  const handleQuickImport = () => {
    const text = importText.trim();
    if (!text) { setImportMsg({ ok: false, text: t("add_import_empty") }); return; }

    let licenseId = "";
    let authorization = "";
    let jwt = "";

    // --- Try to extract licenseId ---
    const licenseMatch = text.match(/"licenseId"\s*:\s*"([^"]+)"/);
    if (licenseMatch) licenseId = licenseMatch[1];

    // --- Try to extract Authorization Bearer token ---
    // Handles: cURL -H 'Authorization: Bearer xxx', raw HTTP header, or query param
    const authMatch = text.match(/[Aa]uthorization[:\s'"]+Bearer\s+([A-Za-z0-9\-_.~+/]+=*)/);
    if (authMatch) authorization = authMatch[1];

    // --- Try to extract grazie-authenticate-jwt ---
    const jwtMatch = text.match(/grazie-authenticate-jwt[:\s'"]+([A-Za-z0-9\-_.~+/]+=*)/);
    if (jwtMatch) jwt = jwtMatch[1];

    const found: string[] = [];
    if (licenseId) found.push(`License ID: ${licenseId}`);
    if (authorization) found.push(`Authorization Token (${authorization.slice(0, 12)}…)`);
    if (jwt) found.push(`JWT Token (${jwt.slice(0, 12)}…)`);

    if (found.length === 0) {
      setImportMsg({ ok: false, text: t("add_import_fail") });
      return;
    }

    setFormData({
      ...formData,
      ...(licenseId ? { licenseId } : {}),
      ...(authorization ? { authorization } : {}),
      ...(jwt ? { jwt } : {}),
    });
    setImportText("");
    setImportMsg({ ok: true, text: t("add_import_ok") + found.join(", ") });
  };

  const [formData, setFormData] = useState<ExtendedAccount & { extraHeadersRaw: string; extraBodyRaw: string }>({
    jwt: "",
    licenseId: "",
    authorization: "",
    enabled: true,
    grazieAgent: "",
    jwtRefreshUrl: "",
    extraHeadersRaw: "",
    extraBodyRaw: "",
  });

  const saveAccounts = (newAccounts: ExtendedAccount[], successMsg?: string) => {
    putAccounts.mutate({ data: newAccounts }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetJetbrainsAccountsQueryKey() });
        toast({ title: successMsg || t("acc_saved") });
      },
      onError: (err: any) => {
        toast({ title: t("acc_error"), description: err.message || t("acc_error"), variant: "destructive" });
      }
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accounts) return;

    const typedAccounts = accounts as ExtendedAccount[];
    const newAccounts = [...typedAccounts];

    const extraHeaders = parseJsonSafe(formData.extraHeadersRaw) as Record<string, string> | null;
    const extraBody = parseJsonSafe(formData.extraBodyRaw);

    const accountToSave: ExtendedAccount = {
      jwt: formData.jwt || null,
      licenseId: formData.licenseId || null,
      authorization: formData.authorization || null,
      enabled: formData.enabled !== false,
      grazieAgent: formData.grazieAgent || undefined,
      jwtRefreshUrl: formData.jwtRefreshUrl || undefined,
      extraRefreshHeaders: extraHeaders || undefined,
      extraRefreshBody: extraBody || undefined,
    };

    if (editingIndex !== null) {
      newAccounts[editingIndex] = { ...newAccounts[editingIndex], ...accountToSave };
    } else {
      // Dedup: find existing account with the same licenseId or email
      const dedupKey = (formData.licenseId || (accountToSave as any).email || "").trim();
      const existingIdx = dedupKey
        ? typedAccounts.findIndex(a =>
            (a.licenseId && a.licenseId === dedupKey) ||
            ((a as any).email && (a as any).email === dedupKey)
          )
        : -1;

      if (existingIdx !== -1) {
        // Merge into existing — update credentials, preserve other metadata
        newAccounts[existingIdx] = { ...newAccounts[existingIdx], ...accountToSave };
        toast({ title: lang === "en" ? "Account updated (duplicate merged)" : "账号已更新（重复账号已合并）" });
      } else {
        newAccounts.push(accountToSave);
      }
    }

    putAccounts.mutate({ data: newAccounts }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetJetbrainsAccountsQueryKey() });
        toast({ title: t("acc_saved") });
        setIsAddOpen(false);
        setEditingIndex(null);
        resetForm();
      },
      onError: (err: any) => {
        toast({ title: t("acc_error"), description: err.message || t("acc_error"), variant: "destructive" });
      }
    });
  };

  const resetForm = () => {
    setFormData({ jwt: "", licenseId: "", authorization: "", enabled: true, grazieAgent: "", jwtRefreshUrl: "", extraHeadersRaw: "", extraBodyRaw: "" });
    setShowAdvanced(false);
  };

  const handleDelete = (index: number) => {
    if (!accounts) return;
    if (!confirm(t("acc_delete_confirm"))) return;
    const newAccounts = (accounts as ExtendedAccount[]).filter((_, i) => i !== index);
    saveAccounts(newAccounts, t("acc_deleted"));
  };

  const handleToggleEnabled = (index: number) => {
    if (!accounts) return;
    const typedAccounts = accounts as ExtendedAccount[];
    const newAccounts = typedAccounts.map((acc, i) => {
      if (i !== index) return acc;
      return { ...acc, enabled: acc.enabled === false ? true : false };
    });
    const isNowEnabled = newAccounts[index].enabled !== false;
    saveAccounts(newAccounts, isNowEnabled ? "Account Enabled" : "Account Disabled");
  };

  const handleTestJwt = async (index: number) => {
    const acc = (accounts as ExtendedAccount[])?.[index];
    if (!acc?.licenseId || !acc?.authorization) return;
    setTestingIndex(index);
    setTestResults(prev => { const n = { ...prev }; delete n[index]; return n; });
    try {
      const result = await callTestJwtRefresh({
        licenseId: acc.licenseId,
        authorization: acc.authorization,
        grazieAgent: acc.grazieAgent,
        jwtRefreshUrl: acc.jwtRefreshUrl,
        extraHeaders: acc.extraRefreshHeaders,
        extraBody: acc.extraRefreshBody,
      });
      const data = result.data as Record<string, unknown> | undefined;
      const state = data?.state as string | undefined;
      const hasToken = !!data?.token;
      // JetBrains deprecated `state` — token presence is the real success indicator
      const ok = result.ok && hasToken;

      const stateNote = state
        ? `state=${state} (⚠ state字段已废弃，JetBrains 官方将用 is_internal 替代，不能作为判断依据)`
        : "";

      const raw = JSON.stringify(result.data, null, 2);
      const debugJson = result.debug
        ? JSON.stringify(result.debug, null, 2)
        : result.error
          ? `Request failed with error:\n${result.error}`
          : "(no debug info available)";
      const detail = ok
        ? `JWT 获取成功！${stateNote ? "\n注意：" + stateNote : ""}`
        : hasToken === false
          ? `响应中无 token 字段 — 凭证可能无效\n\nResponse:\n${raw}\n\nSent Request:\n${debugJson}`
          : `未知错误 (HTTP ${result.status})\n\nResponse:\n${raw}\n\nSent Request:\n${debugJson}`;
      setTestResults(prev => ({ ...prev, [index]: { ok, detail, debug: result.debug } }));
    } catch (e: any) {
      setTestResults(prev => ({ ...prev, [index]: { ok: false, detail: e.message } }));
    } finally {
      setTestingIndex(null);
    }
  };

  const openEdit = (index: number) => {
    if (!accounts) return;
    const acc = accounts[index] as ExtendedAccount;
    setFormData({
      jwt: acc.jwt || "",
      licenseId: acc.licenseId || "",
      authorization: acc.authorization || "",
      enabled: acc.enabled !== false,
      grazieAgent: acc.grazieAgent || "",
      jwtRefreshUrl: acc.jwtRefreshUrl || "",
      extraHeadersRaw: acc.extraRefreshHeaders ? JSON.stringify(acc.extraRefreshHeaders, null, 2) : "",
      extraBodyRaw: acc.extraRefreshBody ? JSON.stringify(acc.extraRefreshBody, null, 2) : "",
    });
    setShowAdvanced(!!(acc.grazieAgent || acc.jwtRefreshUrl || acc.extraRefreshHeaders || acc.extraRefreshBody));
    setEditingIndex(index);
    setIsAddOpen(true);
  };

  const getMode = (acc: ExtendedAccount) => {
    if ((acc as Record<string, unknown>).refresh_token) return "OAuth";
    if (acc.jwt && !acc.licenseId) return "JWT Only";
    if (acc.licenseId && acc.authorization) return "License + Auth";
    if (acc.jwt && acc.licenseId) return "JWT + License";
    return "Incomplete";
  };

  const formatDate = (ts?: number | null) => {
    if (!ts) return "Never";
    return new Date(ts * 1000).toLocaleString();
  };

  const isEnabled = (acc: ExtendedAccount) => acc.enabled !== false;
  const isLicenseMode = (acc: ExtendedAccount) => !!(acc.licenseId && acc.authorization);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("acc_title")}</h1>
          <p className="text-muted-foreground mt-2">{t("acc_desc")}</p>
        </div>

        <div className="flex gap-2 items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetStats}
            disabled={resettingStats}
            title={t("acc_reset_stats")}
            data-testid="btn-reset-stats"
          >
            {resettingStats ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
            {t("acc_reset_stats")}
          </Button>

        <Dialog open={isAddOpen} onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) { setEditingIndex(null); resetForm(); setImportText(""); setImportMsg(null); setShowGuide(false); setOauthUrl(null); setOauthCallbackUrl(""); setOauthLicenseId(""); setOauthMsg(null); setPwEmail(""); setPwPassword(""); setPwMsg(null); }
        }}>
          <DialogTrigger asChild>
            <Button data-testid="btn-add-account">
              <Plus className="mr-2 h-4 w-4" />
              {t("acc_add")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingIndex !== null ? t("acc_edit") : t("acc_add")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">

              {/* ── Password Login (only show for new accounts) — fully automatic ── */}
              {editingIndex === null && (
                <div className="rounded-md border-2 border-emerald-500/60 bg-emerald-500/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">{t("add_pw_title")}</span>
                    <span className="text-xs bg-emerald-500/20 text-emerald-600 px-1.5 py-0.5 rounded font-medium">{t("add_pw_badge")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("add_pw_desc")}</p>
                  <div className="space-y-2">
                    <Input
                      placeholder={t("add_pw_email_placeholder")}
                      type="email"
                      value={pwEmail}
                      onChange={e => { setPwEmail(e.target.value); setPwMsg(null); }}
                      className="text-sm"
                      disabled={pwLoading}
                    />
                    <div className="relative">
                      <Input
                        placeholder={t("add_pw_pass_placeholder")}
                        type={pwShowPass ? "text" : "password"}
                        value={pwPassword}
                        onChange={e => { setPwPassword(e.target.value); setPwMsg(null); }}
                        className="text-sm pr-9"
                        disabled={pwLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setPwShowPass(v => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                      >
                        {pwShowPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handlePasswordLogin}
                      disabled={pwLoading}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {pwLoading ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <KeyRound className="mr-1.5 h-3 w-3" />}
                      {t("add_pw_submit")}
                    </Button>
                  </div>
                  {pwMsg && (
                    <div className={`flex items-start gap-2 text-xs rounded px-2 py-1.5 border ${pwMsg.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600" : "bg-destructive/10 border-destructive/30 text-destructive"}`}>
                      {pwMsg.ok ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                      <span>{pwMsg.text}</span>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground/60">{t("add_pw_note")}</p>
                </div>
              )}

              {/* ── OAuth Login (only show for new accounts) — OUTSIDE <form> so Enter key can't submit ── */}
              {editingIndex === null && (
                <div className="rounded-md border-2 border-primary/50 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <LogIn className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold text-primary uppercase tracking-wider">{t("add_oauth_title")}</span>
                    <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">{t("add_oauth_badge")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("add_oauth_desc")}</p>

                  {/* Step 1: Get OAuth URL */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                      <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">1</span>
                      {t("add_oauth_step1")}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleOauthStart}
                        disabled={oauthLoading}
                        variant="outline"
                        className="border-primary/50 text-primary hover:bg-primary/10"
                      >
                        {oauthLoading ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <LogIn className="mr-1.5 h-3 w-3" />}
                        {t("add_oauth_get_url")}
                      </Button>
                      {oauthUrl && (
                        <a
                          href={oauthUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                        >
                          <ExternalLink className="h-3 w-3" /> {t("add_oauth_open")}
                        </a>
                      )}
                    </div>
                    {oauthUrl && (
                      <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1.5 border border-border">
                        {t("add_oauth_redirect_tip")}
                      </p>
                    )}
                  </div>

                  {/* Step 2: Paste callback URL */}
                  {oauthUrl && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                        <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">2</span>
                        {t("add_oauth_step2")}
                      </div>
                      <Input
                        placeholder="http://localhost:3000/?code=abc123&state=xyz..."
                        value={oauthCallbackUrl}
                        onChange={e => { setOauthCallbackUrl(e.target.value); setOauthMsg(null); }}
                        className="font-mono text-xs"
                      />

                      <div className="flex items-center gap-2 text-xs font-medium text-foreground mt-1">
                        <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">3</span>
                        {t("add_oauth_step3")}
                        <a
                          href="https://account.jetbrains.com/licenses"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-0.5"
                        >
                          <ExternalLink className="h-2.5 w-2.5" /> account.jetbrains.com/licenses
                        </a>
                      </div>
                      <Input
                        placeholder="WDVWPRAT3B"
                        value={oauthLicenseId}
                        onChange={e => { setOauthLicenseId(e.target.value); setOauthMsg(null); }}
                        className="font-mono"
                      />

                      <Button
                        type="button"
                        size="sm"
                        onClick={handleOauthCallback}
                        disabled={oauthLoading}
                        className="mt-1"
                      >
                        {oauthLoading ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3 w-3" />}
                        {t("add_oauth_submit")}
                      </Button>
                    </div>
                  )}

                  {/* OAuth result message */}
                  {oauthMsg && (
                    <div className={`flex items-start gap-2 text-xs rounded px-2 py-1.5 border ${oauthMsg.ok ? "bg-primary/10 border-primary/30 text-primary" : "bg-destructive/10 border-destructive/30 text-destructive"}`}>
                      {oauthMsg.ok ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                      <span>{oauthMsg.text}</span>
                    </div>
                  )}
                </div>
              )}

              {editingIndex === null && (
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-muted-foreground/20" /></div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">{t("add_or_manual")}</span>
                  </div>
                </div>
              )}

              {/* ── Manual entry form ── */}
              <form onSubmit={handleSave} className="space-y-4">

              {/* ── Quick Import ── */}
              <div className="rounded-md border-2 border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">{t("add_import_title")}</span>
                </div>
                <p className="text-xs text-muted-foreground">{t("add_import_desc")}</p>
                <Textarea
                  placeholder={t("add_import_placeholder")}
                  value={importText}
                  onChange={e => { setImportText(e.target.value); setImportMsg(null); }}
                  className="font-mono text-xs h-28 resize-none"
                />
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" onClick={handleQuickImport} className="bg-amber-500 hover:bg-amber-600 text-white border-0">
                    <Zap className="mr-1.5 h-3 w-3" /> {t("add_import_btn")}
                  </Button>
                  {importMsg && (
                    <span className={`text-xs ${importMsg.ok ? "text-primary" : "text-destructive"}`}>
                      {importMsg.ok ? <CheckCircle2 className="inline h-3 w-3 mr-1" /> : <XCircle className="inline h-3 w-3 mr-1" />}
                      {importMsg.text}
                    </span>
                  )}
                </div>
              </div>

              {/* ── 获取凭据指南 ── */}
              <div className="rounded-md border border-border bg-card overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/30 transition-colors"
                  onClick={() => setShowGuide(v => !v)}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    {t("add_guide_title")}
                  </span>
                  {showGuide ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                {showGuide && (
                  <div className="border-t border-border">
                    {/* Tab Bar */}
                    <div className="flex border-b border-border text-xs font-medium">
                      {(["capture", "win", "mac", "linux"] as const).map(tab => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setGuideTab(tab)}
                          className={`px-3 py-2 transition-colors ${guideTab === tab ? "border-b-2 border-primary text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground"}`}
                        >
                          {tab === "capture" ? t("add_guide_capture") : tab === "win" ? t("add_guide_win") : tab === "mac" ? t("add_guide_mac") : t("add_guide_linux")}
                        </button>
                      ))}
                    </div>

                    <div className="p-4 space-y-3 text-xs text-muted-foreground">
                      {guideTab === "capture" && (
                        <div className="space-y-3">
                          <p className="text-foreground font-medium">使用抓包工具捕获 IDE 请求（推荐，最可靠）</p>
                          <ol className="space-y-2 list-decimal list-inside">
                            <li>安装 <strong>Proxyman</strong>（macOS，免费）、<strong>Fiddler Classic</strong>（Windows，免费）或 <strong>Charles Proxy</strong>（全平台）并配置系统代理</li>
                            <li>打开抓包工具，开始捕获</li>
                            <li>在 JetBrains IDE 中触发一次 AI 功能（AI Assistant 聊天或代码补全）</li>
                            <li>在抓包工具中搜索 <code className="bg-muted px-1 rounded font-mono">api.jetbrains.ai</code></li>
                            <li>找到 <code className="bg-muted px-1 rounded font-mono">POST /auth/jetbrains-jwt/provide-access/license/v2</code> 请求</li>
                            <li>右键 → <strong>Copy as cURL</strong>（或「复制为 cURL」），粘贴到上方「快速导入」框中</li>
                          </ol>
                          <div className="rounded bg-muted/50 p-3 space-y-1 font-mono text-[11px] border border-border">
                            <p className="text-muted-foreground">目标请求示例：</p>
                            <p>POST https://api.jetbrains.ai/auth/jetbrains-jwt/provide-access/license/v2</p>
                            <p className="text-primary">Authorization: Bearer <span className="opacity-60">eyJhbGciOiJSUzI1NiJ9...</span></p>
                            <p className="text-amber-500">Body: {`{"licenseId":"WDVWPRAT3B"}`}</p>
                          </div>
                          <p className="text-amber-500/80">也可以直接找 <code className="bg-muted px-1 rounded">grazie-authenticate-jwt</code> 请求头（Mode A / JWT Only），但该 JWT 约 1 小时过期，需要手动刷新。</p>
                        </div>
                      )}

                      {guideTab === "win" && (
                        <div className="space-y-3">
                          <p className="text-foreground font-medium">Windows — 从注册表提取 JetBrains 授权 Token</p>
                          <p>JetBrains IDE 将 OAuth Token 存储在 Windows 注册表中。在 PowerShell 中运行：</p>
                          <div className="relative">
                            <pre className="rounded bg-muted/60 p-3 text-[11px] font-mono overflow-x-auto border border-border leading-relaxed whitespace-pre-wrap">
{`# 在 PowerShell 中运行（需要先打开 IDE 并登录 JetBrains 账号）
$basePath = "HKCU:\\Software\\JavaSoft\\Prefs\\jetbrains\\toolbox"
if (Test-Path $basePath) {
    Get-ItemProperty $basePath | Format-List *
} else {
    # 尝试通用路径
    Get-ChildItem "HKCU:\\Software\\JavaSoft\\Prefs" -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "jetbrains" } |
    ForEach-Object { Get-ItemProperty $_.PSPath }
}`}
                            </pre>
                            <button type="button" className="absolute top-2 right-2 text-muted-foreground hover:text-foreground p-1 rounded" onClick={() => copyToClipboard(`$basePath = "HKCU:\\Software\\JavaSoft\\Prefs\\jetbrains\\toolbox"\nif (Test-Path $basePath) {\n    Get-ItemProperty $basePath | Format-List *\n} else {\n    Get-ChildItem "HKCU:\\Software\\JavaSoft\\Prefs" -Recurse -ErrorAction SilentlyContinue |\n    Where-Object { $_.Name -match "jetbrains" } |\n    ForEach-Object { Get-ItemProperty $_.PSPath }\n}`, "win")}>
                              {copiedKey === "win" ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                          <p className="text-amber-500/80">⚠ Token 是机器绑定的加密数据，若无法直接读取，建议使用「抓包」方法。</p>
                        </div>
                      )}

                      {guideTab === "mac" && (
                        <div className="space-y-3">
                          <p className="text-foreground font-medium">macOS — 从 Java Preferences 或 Keychain 提取</p>
                          <p>在终端中运行以下命令查找 JetBrains 存储的 token：</p>
                          <div className="relative">
                            <pre className="rounded bg-muted/60 p-3 text-[11px] font-mono overflow-x-auto border border-border leading-relaxed whitespace-pre-wrap">
{`# 方法1：查找 Java UserPrefs（~/.java/.userPrefs/）
find ~/.java/.userPrefs -name "*.xml" 2>/dev/null | xargs grep -l "token\\|auth\\|license" 2>/dev/null | head -5

# 方法2：查找 JetBrains 配置目录
find ~/Library/Application\ Support/JetBrains -name "*.xml" 2>/dev/null | xargs grep -l "licenseId\\|accessToken" 2>/dev/null | head -10

# 方法3：Keychain 搜索（可能需要密码授权）
security find-generic-password -s "JetBrains" -g 2>&1 | grep -E "acct|svce|password"`}
                            </pre>
                            <button type="button" className="absolute top-2 right-2 text-muted-foreground hover:text-foreground p-1 rounded" onClick={() => copyToClipboard(`find ~/.java/.userPrefs -name "*.xml" 2>/dev/null | xargs grep -l "token|auth|license" 2>/dev/null | head -5`, "mac")}>
                              {copiedKey === "mac" ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                          <p>或使用 <strong>Proxyman</strong>（macOS 原生，界面友好）配置为系统代理后抓包，操作更简单。</p>
                        </div>
                      )}

                      {guideTab === "linux" && (
                        <div className="space-y-3">
                          <p className="text-foreground font-medium">Linux — 从 Java UserPrefs 或配置文件提取</p>
                          <p>JetBrains IDE 在 Linux 上将认证信息存储在 <code className="bg-muted px-1 rounded">~/.java/.userPrefs/</code> 目录下：</p>
                          <div className="relative">
                            <pre className="rounded bg-muted/60 p-3 text-[11px] font-mono overflow-x-auto border border-border leading-relaxed whitespace-pre-wrap">
{`# 查找包含认证信息的 XML 文件
find ~/.java/.userPrefs -name "*.xml" 2>/dev/null | xargs grep -l "token\\|auth\\|licenseId" 2>/dev/null

# 查看内容（替换为上面找到的文件路径）
cat ~/.java/.userPrefs/jetbrains/.../prefs.xml

# 或在 JetBrains 配置目录中查找
find ~/.config/JetBrains -name "*.xml" 2>/dev/null | xargs grep -l "licenseId\\|accessToken" 2>/dev/null | head -10`}
                            </pre>
                            <button type="button" className="absolute top-2 right-2 text-muted-foreground hover:text-foreground p-1 rounded" onClick={() => copyToClipboard(`find ~/.java/.userPrefs -name "*.xml" 2>/dev/null | xargs grep -l "token|auth|licenseId" 2>/dev/null\ncat ~/.java/.userPrefs/jetbrains/.../prefs.xml`, "linux")}>
                              {copiedKey === "linux" ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                          <p>找到 <code className="bg-muted px-1 rounded font-mono">licenseId</code> 和 <code className="bg-muted px-1 rounded font-mono">accessToken</code>（即 Authorization）后，粘贴到上方快速导入框即可。</p>
                          <p className="text-amber-500/80">⚠ 若文件不存在或内容加密，建议使用 Wireshark 或 mitmproxy 抓包。</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Mode A */}
              <div className="rounded-md border-2 border-primary/40 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-primary uppercase tracking-wider">{t("add_mode_a")}</span>
                  <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">{t("add_mode_a_badge")}</span>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="jwt">JWT Token (<code className="text-primary bg-primary/10 px-1 rounded text-xs">grazie-authenticate-jwt</code>)</Label>
                  <Input
                    id="jwt"
                    placeholder="eyJhbGci..."
                    value={formData.jwt || ''}
                    onChange={e => setFormData({...formData, jwt: e.target.value})}
                    data-testid="input-jwt"
                    className="font-mono text-xs"
                  />
                  <div className="text-xs text-muted-foreground space-y-1 pt-0.5">
                    <p>{t("add_mode_a_jwt_hint1")} <code className="bg-muted px-1 rounded font-mono">grazie-authenticate-jwt</code> {t("add_mode_a_jwt_hint2")}</p>
                    <p className="text-amber-500/80">{t("add_mode_a_jwt_warn")}</p>
                  </div>
                </div>
              </div>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-muted-foreground/20" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">{t("add_or_adv")}</span>
                </div>
              </div>

              {/* Mode B */}
              <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("add_mode_b")}</span>
                </div>
                <p className="text-xs text-amber-500/80">
                  ⚠ 需抓包 <code className="bg-muted px-1 rounded">POST /auth/jetbrains-jwt/provide-access/license/v2</code> 请求获取凭证。如果测试返回 <code className="bg-muted px-1 rounded">state=NONE</code>，展开下方「高级」调整参数后重测。
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="licenseId">License ID</Label>
                  <Input
                    id="licenseId"
                    placeholder="WDVWPRAT3B"
                    value={formData.licenseId || ''}
                    onChange={e => setFormData({...formData, licenseId: e.target.value})}
                    data-testid="input-license"
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">请求体中的 <code className="bg-muted px-1 rounded">licenseId</code> 字段</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="authorization">Authorization Token</Label>
                  <Input
                    id="authorization"
                    placeholder="eyJhbGci... (不含 Bearer 前缀)"
                    value={formData.authorization || ''}
                    onChange={e => setFormData({...formData, authorization: e.target.value})}
                    data-testid="input-auth"
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    请求头 <code className="bg-muted px-1 rounded">Authorization: Bearer xxx</code> 的值，<strong>不含</strong> <code className="bg-muted px-1 rounded">Bearer </code>。
                  </p>
                </div>

                {/* Advanced section */}
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
                  onClick={() => setShowAdvanced(v => !v)}
                >
                  {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {t("add_adv_title")}
                </button>

                {showAdvanced && (
                  <div className="space-y-3 border-t border-border pt-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="grazieAgent">grazie-agent 头 (留空用默认值)</Label>
                      <Input
                        id="grazieAgent"
                        placeholder={DEFAULT_GRAZIE_AGENT}
                        value={formData.grazieAgent || ''}
                        onChange={e => setFormData({...formData, grazieAgent: e.target.value})}
                        className="font-mono text-xs"
                      />
                      <p className="text-xs text-muted-foreground">对比你的抓包，如 IDE 版本或名称不同请修改</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="jwtRefreshUrl">JWT 刷新端点 URL (留空用默认值)</Label>
                      <Input
                        id="jwtRefreshUrl"
                        placeholder={DEFAULT_JWT_URL}
                        value={formData.jwtRefreshUrl || ''}
                        onChange={e => setFormData({...formData, jwtRefreshUrl: e.target.value})}
                        className="font-mono text-xs"
                      />
                      <p className="text-xs text-muted-foreground">如果你抓包发现 IDE 调用了不同的端点，填在这里</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="extraHeaders">额外请求头 (JSON 对象，如 &ldquo;{'{}'}&rdquo;)</Label>
                      <Textarea
                        id="extraHeaders"
                        placeholder={'{\n  "X-Machine-Id": "your-machine-id"\n}'}
                        value={formData.extraHeadersRaw || ''}
                        onChange={e => setFormData({...formData, extraHeadersRaw: e.target.value})}
                        className="font-mono text-xs h-20"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="extraBody">额外请求体字段 (JSON 对象)</Label>
                      <Textarea
                        id="extraBody"
                        placeholder={'{\n  "machineId": "your-machine-id"\n}'}
                        value={formData.extraBodyRaw || ''}
                        onChange={e => setFormData({...formData, extraBodyRaw: e.target.value})}
                        className="font-mono text-xs h-20"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pt-1 border-t border-border">
                <Switch
                  id="enabled"
                  checked={formData.enabled !== false}
                  onCheckedChange={v => setFormData({...formData, enabled: v})}
                />
                <Label htmlFor="enabled" className="cursor-pointer">{t("acc_enabled_label")}</Label>
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">{t("acc_cancel")}</Button>
                </DialogClose>
                <Button type="submit" disabled={putAccounts.isPending} data-testid="btn-save-account">
                  {putAccounts.isPending ? t("acc_saving") : t("acc_save")}
                </Button>
              </DialogFooter>
              </form>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : accounts?.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center h-48 text-center">
            <p className="text-muted-foreground">No accounts configured.</p>
            <p className="text-sm text-muted-foreground mt-1">Add an account to start proxying requests.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
          {(accounts as ExtendedAccount[])?.map((acc, i) => {
            const enabled = isEnabled(acc);
            const licenseMode = isLicenseMode(acc);
            const testResult = testResults[i];
            return (
              <Card
                key={i}
                className={`flex flex-col border-border bg-card shadow-sm transition-all ${!enabled ? 'opacity-50' : 'hover-elevate'}`}
                data-testid={`card-account-${i}`}
              >
                <CardHeader className="flex flex-row items-start justify-between pb-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                      Account {i + 1}
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-mono font-normal ${getMode(acc) === "OAuth" ? "bg-primary/15 text-primary border-primary/30" : "bg-secondary text-secondary-foreground border-secondary-border"}`}>
                        {getMode(acc)}
                      </span>
                      {!enabled && (
                        <span className="text-xs px-2 py-0.5 bg-destructive/10 text-destructive rounded-full border border-destructive/20 font-normal">
                          {t("common_disabled")}
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1 flex items-center gap-4">
                      {acc.has_quota !== undefined && (
                        <span className="flex items-center gap-1">
                          {acc.has_quota ? (
                            <><CheckCircle2 className="h-3 w-3 text-primary" /> {t("acc_quota")}</>
                          ) : (
                            <><XCircle className="h-3 w-3 text-destructive" /> {t("acc_no_quota")}</>
                          )}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1.5 ml-2 shrink-0">
                    {licenseMode && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleTestJwt(i)}
                        disabled={testingIndex === i}
                        title="Test JWT refresh with these credentials"
                        className="text-muted-foreground"
                        data-testid={`btn-test-jwt-${i}`}
                      >
                        {testingIndex === i
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <FlaskConical className="h-4 w-4" />}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleToggleEnabled(i)}
                      title={enabled ? t("acc_disable") : t("acc_enable")}
                      className={enabled ? "text-primary border-primary/30 hover:bg-primary/10" : "text-muted-foreground"}
                      data-testid={`btn-toggle-${i}`}
                    >
                      <Power className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => openEdit(i)} data-testid={`btn-edit-${i}`}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="destructive" size="icon" onClick={() => handleDelete(i)} data-testid={`btn-delete-${i}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-2 text-sm grid gap-2">
                  {acc.jwt && (
                    <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                      <span className="text-muted-foreground font-mono">JWT:</span>
                      <span className="font-mono truncate text-xs">{acc.jwt.substring(0, 24)}...</span>
                    </div>
                  )}
                  {acc.licenseId && (
                    <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                      <span className="text-muted-foreground font-mono">License ID:</span>
                      <span className="font-mono">{acc.licenseId}</span>
                    </div>
                  )}
                  {(acc as Record<string, unknown>).email && (
                    <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                      <span className="text-muted-foreground font-mono text-xs">Email:</span>
                      <span className="text-xs text-primary font-medium">{String((acc as Record<string, unknown>).email)}</span>
                    </div>
                  )}
                  {acc.authorization && getMode(acc) !== "OAuth" && (
                    <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                      <span className="text-muted-foreground font-mono">Auth Token:</span>
                      <span className="font-mono text-xs truncate">
                        {acc.authorization.length > 16 ? acc.authorization.substring(0, 16) + "..." : acc.authorization}
                      </span>
                    </div>
                  )}
                  {getMode(acc) === "OAuth" && (
                    <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                      <span className="text-muted-foreground font-mono text-xs">Token:</span>
                      <span className="text-xs text-primary/70">{t("common_refresh")} · refresh_token ✓</span>
                    </div>
                  )}
                  {acc.grazieAgent && (
                    <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                      <span className="text-muted-foreground font-mono text-xs">grazie-agent:</span>
                      <span className="font-mono text-xs truncate text-muted-foreground">{acc.grazieAgent}</span>
                    </div>
                  )}
                  {acc.jwtRefreshUrl && acc.jwtRefreshUrl !== DEFAULT_JWT_URL && (
                    <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                      <span className="text-muted-foreground font-mono text-xs">JWT URL:</span>
                      <span className="font-mono text-xs truncate text-muted-foreground">{acc.jwtRefreshUrl}</span>
                    </div>
                  )}

                  {testResult && (() => {
                    const [summary, ...rest] = testResult.detail.split('\n\nResponse:\n');
                    const afterResponse = rest.join('\n\nResponse:\n');
                    const [responseSection, ...debugRest] = afterResponse.split('\n\nSent Request (compare with your packet capture):\n');
                    const debugSection = debugRest.join('\n\nSent Request (compare with your packet capture):\n');
                    return (
                      <div className={`mt-2 rounded-md border text-xs overflow-hidden ${testResult.ok ? 'border-primary/30 bg-primary/5 text-primary' : 'border-destructive/30 bg-destructive/5 text-destructive'}`}>
                        <div className="flex items-start gap-2 px-3 py-2">
                          {testResult.ok
                            ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            : <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                          <span className="break-words">{summary}</span>
                        </div>
                        {responseSection && (
                          <details className="border-t border-current/20">
                            <summary className="px-3 py-1.5 cursor-pointer opacity-70 hover:opacity-100 flex items-center gap-1">
                              API 响应 Response
                            </summary>
                            <pre className="px-3 pb-2 overflow-x-auto whitespace-pre-wrap break-all opacity-80 font-mono leading-relaxed">
                              {responseSection}
                            </pre>
                          </details>
                        )}
                        {debugSection && (
                          <details className="border-t border-current/20">
                            <summary className="px-3 py-1.5 cursor-pointer opacity-70 hover:opacity-100 flex items-center gap-1">
                              📋 实际发出的请求 (对照你的抓包)
                            </summary>
                            <pre className="px-3 pb-2 overflow-x-auto whitespace-pre-wrap break-all opacity-80 font-mono leading-relaxed">
                              {debugSection}
                            </pre>
                          </details>
                        )}
                      </div>
                    );
                  })()}

                  {(() => {
                    const key = accountKey(acc);
                    const s = statsData?.[key];
                    return (
                      <div className="mt-3 border-t border-border pt-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
                          <BarChart2 className="h-3 w-3" />
                          {t("acc_usage")}
                        </div>
                        {s ? (
                          <div className="grid grid-cols-3 gap-2">
                            <div className="rounded-md bg-muted/40 px-2 py-1.5 text-center">
                              <p className="text-lg font-semibold tabular-nums">{fmtNum(s.call_count)}</p>
                              <p className="text-xs text-muted-foreground">{t("acc_calls")}</p>
                            </div>
                            <div className="rounded-md bg-muted/40 px-2 py-1.5 text-center">
                              <p className="text-lg font-semibold tabular-nums">{estTokens(s.input_chars)}</p>
                              <p className="text-xs text-muted-foreground">{t("acc_input")}</p>
                            </div>
                            <div className="rounded-md bg-muted/40 px-2 py-1.5 text-center">
                              <p className="text-lg font-semibold tabular-nums">{estTokens(s.output_chars)}</p>
                              <p className="text-xs text-muted-foreground">{t("acc_output")}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">{t("acc_no_record")}</p>
                        )}
                        <div className="grid grid-cols-[120px_1fr] items-center gap-2 text-xs text-muted-foreground pt-1">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {t("acc_last_used")}:</span>
                          <span>{s ? formatDate(s.last_call_at) : formatDate(acc.last_updated)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
