import { PrismaLibSql } from "@prisma/adapter-libsql";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { DATABASE_URL } from "./config.ts";
import { PrismaClient } from "./generated/prisma/client.ts";

/** `file:/abs/path.db` -> `/abs/path.db`, so the directory can be created. */
function filePath(url: string): string | undefined {
  if (!url.startsWith("file:")) return undefined;
  const path = url.slice("file:".length);
  return path === ":memory:" || path.startsWith(":") ? undefined : path;
}

const path = filePath(DATABASE_URL);
if (path) mkdirSync(dirname(path), { recursive: true });

// libSQL rather than better-sqlite3: the latter's native bindings crash the
// Bun runtime, and libSQL is SQLite-compatible on the same file.
const adapter = new PrismaLibSql({ url: DATABASE_URL });

export const prisma = new PrismaClient({ adapter });

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
