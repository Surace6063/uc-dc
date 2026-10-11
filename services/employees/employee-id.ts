import "server-only"

import { ConflictError, ValidationError } from "@/lib/authorization/errors"
import { prisma } from "@/lib/prisma"
import { getStaffSettings } from "@/services/academics/structure-service"

// The employment foundation shared by teachers and non-teaching staff: one
// employee ID namespace per organisation, one numbering sequence. The
// database enforces the same rule across both tables with a trigger; these
// helpers give friendly errors first.

export const EMPLOYEE_ID_TAKEN = "This employee ID is already used in your organisation."

type Exclude = { teacherId?: string; staffId?: string }

// Case-insensitive match against both teachers and staff.
export async function isEmployeeIdTaken(organizationId: string, employeeId: string, exclude: Exclude = {}) {
  const match = { organizationId, employeeId: { equals: employeeId.trim(), mode: "insensitive" as const } }
  const [teacher, staff] = await Promise.all([
    prisma.teacher.findFirst({
      where: { ...match, ...(exclude.teacherId && { id: { not: exclude.teacherId } }) },
      select: { id: true },
    }),
    prisma.staff.findFirst({
      where: { ...match, ...(exclude.staffId && { id: { not: exclude.staffId } }) },
      select: { id: true },
    }),
  ])
  return Boolean(teacher || staff)
}

// Like a database sequence: one atomic UPDATE ... RETURNING per number, so
// concurrent creations never share an ID (gaps after failures are fine).
async function generateEmployeeId(organizationId: string) {
  await prisma.staffSettings.createMany({ data: [{ organizationId }], skipDuplicates: true })
  for (let attempt = 0; attempt < 50; attempt++) {
    const settings = await prisma.staffSettings.update({
      where: { organizationId },
      data: { nextEmployeeSequence: { increment: 1 } },
    })
    const candidate = `${settings.employeeIdPrefix}${String(settings.nextEmployeeSequence - 1).padStart(settings.employeeIdPadding, "0")}`
    if (!(await isEmployeeIdTaken(organizationId, candidate))) return candidate
  }
  throw new ConflictError("Couldn't generate a free employee ID. Check the numbering settings.")
}

// The requested ID (if free) or the next generated one. Manual numbering
// requires an ID.
export async function resolveEmployeeId(organizationId: string, requested: string | null, exclude: Exclude = {}) {
  if (requested) {
    if (await isEmployeeIdTaken(organizationId, requested, exclude)) {
      throw new ValidationError({ employeeId: [EMPLOYEE_ID_TAKEN] })
    }
    return requested
  }
  const settings = await getStaffSettings(prisma, organizationId)
  if (settings.employeeIdMode === "MANUAL") throw new ValidationError({ employeeId: ["Enter the employee ID."] })
  return generateEmployeeId(organizationId)
}

// Unique-violation targets that mean "employee ID taken": each table's own
// index and the cross-table trigger.
export const EMPLOYEE_ID_CONSTRAINTS = ["employee_id", "shared_employee_id_key"] as const
