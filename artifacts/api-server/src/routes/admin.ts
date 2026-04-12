import { Router } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const router = Router();

// ── OAuth PKCE state ─────────────────────────────────────────────────────────
const pendingOAuthFlows = new Map<string, { codeVerifier: string; redirectUri: string; createdAt: number }>();

const JB_AUTH_URL = "https://account.jetbrains.com/oauth/login";
const JB_TOKEN_URL = "https://oauth.account.jetbrains.com/oauth2/token";
const JB_API_BASE = "https://api.jetbrains.ai";
const OAUTH_CLIENT_ID = "ide";
const OAUTH_REDIRECT_URI = "http://localhost:3000";

function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
}

async function refreshIdToken(refreshToken: string): Promise<{ id_token: string; refresh_token?: string }> {
  const res = await fetch(JB_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: OAUTH_CLIENT_ID,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`JetBrains token refresh failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<{ id_token: string; refresh_token?: string }>;
}

// Background token refresh loop — refresh id_token for OAuth accounts every 10 min
let _refreshLoopStarted = false;
function ensureRefreshLoop() {
  if (_refreshLoopStarted) return;
  _refreshLoopStarted = true;
  setInterval(async () => {
    try {
      const accounts = readJson("jetbrainsai.json") as unknown[];
      if (!Array.isArray(accounts)) return;
      let changed = false;
      const now = Date.now();
      for (const a of accounts) {
        const acc = a as Record<string, unknown>;
        if (!acc.refresh_token || typeof acc.refresh_token !== "string") continue;
        const expiresAt = typeof acc.id_token_expires_at === "number" ? acc.id_token_expires_at : 0;
        if (expiresAt - now > 5 * 60 * 1000) continue; // still valid for >5 min
        try {
          const tokens = await refreshIdToken(acc.refresh_token);
          acc.authorization = tokens.id_token;
          if (tokens.refresh_token) acc.refresh_token = tokens.refresh_token;
          const payload = decodeJwtPayload(tokens.id_token);
          acc.id_token_expires_at = ((payload.exp as number) || 0) * 1000;
          changed = true;
          console.log(`[oauth] refreshed id_token for account: ${acc.email ?? acc.licenseId}`);
        } catch (e) {
          console.error(`[oauth] refresh failed for ${acc.email ?? acc.licenseId}:`, e);
        }
      }
      if (changed) {
        writeJson("jetbrainsai.json", accounts);
        await reloadProxyConfig();
      }
    } catch (e) {
      console.error("[oauth] refresh loop error:", e);
    }
  }, 10 * 60 * 1000); // check every 10 minutes
}

const DATA_DIR = process.env["DATA_DIR"] || path.join(process.cwd(), "..", "..", "python", "proxy");
const LOG_FILE = process.env["LOG_FILE"] || path.join(process.cwd(), "..", "..", "python", "proxy.log");
const PROXY_INTERNAL_URL = process.env["PROXY_INTERNAL_URL"] || "http://localhost:8000";

async function reloadProxyConfig(): Promise<void> {
  try {
    await fetch(`${PROXY_INTERNAL_URL}/admin/reload-config`, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Non-fatal — proxy may be restarting; config is already written to disk
  }
}

function readJson(filename: string): unknown {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) return null;
  return JSON.parse(fs.readFileSync(filepath, "utf-8"));
}

function writeJson(filename: string, data: unknown): void {
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
}

router.get("/admin/status", async (req, res) => {
  let online = false;
  let proxyStatusCode: number | null = null;
  let errorMsg: string | null = null;

  const modelsData = readJson("models.json") as Record<string, unknown> | null;
  const modelList = Array.isArray(modelsData?.models) ? (modelsData!.models as unknown[]) : [];

  const accountsData = readJson("jetbrainsai.json");
  const accountCount = Array.isArray(accountsData) ? accountsData.length : 0;

  const keysData = readJson("client_api_keys.json");
  const keyCount = Array.isArray(keysData) ? keysData.length : 0;

  try {
    const response = await fetch(`${PROXY_INTERNAL_URL}/v1/models`, {
      signal: AbortSignal.timeout(5000),
    });
    proxyStatusCode = response.status;
    online = true;
  } catch (e: unknown) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  res.json({
    online,
    proxyStatusCode,
    proxyUrl: PROXY_INTERNAL_URL,
    error: errorMsg,
    modelCount: modelList.length,
    accountCount,
    keyCount,
    dataDir: DATA_DIR,
  });
});

router.get("/admin/config/jetbrainsai", (req, res) => {
  const data = readJson("jetbrainsai.json");
  res.json(data ?? []);
});

router.put("/admin/config/jetbrainsai", async (req, res) => {
  if (!Array.isArray(req.body)) {
    res.status(400).json({ error: "Expected a JSON array of accounts" });
    return;
  }
  writeJson("jetbrainsai.json", req.body);
  await reloadProxyConfig();
  res.json({ success: true });
});

router.get("/admin/config/client-keys", (req, res) => {
  const data = readJson("client_api_keys.json");
  res.json(data ?? []);
});

router.put("/admin/config/client-keys", async (req, res) => {
  if (!Array.isArray(req.body)) {
    res.status(400).json({ error: "Expected a JSON array of keys" });
    return;
  }
  writeJson("client_api_keys.json", req.body);
  await reloadProxyConfig();
  res.json({ success: true });
});

router.get("/admin/stats", (req, res) => {
  const data = readJson("usage_stats.json");
  res.json(data ?? {});
});

router.post("/admin/stats/reset", (req, res) => {
  writeJson("usage_stats.json", {});
  res.json({ success: true });
});

router.get("/admin/config/models", (req, res) => {
  const data = readJson("models.json");
  res.json(data ?? { models: [], anthropic_model_mappings: {} });
});

router.put("/admin/config/models", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  if (typeof body !== "object" || !Array.isArray(body?.models)) {
    res.status(400).json({ error: "Expected an object with 'models' array field" });
    return;
  }
  writeJson("models.json", body);
  await reloadProxyConfig();
  res.json({ success: true });
});

router.get("/admin/logs", (req, res) => {
  const limit = Number(req.query["lines"] ?? 200);
  if (!fs.existsSync(LOG_FILE)) {
    res.json({ lines: [], total: 0, file: LOG_FILE, note: "Log file not found" });
    return;
  }
  try {
    const content = fs.readFileSync(LOG_FILE, "utf-8");
    const allLines = content.split("\n");
    const sliced = allLines.slice(-limit);
    res.json({ lines: sliced, total: allLines.length, file: LOG_FILE });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.post("/admin/proxy/test-models", async (req, res) => {
  const { apiKey, baseUrl } = req.body as { apiKey?: string; baseUrl?: string };
  const url = baseUrl || PROXY_INTERNAL_URL;
  try {
    const response = await fetch(`${url}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey ?? ""}` },
      signal: AbortSignal.timeout(10000),
    });
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = await response.text();
    }
    res.json({ status: response.status, data, ok: response.ok });
  } catch (e: unknown) {
    res.json({ status: 0, error: e instanceof Error ? e.message : String(e), ok: false });
  }
});

router.post("/admin/proxy/test-chat", async (req, res) => {
  const { apiKey, model, messages, stream = false, baseUrl } = req.body as {
    apiKey?: string;
    model?: string;
    messages?: unknown[];
    stream?: boolean;
    baseUrl?: string;
  };
  const url = baseUrl || PROXY_INTERNAL_URL;
  try {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages, stream }),
      signal: AbortSignal.timeout(60000),
    });
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = await response.text();
    }
    res.json({ status: response.status, data, ok: response.ok });
  } catch (e: unknown) {
    res.json({ status: 0, error: e instanceof Error ? e.message : String(e), ok: false });
  }
});

router.post("/admin/proxy/fetch-upstream-models", async (req, res) => {
  // Get JWT from first available account
  const accounts = readJson("jetbrainsai.json") as unknown[] | null;
  const accountList = Array.isArray(accounts) ? accounts : [];
  const activeAccount = accountList.find((a: any) => a.enabled !== false && a.jwt);
  if (!activeAccount) {
    res.status(400).json({ error: "No active account with a JWT found. Ensure an enabled account has a valid JWT (refresh one first on the Accounts page)." });
    return;
  }
  const jwt = (activeAccount as any).jwt as string;
  const grazieAgent = (activeAccount as any).grazieAgent || '{"name":"aia:pycharm","version":"251.26094.80.13:251.26094.141"}';

  const endpoints = [
    "https://api.jetbrains.ai/user/v5/llm/profiles",
    "https://api.jetbrains.ai/user/v5/llm/chat/v4/profiles",
    "https://api.jetbrains.ai/api/v5/user/llm/profiles",
  ];

  const headers = {
    "User-Agent": "ktor-client",
    "Accept": "application/json",
    "Accept-Charset": "UTF-8",
    "grazie-agent": grazieAgent,
    "grazie-authenticate-jwt": jwt,
  };

  for (const url of endpoints) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      if (!response.ok) continue;
      const data = await response.json() as unknown;
      // Parse whichever profile format we get back
      let profiles: string[] = [];
      if (Array.isArray(data)) {
        profiles = (data as any[]).map((p: any) => p.id ?? p.name ?? p.profile ?? String(p)).filter(Boolean);
      } else if (typeof data === "object" && data !== null) {
        const d = data as Record<string, unknown>;
        if (Array.isArray(d.profiles)) {
          profiles = (d.profiles as any[]).map((p: any) => p.id ?? p.name ?? String(p)).filter(Boolean);
        } else if (Array.isArray(d.data)) {
          profiles = (d.data as any[]).map((p: any) => p.id ?? p.name ?? String(p)).filter(Boolean);
        }
      }
      res.json({ profiles, raw: data, url });
      return;
    } catch {
      // try next endpoint
    }
  }
  res.status(502).json({ error: "Could not reach JetBrains model list endpoint. The JWT may be expired — try refreshing it on the Accounts page." });
});

router.post("/admin/test-jwt-refresh", async (req, res) => {
  const {
    licenseId,
    authorization,
    extraHeaders = {},
    extraBody = {},
    grazieAgent = '{"name":"aia:pycharm","version":"251.26094.80.13:251.26094.141"}',
    includeGrazieAgent = true,
    url = "https://api.jetbrains.ai/auth/jetbrains-jwt/provide-access/license/v2",
  } = req.body as {
    licenseId?: string;
    authorization?: string;
    extraHeaders?: Record<string, string>;
    extraBody?: Record<string, unknown>;
    grazieAgent?: string;
    includeGrazieAgent?: boolean;
    url?: string;
  };

  if (!licenseId || !authorization) {
    res.status(400).json({ error: "licenseId and authorization are required" });
    return;
  }
  let rawAuth = authorization.trim();
  if (rawAuth.toLowerCase().startsWith("bearer ")) rawAuth = rawAuth.slice(7);

  const requestHeaders: Record<string, string> = {
    "User-Agent": "ktor-client",
    "Content-Type": "application/json",
    "Accept-Charset": "UTF-8",
    authorization: `Bearer ${rawAuth}`,
    ...(includeGrazieAgent ? { "grazie-agent": grazieAgent } : {}),
    ...extraHeaders,
  };
  const requestBody = { licenseId, ...extraBody };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(15000),
    });
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = await response.text();
    }
    // Echo back the request details so user can compare with their packet capture
    const sentHeaders = { ...requestHeaders };
    // redact the auth value
    if (sentHeaders.authorization) {
      const tok = sentHeaders.authorization.replace("Bearer ", "");
      sentHeaders.authorization = `Bearer ${tok.slice(0, 8)}...(redacted)`;
    }
    // JetBrains deprecated the `state` field (grazie-deprecated-info header confirms this).
    // A token is returned for all valid accounts regardless of state value.
    const hasToken = typeof data === "object" && data !== null && "token" in (data as object);
    res.json({
      status: response.status,
      data,
      ok: response.ok && hasToken,
      debug: {
        url,
        sentHeaders,
        sentBody: requestBody,
        note: "JetBrains deprecated the `state` field. Token presence is the real success indicator.",
      },
    });
  } catch (e: unknown) {
    res.json({ status: 0, error: e instanceof Error ? e.message : String(e), ok: false });
  }
});

// ── Password-based auto-login (email+password → id_token → trial → JWT) ──────

const JB_BASE = "https://account.jetbrains.com";
const JB_INTERNAL_REDIRECT_URI = `${JB_BASE}/oauth2/ide/callback`;
const OAUTH_CLIENT_INFO = "eyJwcm9kdWN0IjoiUFkiLCJidWlsZCI6IjI2MS4yMjE1OC4zNDAifQ";

const TRIAL_ENCRYPTED_HOSTNAME = "837dXi0iwT8bX6hyYx/jj8C3zRdOhXGfldH6IDWxUGxhR+uNhgtqr0mXpXf/nJd5ieCAGcQXo2XtV2lzBdTEDA==";
const TRIAL_ENCRYPTED_USERNAME = "2iPzpOCWsIFuwgcAUOrGzZJDJA2tC1zeZXPkHWhSk5rFRoqp2BtfvhVv6yMaBp9a/opRRmMKvHgHseDc2usEmg==";
const TRIAL_MACHINE_ID = "17ff7a9c-ee0d-409f-a556-a85e43c4097a";
const TRIAL_MACHINE_UUID = "1-15f741da-48f2-3a49-a2a0-0d45352d1eb6";

class CookieJar {
  private cookies = new Map<string, string>();

  updateFromResponse(headers: Headers): void {
    const setCookies: string[] = (headers as Headers & { getSetCookie?(): string[] }).getSetCookie?.() ?? [];
    for (const cookie of setCookies) {
      const [kv] = cookie.split(";");
      const eqIdx = (kv ?? "").indexOf("=");
      if (eqIdx === -1) continue;
      const name = kv!.slice(0, eqIdx).trim();
      const value = kv!.slice(eqIdx + 1).trim();
      if (name) this.cookies.set(name, value);
    }
  }

  toHeader(): string {
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }

  get(name: string): string | undefined { return this.cookies.get(name); }
  entries(): IterableIterator<[string, string]> { return this.cookies.entries(); }
}

async function jbPasswordLogin(email: string, password: string): Promise<{
  id_token: string; refresh_token: string; cookies: Record<string, string>; email: string;
}> {
  const jar = new CookieJar();
  const T = 30000;

  // Step 1: GET /login → get XSRF cookie
  const loginPage = await fetch(`${JB_BASE}/login`, {
    headers: { "Accept": "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(T),
  });
  jar.updateFromResponse(loginPage.headers);
  const xsrf = jar.get("_st") ?? jar.get("XSRF-TOKEN") ?? "";

  function jsonHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "Cookie": jar.toHeader(),
      ...(xsrf ? { "X-XSRF-TOKEN": xsrf } : {}),
      ...extra,
    };
  }

  // Step 2: POST /api/auth/sessions → create session
  const sessionRes = await fetch(`${JB_BASE}/api/auth/sessions`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(T),
  });
  jar.updateFromResponse(sessionRes.headers);
  if (!sessionRes.ok) throw new Error(`Session creation failed: ${sessionRes.status}`);
  const sessionData = await sessionRes.json() as { id: string };
  const sid = sessionData.id;

  // Step 3: Submit email
  const emailRes = await fetch(`${JB_BASE}/api/auth/sessions/${sid}/email/login`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email }),
    signal: AbortSignal.timeout(T),
  });
  jar.updateFromResponse(emailRes.headers);
  const emailData = await emailRes.json() as { state: string };
  if (emailData.state !== "PASSWORD_REQUIRED") {
    throw new Error(`Unexpected state after email submit: ${emailData.state}`);
  }

  // Step 4: Submit password
  const pwRes = await fetch(`${JB_BASE}/api/auth/sessions/${sid}/password`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ password }),
    signal: AbortSignal.timeout(T),
  });
  jar.updateFromResponse(pwRes.headers);
  const pwData = await pwRes.json() as { state: string };
  if (pwData.state !== "REDIRECT_TO_RETURN_URL") {
    throw new Error(`Login failed (state=${pwData.state}) — wrong password or 2FA required`);
  }

  // Step 5: PKCE + follow redirect chain to get OAuth code
  const { codeVerifier, codeChallenge } = generatePKCE();
  const pkceState = crypto.randomBytes(16).toString("hex");

  const authParams = new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    scope: "openid offline_access r_ide_auth",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state: pkceState,
    redirect_uri: JB_INTERNAL_REDIRECT_URI,
    response_type: "code",
    client_info: OAUTH_CLIENT_INFO,
  });

  let redirectUrl = `${JB_BASE}/oauth/login?${authParams}`;
  let finalCode: string | null = null;

  for (let i = 0; i < 15; i++) {
    const r = await fetch(redirectUrl, {
      headers: { "Cookie": jar.toHeader() },
      redirect: "manual",
      signal: AbortSignal.timeout(T),
    });
    jar.updateFromResponse(r.headers);
    const location = r.headers.get("location") ?? "";
    if ((location.includes("oauth2/ide/callback") || location.includes("oauth2/ide/callback")) && location.includes("code=")) {
      const parsed = new URL(location.startsWith("http") ? location : `${JB_BASE}${location}`);
      finalCode = parsed.searchParams.get("code");
      break;
    }
    if (!location) break;
    redirectUrl = location.startsWith("http") ? location : `${JB_BASE}${location}`;
  }

  if (!finalCode) throw new Error("Failed to obtain OAuth authorization code (redirect chain exhausted)");

  // Step 6: Exchange code for tokens
  const tokenRes = await fetch(JB_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: finalCode,
      code_verifier: codeVerifier,
      client_id: OAUTH_CLIENT_ID,
      redirect_uri: JB_INTERNAL_REDIRECT_URI,
    }),
    signal: AbortSignal.timeout(T),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Token exchange failed (${tokenRes.status}): ${text.slice(0, 300)}`);
  }
  const tokens = await tokenRes.json() as { id_token: string; refresh_token: string };
  if (!tokens.refresh_token) throw new Error("No refresh_token in token response");

  let resolvedEmail = email;
  try { resolvedEmail = (decodeJwtPayload(tokens.id_token).email as string) ?? email; } catch {}

  return {
    id_token: tokens.id_token,
    refresh_token: tokens.refresh_token,
    cookies: Object.fromEntries(jar.entries()),
    email: resolvedEmail,
  };
}

