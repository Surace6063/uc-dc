import "server-only"

import { Prisma } from "@/lib/generated/prisma/client"

// Helpers for turning database constraint errors into domain errors. With
// driver adapters the violated constraint is nested in `meta`, so it's found
// by searching the serialised error rather than relying on one exact shape.

function details(error: Prisma.PrismaClientKnownRequestError) {
  try {
    return `${error.message} ${JSON.stringify(error.meta ?? {})}`
  } catch {
    return error.message
  }
}

function isKnown(error: unknown, code: string): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
}

// A unique constraint failed. Pass index names or column names to check
// which one; with none, any unique violation matches.
export function isUniqueViolation(error: unknown, ...targets: string[]) {
  if (!isKnown(error, "P2002")) return false
  if (targets.length === 0) return true
  const text = details(error)
  return targets.some((target) => text.includes(target))
}

// A foreign key blocked a delete or update (the row is still referenced).
export function isForeignKeyViolation(error: unknown) {
  return isKnown(error, "P2003") || isKnown(error, "P2014")
}
