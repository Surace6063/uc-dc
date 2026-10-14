import { NextResponse, type NextRequest } from "next/server"

import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { addMaterial } from "@/services/teaching/material-service"

// POST /api/materials (multipart: academicYearId, classId, sectionId?,
// subjectId, title, description?, kind, url?, sharedWithStudents, file?)
// Files go through a route handler (not a Server Action) for their size.
export const POST = withErrorHandling(async (request: NextRequest) => {
  const ctx = await requirePermission("courses.view")
  const material = await addMaterial(ctx, await request.formData())
  return NextResponse.json({ material }, { status: 201 })
})
