import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const router = Router();

const DEFAULT_PASSWORD = "admin123";

function getPasswordFilePath(): string {
  const dataDir = process.env["DATA_DIR"] || "/data";
  return path.join(dataDir, ".admin_password");
}

// Priority: env var > file > default
function getAdminPassword(): string {
  const envPw = process.env["ADMIN_PASSWORD"];
  if (envPw) return envPw;

  try {
    const filePath = getPasswordFilePath();
    if (fs.existsSync(filePath)) {
      const saved = fs.readFileSync(filePath, "utf-8").trim();
      if (saved) return saved;
    }
  } catch {
    // ignore read errors
  }

  return DEFAULT_PASSWORD;
}

function computeAdminToken(): string {
  const secret = process.env["SESSION_SECRET"] ?? "dev-secret";
  const password = getAdminPassword();
  return crypto.createHmac("sha256", secret).update(`admin:${password}`).digest("hex");
}

// Middleware: protect admin routes
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers["authorization"] ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  if (!token) {
    return res.status(401).json({ error: "unauthorized", message: "Authentication required" });
  }

  const expected = computeAdminToken();
  if (token.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    return res.status(401).json({ error: "unauthorized", message: "Invalid token" });
  }

  next();
}

// POST /api/auth/login
router.post("/auth/login", (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  const adminPassword = getAdminPassword();

  if (!password || password !== adminPassword) {
    return res.status(401).json({ error: "invalid_password", message: "密码错误" });
  }

  const token = computeAdminToken();
  res.json({ ok: true, token });
});

// POST /api/auth/change-password — requires current auth
router.post("/auth/change-password", requireAdmin, (req: Request, res: Response) => {
  const { newPassword } = req.body as { newPassword?: string };

  if (!newPassword || newPassword.trim().length < 4) {
    return res.status(400).json({ error: "invalid_password", message: "密码至少需要 4 个字符" });
  }

  // If ADMIN_PASSWORD is set via env var, refuse to override (env var takes priority)
  if (process.env["ADMIN_PASSWORD"]) {
    return res.status(400).json({
      error: "env_override",
      message: "当前密码由环境变量 ADMIN_PASSWORD 控制，请在部署配置中修改",
    });
  }

  try {
    const filePath = getPasswordFilePath();
    const dataDir = path.dirname(filePath);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(filePath, newPassword.trim(), { mode: 0o600 });

    // computeAdminToken() will now read the new password from file
    const newToken = computeAdminToken();
    res.json({ ok: true, token: newToken });
  } catch (err) {
    res.status(500).json({ error: "write_failed", message: "无法保存密码" });
  }
});

// POST /api/auth/logout (client just discards token)
router.post("/auth/logout", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// GET /api/auth/me — check if token is valid
router.get("/auth/me", (req: Request, res: Response) => {
  const auth = req.headers["authorization"] ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return res.json({ loggedIn: false });

  const expected = computeAdminToken();
  const valid = token.length === expected.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  res.json({ loggedIn: valid });
});

export default router;
