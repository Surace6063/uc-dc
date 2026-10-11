import { type NextRequest } from "next/server"
import { z } from "zod"

import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { prisma } from "@/lib/prisma"
import { audit } from "@/services/audit/audit-service"
import { resolveAcademicYear } from "@/services/classes/class-service"
import { exportRosterCsv } from "@/services/classes/export-service"

const sectionSchema = z.union([z.uuid(), z.literal("none")]).nullable()

// GET /api/classes/:classId/roster?year=…&section=…|none
// The class (or one section's) roster for a year as CSV.
export const GET = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ classId: string }> }) => {
    const ctx = await requirePermission("classes.view", "students.view", "classes.export")
    const classId = z.uuid().parse((await params).classId)
    const search = request.nextUrl.searchParams
    const { yearId } = await resolveAcademicYear(ctx, search.get("year"))
    if (!yearId) return new Response("No academic year.", { status: 404 })
    const sectionId = sectionSchema.parse(search.get("section") || null)

    const roster = await exportRosterCsv(ctx, classId, yearId, sectionId)
    await audit(prisma, ctx, {
      action: "class.roster_export",
      entityType: "class",
      entityId: classId,
      summary: `Exported the roster of ${roster.name} (${roster.count} students)`,
      metadata: { academicYearId: yearId, sectionId },
    })
    const fileName = `${roster.name}-students.csv`.replace(/[^\w.-]+/g, "-")
    return new Response("﻿" + roster.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    })
  }
)
