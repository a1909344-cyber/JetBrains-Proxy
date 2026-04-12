import fs from "fs";
import path from "path";
import crypto from "crypto";
import app from "./app";
import { logger } from "./lib/logger";

// ── Auto-generate SESSION_SECRET if not set ──────────────────────────────────
// Persisted to DATA_DIR/session_secret.txt so tokens survive restarts.
if (!process.env["SESSION_SECRET"]) {
  const dataDir = process.env["DATA_DIR"] || path.join(process.cwd(), "..", "..", "python", "proxy");
  const secretFile = path.join(dataDir, "session_secret.txt");
  try {
    if (fs.existsSync(secretFile)) {
      process.env["SESSION_SECRET"] = fs.readFileSync(secretFile, "utf8").trim();
      logger.info("SESSION_SECRET loaded from session_secret.txt");
    } else {
      const generated = crypto.randomBytes(32).toString("hex");
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(secretFile, generated, { mode: 0o600 });
      process.env["SESSION_SECRET"] = generated;
      logger.info("SESSION_SECRET auto-generated and saved to session_secret.txt");
    }
  } catch (err) {
    // Fallback: in-memory secret (tokens won't survive restart, but service stays up)
    process.env["SESSION_SECRET"] = crypto.randomBytes(32).toString("hex");
    logger.warn({ err }, "Could not persist SESSION_SECRET; tokens will expire on restart");
  }
}

// ── Start server ─────────────────────────────────────────────────────────────
const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
