import { Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();

const DATA_DIR = process.env["DATA_DIR"] || path.join(process.cwd(), "..", "..", "python", "proxy");
const LOG_FILE = process.env["LOG_FILE"] || path.join(process.cwd(), "..", "..", "python", "proxy.log");
const PROXY_INTERNAL_URL = process.env["PROXY_INTERNAL_URL"] || "http://localhost:8000";

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

router.put("/admin/config/jetbrainsai", (req, res) => {
  if (!Array.isArray(req.body)) {
    res.status(400).json({ error: "Expected a JSON array of accounts" });
    return;
  }
  writeJson("jetbrainsai.json", req.body);
  res.json({ success: true });
});

router.get("/admin/config/client-keys", (req, res) => {
  const data = readJson("client_api_keys.json");
  res.json(data ?? []);
});

router.put("/admin/config/client-keys", (req, res) => {
  if (!Array.isArray(req.body)) {
    res.status(400).json({ error: "Expected a JSON array of keys" });
    return;
  }
  writeJson("client_api_keys.json", req.body);
  res.json({ success: true });
});

router.get("/admin/config/models", (req, res) => {
  const data = readJson("models.json");
  res.json(data ?? { models: [], anthropic_model_mappings: {} });
});

router.put("/admin/config/models", (req, res) => {
  const body = req.body as Record<string, unknown>;
  if (typeof body !== "object" || !Array.isArray(body?.models)) {
    res.status(400).json({ error: "Expected an object with 'models' array field" });
    return;
  }
  writeJson("models.json", body);
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

export default router;
