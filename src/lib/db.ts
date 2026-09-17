import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { env } from "./env";

// Swap this adapter for @prisma/adapter-pg when moving to Supabase:
//   const adapter = new PrismaPg({ connectionString: env.databaseUrl });
function createClient() {
  const adapter = new PrismaBetterSqlite3({ url: env.databaseUrl });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Reuse one client across hot reloads in development.
export const prisma = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
