// Sample education structure for development organisations. Used by both
// seed scripts; does nothing for an organisation that already has levels.
import { PERMISSION_KEYS } from "@/lib/authorization/permissions"
import type { OrganizationType } from "@/lib/generated/prisma/enums"
import { prisma } from "@/lib/prisma"
import {
  applyEducationPreset,
  generateClasses,
  saveAcademicYear,
  saveDocumentRequirement,
  saveSection,
} from "@/services/academics/structure-service"

export type SeedOrganization = { id: string; name: string; slug: string; type: OrganizationType }

// A service context acting as `actorId` with every permission.
export function seedContext(organization: SeedOrganization, actorId: string) {
  return {
    organization,
    user: { id: actorId, authUserId: "", email: "", name: "Seed", avatarUrl: null, isPlatformAdmin: false },
    membership: { id: "" },
    role: { id: "", name: "Seed", slug: "owner" },
    permissions: PERMISSION_KEYS,
  }
}

export async function seedEducationStructure(organization: SeedOrganization, actorId: string, presets: string[]) {
  if ((await prisma.educationLevel.count({ where: { organizationId: organization.id } })) > 0) return
  const ctx = seedContext(organization, actorId)

  for (const presetKey of presets) {
    await applyEducationPreset(ctx, { presetKey, createClasses: true, createPrograms: true })
  }
  // Classes for each program, named by the level's grouping (+2 starts at Grade 11).
  const programs = await prisma.program.findMany({
    where: { organizationId: organization.id },
    include: { educationLevel: true },
  })
  for (const program of programs) {
    const kind = program.educationLevel.groupingKind
    await generateClasses(ctx, {
      educationLevelId: program.educationLevelId,
      programId: program.id,
      kind,
      count: program.duration ?? 2,
      startAt: kind === "GRADE" ? 11 : 1,
    })
  }
  // Sections A and B for school classes; colleges get a single "A".
  const classes = await prisma.academicClass.findMany({ where: { organizationId: organization.id } })
  for (const academicClass of classes) {
    const names = academicClass.programId ? ["A"] : ["A", "B"]
    for (const name of names) await saveSection(ctx, null, { classId: academicClass.id, name, isActive: true })
  }

  await saveAcademicYear(ctx, null, {
    name: "2082", startDate: "2025-04-14", endDate: "2026-04-13", status: "COMPLETED", isCurrent: false,
  })
  await saveAcademicYear(ctx, null, {
    name: "2083", startDate: "2026-04-14", endDate: "2027-04-13", status: "ACTIVE", isCurrent: true,
  })

  await saveDocumentRequirement(ctx, null, { name: "Birth certificate", isRequired: true, isActive: true })
  await saveDocumentRequirement(ctx, null, { name: "Previous academic certificate", isRequired: true, isActive: true })
  await saveDocumentRequirement(ctx, null, { name: "Character certificate", isRequired: false, isActive: true })

  console.log(`    education structure: ${presets.join(", ")}`)
}
