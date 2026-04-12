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
import { Trash2, Edit, Plus, CheckCircle2, XCircle, Clock, Power, FlaskConical, Loader2, ChevronDown, ChevronUp, BarChart2, RotateCcw, Zap, BookOpen, Copy, Check } from "lucide-react";
import { JetbrainsAccount } from "@workspace/api-client-react/src/generated/api.schemas";
import { Skeleton } from "@/components/ui/skeleton";

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
  const res = await fetch(`${BASE}/api/admin/test-jwt-refresh`, {
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

  const { data: accounts, isLoading } = useGetJetbrainsAccounts();
  const putAccounts = usePutJetbrainsAccounts();

  const { data: statsData, refetch: refetchStats } = useQuery<Record<string, AccountStats>>({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/admin/stats`);
      return res.ok ? res.json() : {};
    },
    refetchInterval: 10000,
  });

  const [resettingStats, setResettingStats] = useState(false);
  const handleResetStats = async () => {
    setResettingStats(true);
    try {
      await fetch(`${BASE}/api/admin/stats/reset`, { method: "POST" });
      refetchStats();
      toast({ title: "统计已重置", description: "所有账户的调用统计已清零。" });
    } catch {
      toast({ title: "重置失败", variant: "destructive" });
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

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  };

  const handleQuickImport = () => {
    const text = importText.trim();
    if (!text) { setImportMsg({ ok: false, text: "请粘贴内容后再点击解析。" }); return; }

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
      setImportMsg({ ok: false, text: "未能从粘贴内容中识别出任何字段。请确保包含 licenseId（JSON体）、Authorization: Bearer xxx（请求头）或 grazie-authenticate-jwt 字段。" });
      return;
    }

    setFormData({
      ...formData,
      ...(licenseId ? { licenseId } : {}),
      ...(authorization ? { authorization } : {}),
      ...(jwt ? { jwt } : {}),
    });
    setImportText("");
    setImportMsg({ ok: true, text: `已自动填充：${found.join("、")}` });
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
        toast({ title: successMsg || "Saved", description: "Accounts updated successfully." });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Failed to save.", variant: "destructive" });
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
      newAccounts.push(accountToSave);
    }

    putAccounts.mutate({ data: newAccounts }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetJetbrainsAccountsQueryKey() });
        toast({ title: "Account Saved", description: "JetBrains account updated." });
        setIsAddOpen(false);
        setEditingIndex(null);
        resetForm();
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Failed to save.", variant: "destructive" });
      }
    });
  };

  const resetForm = () => {
    setFormData({ jwt: "", licenseId: "", authorization: "", enabled: true, grazieAgent: "", jwtRefreshUrl: "", extraHeadersRaw: "", extraBodyRaw: "" });
    setShowAdvanced(false);
  };

  const handleDelete = (index: number) => {
    if (!accounts) return;
    if (!confirm("Are you sure you want to delete this account?")) return;
    const newAccounts = (accounts as ExtendedAccount[]).filter((_, i) => i !== index);
    saveAccounts(newAccounts, "Account Deleted");
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
      const debugJson = JSON.stringify(result.debug, null, 2);
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
          <h1 className="text-3xl font-bold tracking-tight">JetBrains Accounts</h1>
          <p className="text-muted-foreground mt-2">Manage auth configurations for the proxy pool. Only enabled accounts are used.</p>
        </div>

        <div className="flex gap-2 items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetStats}
            disabled={resettingStats}
            title="重置所有账户的调用统计"
            data-testid="btn-reset-stats"
          >
            {resettingStats ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
            重置统计
          </Button>

        <Dialog open={isAddOpen} onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) { setEditingIndex(null); resetForm(); setImportText(""); setImportMsg(null); setShowGuide(false); }
        }}>
          <DialogTrigger asChild>
            <Button data-testid="btn-add-account">
              <Plus className="mr-2 h-4 w-4" />
              Add Account
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingIndex !== null ? 'Edit Account' : 'Add Account'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4 py-2">

              {/* ── Quick Import ── */}
              <div className="rounded-md border-2 border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">快速导入 / Quick Import</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  将抓包工具（Fiddler、Charles、Proxyman、Wireshark）里的原始 HTTP 请求或 cURL 命令粘贴到下方，系统会自动识别 License ID、Auth Token 和 JWT。
                </p>
                <Textarea
                  placeholder={"粘贴原始 HTTP 请求或 cURL 命令，例如：\n\ncurl -X POST 'https://api.jetbrains.ai/auth/jetbrains-jwt/...' \\\n  -H 'Authorization: Bearer eyJhbGci...' \\\n  --data '{\"licenseId\":\"WDVWPRAT3B\"}'"}
                  value={importText}
                  onChange={e => { setImportText(e.target.value); setImportMsg(null); }}
                  className="font-mono text-xs h-28 resize-none"
                />
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" onClick={handleQuickImport} className="bg-amber-500 hover:bg-amber-600 text-white border-0">
                    <Zap className="mr-1.5 h-3 w-3" /> 自动解析并填充
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
                    如何获取 License ID 和 Auth Token？
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
                          {tab === "capture" ? "🔍 抓包" : tab === "win" ? "🪟 Windows" : tab === "mac" ? "🍎 macOS" : "🐧 Linux"}
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
                  <span className="text-xs font-semibold text-primary uppercase tracking-wider">Mode A — Static JWT</span>
                  <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">推荐 / Recommended</span>
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
                    <p>抓包找任意发往 <code className="bg-muted px-1 rounded">api.jetbrains.ai</code> 的请求，复制请求头</p>
                    <p><code className="bg-muted px-1 rounded font-mono">grazie-authenticate-jwt: eyJ...</code> 的值粘贴到这里。</p>
                    <p className="text-amber-500/80">⚠ JWT 会定期过期，需手动更新。</p>
                  </div>
                </div>
              </div>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-muted-foreground/20" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">OR (高级 / Advanced)</span>
                </div>
              </div>

              {/* Mode B */}
              <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Mode B — License (自动刷新 JWT)</span>
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
                  高级选项 / Advanced — 自定义刷新请求
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
                <Label htmlFor="enabled" className="cursor-pointer">Account enabled</Label>
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={putAccounts.isPending} data-testid="btn-save-account">
                  {putAccounts.isPending ? 'Saving...' : 'Save Account'}
                </Button>
              </DialogFooter>
            </form>
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
                      <span className="text-xs px-2 py-0.5 bg-secondary text-secondary-foreground rounded-full border border-secondary-border font-mono font-normal">
                        {getMode(acc)}
                      </span>
                      {!enabled && (
                        <span className="text-xs px-2 py-0.5 bg-destructive/10 text-destructive rounded-full border border-destructive/20 font-normal">
                          Disabled
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1 flex items-center gap-4">
                      {acc.has_quota !== undefined && (
                        <span className="flex items-center gap-1">
                          {acc.has_quota ? (
                            <><CheckCircle2 className="h-3 w-3 text-primary" /> Quota Available</>
                          ) : (
                            <><XCircle className="h-3 w-3 text-destructive" /> No Quota</>
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
                      title={enabled ? "Disable account" : "Enable account"}
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
                  {acc.authorization && (
                    <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                      <span className="text-muted-foreground font-mono">Auth Token:</span>
                      <span className="font-mono text-xs truncate">
                        {acc.authorization.length > 16 ? acc.authorization.substring(0, 16) + "..." : acc.authorization}
                      </span>
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
                          使用统计
                        </div>
                        {s ? (
                          <div className="grid grid-cols-3 gap-2">
                            <div className="rounded-md bg-muted/40 px-2 py-1.5 text-center">
                              <p className="text-lg font-semibold tabular-nums">{fmtNum(s.call_count)}</p>
                              <p className="text-xs text-muted-foreground">调用次数</p>
                            </div>
                            <div className="rounded-md bg-muted/40 px-2 py-1.5 text-center">
                              <p className="text-lg font-semibold tabular-nums">{estTokens(s.input_chars)}</p>
                              <p className="text-xs text-muted-foreground">输入 Token (估)</p>
                            </div>
                            <div className="rounded-md bg-muted/40 px-2 py-1.5 text-center">
                              <p className="text-lg font-semibold tabular-nums">{estTokens(s.output_chars)}</p>
                              <p className="text-xs text-muted-foreground">输出 Token (估)</p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">暂无记录</p>
                        )}
                        <div className="grid grid-cols-[120px_1fr] items-center gap-2 text-xs text-muted-foreground pt-1">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Last Used:</span>
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
