// Runs once before the e2e test suite: pushes the Prisma schema to the
// dedicated test database (apps/api/.env.test — never the dev database),
// creating the database if it doesn't exist yet.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

module.exports = async () => {
  const envPath = path.resolve(__dirname, "..", ".env.test");
  const env = { ...process.env };
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }

  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: path.resolve(__dirname, ".."),
    env,
    stdio: "inherit",
  });
};