async function checkAiStatus(cookies: Record<string, string>): Promise<{ alreadyActive: boolean }> {
  try {
    const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
    const r = await fetch(`${JB_BASE}/api/ai/account/settings`, {
      headers: { "Accept": "application/json", "Cookie": cookieHeader },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return { alreadyActive: false };
    const data = await r.json() as { personal?: { showAIPlans?: boolean } };
    return { alreadyActive: !(data.personal?.showAIPlans ?? true) };
  } catch { return { alreadyActive: false }; }
}

async function obtainTrial(userId: string): Promise<{ code: string; reason: string }> {
  const params = new URLSearchParams({
    productFamilyId: "AIP",
    userId,
    hostName: TRIAL_ENCRYPTED_HOSTNAME,
    salt: Date.now().toString(),
    ideProductCode: "II",
    buildDate: "20250416",
    clientVersion: "21",
    secure: "false",
    userName: TRIAL_ENCRYPTED_USERNAME,
    buildNumber: "2025.1.1 Build IU-251.25410.109",
    version: "2025100",
    machineId: TRIAL_MACHINE_ID,
    productCode: "AIP",
    expiredLicenseDays: "0",
    machineUUID: TRIAL_MACHINE_UUID,
    checkedOption: "AGREEMENT",
  });
  const r = await fetch(`${JB_BASE}/lservice/rpc/obtainTrial.action?${params}`, {
    headers: { "User-Agent": "local" },
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  const codeMatch = text.match(/<responseCode>(\w+)<\/responseCode>/);
  const reasonMatch = text.match(/<rejectedReason>(.*?)<\/rejectedReason>/);
  return { code: codeMatch?.[1] ?? "UNKNOWN", reason: reasonMatch?.[1] ?? "" };
}

async function discoverLicenseId(idToken: string, cookies: Record<string, string>): Promise<string | null> {
  const candidates: string[] = [];

  // Extract real license IDs from /licenses page (most reliable)
  try {
    const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
    const r = await fetch(`${JB_BASE}/licenses`, {
      headers: { "Cookie": cookieHeader },
      signal: AbortSignal.timeout(15000),
    });
    if (r.ok) {
      const html = await r.text();
      const matches = [...html.matchAll(/id="license-([A-Z0-9]+)"/g)];
      for (const m of matches) { if (!candidates.includes(m[1]!)) candidates.push(m[1]!); }
    }
  } catch {}

  // Fallback candidates
  try {
    const claims = decodeJwtPayload(idToken);
    const jbaId = String(claims.jba_account_id ?? "");
    if (jbaId && !candidates.includes(jbaId)) candidates.push(jbaId);
  } catch {}
  for (const c of ["AI", "FREE", "TRIAL", "PERSONAL"]) {
    if (!candidates.includes(c)) candidates.push(c);
  }

  const headers = {
    "Authorization": `Bearer ${idToken}`,
    "User-Agent": "ktor-client",
    "Content-Type": "application/json",
  };
  for (const lid of candidates) {
    try {
      const r = await fetch(`${JB_API_BASE}/auth/jetbrains-jwt/provide-access/license/v2`, {
        method: "POST",
        headers,
        body: JSON.stringify({ licenseId: lid }),
        signal: AbortSignal.timeout(15000),
      });
      if (r.ok) {
        const data = await r.json() as { token?: string };
        if (data.token) return lid;
      }
    } catch {}
  }
  return null;
}

// POST /api/admin/password-login — full auto-activate: email+password → JWT → save
router.post("/admin/password-login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email?.trim() || !password?.trim()) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  // Step 1: Login
  let loginResult: { id_token: string; refresh_token: string; cookies: Record<string, string>; email: string };
  try {
    loginResult = await jbPasswordLogin(email.trim(), password.trim());
  } catch (e) {
    res.status(400).json({ error: "login_failed", message: (e as Error).message });
    return;
  }

  const { id_token, refresh_token, cookies, email: resolvedEmail } = loginResult;

  // Step 2: Decode user_id
  let userId = "";
  try {
    const claims = decodeJwtPayload(id_token);
    userId = String(claims.user_id ?? claims.sub ?? "");
  } catch {}

  // Step 3: Check AI subscription status
  const { alreadyActive } = await checkAiStatus(cookies);

  // Step 4: Activate trial if needed
  let trialActivated = false;
  if (!alreadyActive && userId) {
    const trial = await obtainTrial(userId);
    console.log(`[password-login] obtainTrial for ${resolvedEmail}: code=${trial.code} reason=${trial.reason}`);
    if (trial.reason === "PAYMENT_PROOF_REQUIRED") {
      res.status(400).json({ error: "need_card", message: "Credit card binding required before trial activation" });
      return;
    }
    trialActivated = trial.code === "OK";
  }

  // Step 5: Register with Grazie (best-effort)
  try {
    await fetch(`${JB_API_BASE}/auth/jetbrains-jwt/register`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${id_token}`, "User-Agent": "ktor-client" },
      signal: AbortSignal.timeout(10000),
    });
  } catch {}

  // Step 6: Discover license ID
  const licenseId = await discoverLicenseId(id_token, cookies);
  if (!licenseId) {
    res.status(400).json({ error: "no_license", message: "Activation done but no valid license found — please retry in a few seconds" });
    return;
  }

  // Step 7: Save to jetbrainsai.json
  let idTokenExpiresAt = 0;
  try { idTokenExpiresAt = ((decodeJwtPayload(id_token).exp as number) || 0) * 1000; } catch {}

  const accounts = (readJson("jetbrainsai.json") as unknown[] | null) ?? [];
  const existingIdx = accounts.findIndex((a) => (a as Record<string, unknown>).email === resolvedEmail);
  const newAccount: Record<string, unknown> = {
    licenseId, authorization: id_token, refresh_token, email: resolvedEmail, id_token_expires_at: idTokenExpiresAt, enabled: true,
  };
  if (existingIdx >= 0) {
    accounts[existingIdx] = { ...(accounts[existingIdx] as Record<string, unknown>), ...newAccount };
  } else {
    accounts.push(newAccount);
  }
  writeJson("jetbrainsai.json", accounts);
  await reloadProxyConfig();
  ensureRefreshLoop();

  console.log(`[password-login] success: email=${resolvedEmail} licenseId=${licenseId} trialActivated=${trialActivated}`);
  res.json({ ok: true, email: resolvedEmail, licenseId, trialActivated, updated: existingIdx >= 0 });
});

// ── OAuth routes ─────────────────────────────────────────────────────────────

// GET /api/admin/oauth/start — generate PKCE codes and return JetBrains OAuth URL
router.get("/admin/oauth/start", (_req, res) => {
  // Clean up expired flows
  const now = Date.now();
  for (const [key, val] of pendingOAuthFlows) {
    if (now - val.createdAt > 10 * 60 * 1000) pendingOAuthFlows.delete(key);
  }

  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = crypto.randomBytes(16).toString("hex");
  pendingOAuthFlows.set(state, { codeVerifier, redirectUri: OAUTH_REDIRECT_URI, createdAt: now });

  const params = new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    scope: "openid offline_access r_ide_auth",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    redirect_uri: OAUTH_REDIRECT_URI,
    state,
    response_type: "code",
  });

  res.json({ url: `${JB_AUTH_URL}?${params}`, state, redirectUri: OAUTH_REDIRECT_URI });
  ensureRefreshLoop();
});

// POST /api/admin/oauth/callback — exchange code from pasted callback URL
router.post("/admin/oauth/callback", async (req, res) => {
  const { callback_url, license_id } = req.body as { callback_url?: string; license_id?: string };
  if (!callback_url) { res.status(400).json({ error: "callback_url is required" }); return; }
  if (!license_id) { res.status(400).json({ error: "license_id is required" }); return; }

  let code: string | null, state: string | null;
  try {
    const url = new URL(callback_url);
    code = url.searchParams.get("code");
    state = url.searchParams.get("state");
  } catch {
    res.status(400).json({ error: "Invalid callback_url — must be a full URL" });
    return;
  }

  if (!code || !state) { res.status(400).json({ error: "callback_url is missing code or state parameters" }); return; }

  const flow = pendingOAuthFlows.get(state);
  if (!flow) { res.status(400).json({ error: "OAuth state not found or expired — please start a new OAuth flow" }); return; }
  pendingOAuthFlows.delete(state);

  // Exchange code for tokens
  let tokens: { id_token: string; refresh_token: string };
  try {
    const tokenRes = await fetch(JB_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: flow.codeVerifier,
        client_id: OAUTH_CLIENT_ID,
        redirect_uri: flow.redirectUri,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      res.status(502).json({ error: `JetBrains token exchange failed (${tokenRes.status}): ${text}` });
      return;
    }
    tokens = await tokenRes.json() as { id_token: string; refresh_token: string };
  } catch (e) {
    res.status(502).json({ error: `Network error during token exchange: ${(e as Error).message}` });
    return;
  }

  // Decode email + expiry from id_token
  let email = "unknown";
  let idTokenExpiresAt = 0;
  try {
    const payload = decodeJwtPayload(tokens.id_token);
    email = (payload.email ?? payload.preferred_username ?? "unknown") as string;
    idTokenExpiresAt = ((payload.exp as number) || 0) * 1000;
  } catch {}

  // Register with JetBrains AI if needed (best-effort)
  try {
    await fetch(`${JB_API_BASE}/auth/jetbrains-jwt/user-info`, {
      headers: { "Authorization": `Bearer ${tokens.id_token}`, "User-Agent": "ktor-client" },
      signal: AbortSignal.timeout(8000),
    });
  } catch {}

  // Save/update account in jetbrainsai.json
  const accounts = (readJson("jetbrainsai.json") as unknown[] | null) ?? [];
  const existingIdx = accounts.findIndex((a) => (a as Record<string, unknown>).email === email);
  const newAccount: Record<string, unknown> = {
    licenseId: license_id,
    authorization: tokens.id_token,
    refresh_token: tokens.refresh_token,
    email,
    id_token_expires_at: idTokenExpiresAt,
    enabled: true,
  };

  if (existingIdx >= 0) {
    accounts[existingIdx] = { ...(accounts[existingIdx] as Record<string, unknown>), ...newAccount };
  } else {
    accounts.push(newAccount);
  }

  writeJson("jetbrainsai.json", accounts);
  await reloadProxyConfig();
  ensureRefreshLoop();

  res.json({ ok: true, email, licenseId: license_id, updated: existingIdx >= 0 });
});

// POST /api/admin/oauth/refresh-manual — manually force refresh of OAuth id_token for an account
router.post("/admin/oauth/refresh-manual", async (req, res) => {
  const { email, licenseId } = req.body as { email?: string; licenseId?: string };
  const accounts = (readJson("jetbrainsai.json") as unknown[] | null) ?? [];
  const acc = accounts.find((a) => {
    const r = a as Record<string, unknown>;
    return (email && r.email === email) || (licenseId && r.licenseId === licenseId);
  }) as Record<string, unknown> | undefined;

  if (!acc) { res.status(404).json({ error: "Account not found" }); return; }
  if (!acc.refresh_token || typeof acc.refresh_token !== "string") {
    res.status(400).json({ error: "Account does not have a refresh_token (not an OAuth account)" }); return;
  }

  try {
    const tokens = await refreshIdToken(acc.refresh_token);
    acc.authorization = tokens.id_token;
    if (tokens.refresh_token) acc.refresh_token = tokens.refresh_token;
    const payload = decodeJwtPayload(tokens.id_token);
    acc.id_token_expires_at = ((payload.exp as number) || 0) * 1000;
    writeJson("jetbrainsai.json", accounts);
    await reloadProxyConfig();
    res.json({ ok: true, id_token_expires_at: acc.id_token_expires_at });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

// Start OAuth refresh loop at module load time
ensureRefreshLoop();

export default router;
