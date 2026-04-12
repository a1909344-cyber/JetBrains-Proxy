import { Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();

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

export default router;
