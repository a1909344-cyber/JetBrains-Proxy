import app from "./app";
import { logger } from "./lib/logger";
import crypto from "crypto";
import fs from "fs";
import path from "path";

// Auto-generate SESSION_SECRET if not provided.
// The generated secret is persisted to DATA_DIR/session_secret so it survives
// container restarts (the volume keeps it stable).
function ensureSessionSecret(): void {
  if (process.env["SESSION_SECRET"]) return;

  const dataDir = process.env["DATA_DIR"] || path.join(process.cwd(), "..", "..", "python", "proxy");
  const secretFile = path.join(dataDir, ".session_secret");

  try {
    if (fs.existsSync(secretFile)) {
      const saved = fs.readFileSync(secretFile, "utf-8").trim();
      if (saved) {
        process.env["SESSION_SECRET"] = saved;
        logger.info("SESSION_SECRET loaded from persistent file");
        return;
      }
    }
    // Generate a new 32-byte random secret
    const generated = crypto.randomBytes(32).toString("hex");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(secretFile, generated, { mode: 0o600 });
    process.env["SESSION_SECRET"] = generated;
    logger.info("SESSION_SECRET auto-generated and saved to data directory");
  } catch (err) {
    // Can't write to data dir — use in-memory secret (sessions won't survive restarts)
    const fallback = crypto.randomBytes(32).toString("hex");
    process.env["SESSION_SECRET"] = fallback;
    logger.warn({ err }, "SESSION_SECRET auto-generated in-memory only (cannot write to data dir)");
  }
}

ensureSessionSecret();

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
