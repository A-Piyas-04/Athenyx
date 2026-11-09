import { execSync } from "node:child_process";
import { Client } from "pg";
import type { TestProject } from "vitest/node";

/**
 * Vitest global setup: prepares a separate test database for the DB-backed
 * integration tests (09 §2). If PostgreSQL is not reachable, those tests are
 * skipped instead of failing, so `npm test` still works without Docker.
 *
 * The database name must end in `_test` — the tests truncate its tables.
 */

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

const DEFAULT_URL = "postgresql://athenyx:athenyx@localhost:5432/athenyx_test";

export default async function setup(project: TestProject) {
  const url = process.env.TEST_DATABASE_URL || DEFAULT_URL;
  let provided = "";
  try {
    const parsed = new URL(url);
    const name = parsed.pathname.replace(/^\//, "");
    if (!/^[a-z0-9_]+_test$/.test(name)) {
      throw new Error(`TEST_DATABASE_URL must point at a database whose name ends in "_test" (got "${name}").`);
    }
    parsed.pathname = "/postgres";
    const admin = new Client({ connectionString: parsed.toString(), connectionTimeoutMillis: 2_000 });
    await admin.connect();
    try {
      const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
      if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${name}"`);
    } finally {
      await admin.end();
    }
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    provided = url;
  } catch (error) {
    console.warn(
      `[tests] Test database unavailable (${error instanceof Error ? error.message.split("\n")[0] : "error"}); database integration tests are skipped.`,
    );
  }
  project.provide("testDatabaseUrl", provided);
}
