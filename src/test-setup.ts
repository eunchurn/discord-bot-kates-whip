import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Loaded by bunfig.toml before any test module, so the store talks to a
// throwaway database instead of the real one.
const dir = mkdtempSync(join(tmpdir(), "kates-whip-test-"));
const file = join(dir, "test.db");

process.env.DATABASE_URL = `file:${file}`;
process.env.DISCORD_TOKEN ??= "test-token";
process.env.DEFAULT_ADMIN_ROLE_ID = "1470006260173897738";

// Apply the committed migrations so tests run against the real schema.
const result = Bun.spawnSync(["bunx", "prisma", "migrate", "deploy"], {
  env: { ...process.env, DATABASE_URL: `file:${file}` },
  stdout: "pipe",
  stderr: "pipe",
});

if (result.exitCode !== 0) {
  throw new Error(`prisma migrate deploy failed:\n${result.stderr.toString()}`);
}

process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
