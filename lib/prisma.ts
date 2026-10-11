import "server-only"

import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/lib/generated/prisma/client"

// Reuse one client across hot reloads in dev to avoid exhausting connections.
// The cached client is only reused while it was built from the current
// generated class: after `prisma generate` the class changes, and a stale
// client (missing new models) is replaced instead of reused.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
  prismaClass?: typeof PrismaClient
}

// Doesn't throw when DATABASE_URL is missing, so builds that merely import
// this module still pass; queries fail at runtime instead.
function createPrismaClient() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      // Optional cap on pooled connections (e.g. 1 for single-connection
      // local test databases or small serverless functions).
      ...(process.env.DATABASE_POOL_MAX && { max: Number(process.env.DATABASE_POOL_MAX) }),
    }),
    // Interactive transactions run many round trips to a remote (pooled)
    // database; the 5s default is too tight for multi-table writes.
    transactionOptions: { maxWait: 10_000, timeout: 20_000 },
  })
}

function cachedClient() {
  const cached = globalForPrisma.prisma
  if (cached && globalForPrisma.prismaClass === PrismaClient) return cached
  // Release the stale client's connections; it won't be used again.
  void cached?.$disconnect().catch(() => {})
  return createPrismaClient()
}

export const prisma = process.env.NODE_ENV === "production" ? createPrismaClient() : cachedClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
  globalForPrisma.prismaClass = PrismaClient
}

export type TransactionClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0]
