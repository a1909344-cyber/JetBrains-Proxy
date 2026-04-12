import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";

const router = Router();

// A fixed admin token derived from SESSION_SECRET + ADMIN_PASSWORD.
// Recomputed on each request so changing the password invalidates existing tokens.
function computeAdminToken(): string {
  const secret = process.env["SESSION_SECRET"] ?? "dev-secret";
  const password = process.env["ADMIN_PASSWORD"] ?? "";
  return crypto.createHmac("sha256", secret).update(`admin:${password}`).digest("hex");
}

// Middleware: protect admin routes
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // If no ADMIN_PASSWORD set, allow all (dev / not yet configured)
  if (!process.env["ADMIN_PASSWORD"]) return next();

  const auth = req.headers["authorization"] ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  if (!token) {
    return res.status(401).json({ error: "unauthorized", message: "Authentication required" });
  }

  const expected = computeAdminToken();
  // Constant-time comparison to prevent timing attacks
  if (token.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    return res.status(401).json({ error: "unauthorized", message: "Invalid token" });
  }

  next();
}

// POST /api/auth/login
router.post("/auth/login", (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  const adminPassword = process.env["ADMIN_PASSWORD"];

  if (!adminPassword) {
    // No password configured — open dev mode
    return res.json({ ok: true, token: "open", mode: "open" });
  }

  if (!password || password !== adminPassword) {
    return res.status(401).json({ error: "invalid_password", message: "密码错误" });
  }

  const token = computeAdminToken();
  res.json({ ok: true, token });
});

// POST /api/auth/logout (client just discards token)
router.post("/auth/logout", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// GET /api/auth/me — check if token is valid (no auth guard here, returns status)
router.get("/auth/me", (req: Request, res: Response) => {
  const adminPassword = process.env["ADMIN_PASSWORD"];
  if (!adminPassword) return res.json({ loggedIn: true, mode: "open" });

  const auth = req.headers["authorization"] ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return res.json({ loggedIn: false });

  const expected = computeAdminToken();
  const valid = token.length === expected.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  res.json({ loggedIn: valid });
});

export default router;
