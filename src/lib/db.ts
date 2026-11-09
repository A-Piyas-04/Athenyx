import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { previewDb } from "@/lib/preview-db";

/**
 * Prisma client singleton.
 *
 * Construction is lazy: importing this module must not require a database URL
 * or open a connection, so builds, type generation and unit tests of unrelated
 * code keep working. The instance is cached on `globalThis` because Next.js
 * re-evaluates modules on hot reload, which would otherwise exhaust
 * connections.
 */

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as {
  athenyxPrisma?: PrismaClient;
};

function getClient(): PrismaClient {
  if (process.env.ATHENYX_PREVIEW === "1") return previewDb as unknown as PrismaClient;
  globalForPrisma.athenyxPrisma ??= createClient();
  return globalForPrisma.athenyxPrisma;
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
  has(_target, property) {
    return property in getClient();
  },
});
