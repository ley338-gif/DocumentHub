// Loads apps/api/.env.test into process.env before the Nest/Prisma modules
// are imported by any e2e spec, so the acceptance test never touches the
// dev database. Minimal hand-rolled parser to avoid adding a dotenv
// dependency just for this.
const fs = require("fs");
const path = require("path");

const envPath = path.resolve(__dirname, "..", ".env.test");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    process.env[key] = value;
  }
}
