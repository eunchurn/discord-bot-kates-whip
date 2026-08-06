import { defineConfig } from "prisma/config";

/**
 * Mirrors `DATABASE_URL` in src/config.ts. The default keeps `prisma generate`
 * working in CI and Docker builds, where no database exists yet.
 */
const url = process.env.DATABASE_URL ?? "file:./data/kates-whip.db";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: { url },
});
