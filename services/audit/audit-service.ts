import "server-only"

import type { AuthContext } from "@/lib/authorization/context"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma, type TransactionClient } from "@/lib/prisma"

// Only the IDs are used, so flows without a full AuthContext (accepting an
// invitation) can record entries too.
type AuditContext = { organization: Pick<AuthContext["organization"], "id">; user: Pick<AuthContext["user"], "id"> }

export type AuditEntry = {
  action: string
  entityType: string
  entityId?: string | null
  summary: string
  metadata?: Prisma.InputJsonValue
}

// Records who did what. Call inside the same transaction as the change so a
// rolled-back change never leaves an audit entry behind (and vice versa).
export async function audit(
  db: TransactionClient | typeof prisma,
  ctx: AuditContext,
  entry: AuditEntry | AuditEntry[]
) {
  const entries = Array.isArray(entry) ? entry : [entry]
  if (entries.length === 0) return
  await db.auditLog.createMany({
    data: entries.map((e) => ({
      organizationId: ctx.organization.id,
      actorUserId: ctx.user.id,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      summary: e.summary,
      metadata: e.metadata,
    })),
  })
}

export async function listEntityActivity(
  ctx: Pick<AuthContext, "organization">,
  entityType: string,
  entityId: string,
  take = 50
) {
  return prisma.auditLog.findMany({
    where: { organizationId: ctx.organization.id, entityType, entityId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      action: true,
      summary: true,
      createdAt: true,
      actor: { select: { name: true, email: true } },
    },
  })
}
