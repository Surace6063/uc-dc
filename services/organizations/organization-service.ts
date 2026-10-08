import "server-only"

import { randomBytes } from "node:crypto"

import {
  DEFAULT_ROLES,
  OWNER_ROLE_SLUG,
  PERMISSION_KEYS,
  PERMISSIONS,
  isPermissionKey,
  type PermissionKey,
} from "@/lib/authorization/permissions"
import type { OrganizationType } from "@/lib/generated/prisma/enums"
import { prisma, type TransactionClient } from "@/lib/prisma"

export type OrganizationInput = {
  name: string
  type: OrganizationType
  country?: string | null
}

// ---------------------------------------------------------------- memberships

const membershipInclude = {
  organization: { select: { id: true, name: true, slug: true, type: true } },
  role: {
    select: {
      id: true,
      name: true,
      slug: true,
      permissions: { select: { permission: { select: { key: true } } } },
    },
  },
} as const

export type Membership = {
  id: string
  organization: { id: string; name: string; slug: string; type: OrganizationType }
  role: { id: string; name: string; slug: string }
  permissions: PermissionKey[]
}

type MembershipRow = {
  id: string
  organization: Membership["organization"]
  role: {
    id: string
    name: string
    slug: string
    permissions: { permission: { key: string } }[]
  }
}

function toMembership(row: MembershipRow): Membership {
  return {
    id: row.id,
    organization: row.organization,
    role: { id: row.role.id, name: row.role.name, slug: row.role.slug },
    // Ignore keys no longer in the code catalogue.
    permissions: row.role.permissions
      .map((rp) => rp.permission.key)
      .filter(isPermissionKey),
  }
}

// The only way to load a membership: always by (user, organisation) pair, so a
// caller can never obtain another user's membership by passing an ID.
export async function findMembership(
  userId: string,
  organizationId: string
): Promise<Membership | null> {
  const row = await prisma.organizationMember.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    include: membershipInclude,
  })
  return row ? toMembership(row) : null
}

export type MembershipSummary = {
  organizationId: string
  organizationName: string
  organizationType: OrganizationType
  roleName: string
}

export async function listMemberships(userId: string): Promise<MembershipSummary[]> {
  const rows = await prisma.organizationMember.findMany({
    where: { userId },
    orderBy: { organization: { name: "asc" } },
    select: {
      organization: { select: { id: true, name: true, type: true } },
      role: { select: { name: true } },
    },
  })
  return rows.map((row) => ({
    organizationId: row.organization.id,
    organizationName: row.organization.name,
    organizationType: row.organization.type,
    roleName: row.role.name,
  }))
}

// Loads full memberships, at most `take`. Used to auto-select a user's only org.
export async function findMemberships(userId: string, take: number): Promise<Membership[]> {
  const rows = await prisma.organizationMember.findMany({
    where: { userId },
    include: membershipInclude,
    orderBy: { createdAt: "asc" },
    take,
  })
  return rows.map(toMembership)
}

// ---------------------------------------------------------------- permissions

// Make sure every permission in the code catalogue exists in the database.
export async function syncPermissions(db: TransactionClient | typeof prisma = prisma) {
  await db.permission.createMany({
    data: PERMISSION_KEYS.map((key) => ({ key, description: PERMISSIONS[key] })),
    skipDuplicates: true,
  })
  const rows = await db.permission.findMany({
    where: { key: { in: PERMISSION_KEYS } },
    select: { id: true, key: true },
  })
  return new Map(rows.map((row) => [row.key as PermissionKey, row.id]))
}

// ---------------------------------------------------------------- organisations

function slugify(name: string) {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "")
  return base || "organization"
}

async function uniqueSlug(db: TransactionClient, name: string) {
  const base = slugify(name)
  const taken = await db.organization.findUnique({ where: { slug: base }, select: { id: true } })
  return taken ? `${base}-${randomBytes(3).toString("hex")}` : base
}

// Creates or updates the default roles of an organisation so their
// permissions match DEFAULT_ROLES. Returns role IDs by slug.
async function syncDefaultRoles(
  db: TransactionClient,
  organizationId: string,
  permissionIds: Map<PermissionKey, string>
) {
  const roleIds = new Map<string, string>()

  for (const def of DEFAULT_ROLES) {
    const role = await db.role.upsert({
      where: { organizationId_slug: { organizationId, slug: def.slug } },
      create: {
        organizationId,
        slug: def.slug,
        name: def.name,
        description: def.description,
        isSystem: true,
      },
      update: { name: def.name, description: def.description, isSystem: true },
      select: { id: true },
    })
    await db.rolePermission.deleteMany({ where: { roleId: role.id } })
    await db.rolePermission.createMany({
      data: def.permissions.map((key) => ({
        roleId: role.id,
        permissionId: permissionIds.get(key)!,
      })),
    })
    roleIds.set(def.slug, role.id)
  }

  return roleIds
}

// Creates an organisation with its default roles. Pass `ownerUserId` to make
// that (server-verified) user the owner in the same transaction.
export async function createOrganization(
  input: OrganizationInput,
  options: { ownerUserId?: string; slug?: string } = {}
) {
  return prisma.$transaction(async (tx) => {
    const permissionIds = await syncPermissions(tx)
    const organization = await tx.organization.create({
      data: {
        name: input.name,
        type: input.type,
        country: input.country || null,
        slug: options.slug ?? (await uniqueSlug(tx, input.name)),
      },
    })
    const roleIds = await syncDefaultRoles(tx, organization.id, permissionIds)

    if (options.ownerUserId) {
      await tx.organizationMember.create({
        data: {
          userId: options.ownerUserId,
          organizationId: organization.id,
          roleId: roleIds.get(OWNER_ROLE_SLUG)!,
        },
      })
    }

    return organization
  })
}

// Seed/maintenance helper: re-apply DEFAULT_ROLES to an existing organisation.
export async function resetDefaultRoles(organizationId: string) {
  return prisma.$transaction(async (tx) => {
    const permissionIds = await syncPermissions(tx)
    return syncDefaultRoles(tx, organizationId, permissionIds)
  })
}

// Adds a user to an organisation (or changes their role) by role slug.
// The role is looked up inside the organisation, so it can't come from another.
export async function upsertMember(
  organizationId: string,
  userId: string,
  roleSlug: string
) {
  const role = await prisma.role.findUnique({
    where: { organizationId_slug: { organizationId, slug: roleSlug } },
    select: { id: true },
  })
  if (!role) throw new Error(`Role "${roleSlug}" doesn't exist in this organisation`)

  return prisma.organizationMember.upsert({
    where: { userId_organizationId: { userId, organizationId } },
    create: { userId, organizationId, roleId: role.id },
    update: { roleId: role.id },
  })
}
