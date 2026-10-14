import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { AssignmentDetail } from "@/features/teaching/components/assignment-detail"
import { hasPermission } from "@/lib/authorization/context"
import { NotFoundError } from "@/lib/authorization/errors"
import { getPageContext } from "@/lib/authorization/page"
import { getClassAssignment } from "@/services/teaching/class-assignment-service"
import { teachingOptions } from "@/services/teaching/options-service"

export const metadata: Metadata = { title: "Assignment" }

export default async function AssignmentPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "assignments.view")) return <AccessDenied />
  const id = z.uuid().safeParse((await params).assignmentId)
  if (!id.success) notFound()

  let detail
  try {
    detail = await getClassAssignment(context, id.data)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  const options = detail.canEdit ? await teachingOptions(context) : null
  const a = detail.assignment

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={a.title}
        description={`${a.subject.name} · ${[a.class.name, a.section && `Section ${a.section.name}`].filter(Boolean).join(" ")} · ${a.academicYear.name}`}
        breadcrumbs={[{ label: "Assignments", href: "/dashboard/assignments" }, { label: a.title }]}
      />
      <AssignmentDetail detail={detail} options={options} canDelete={detail.isOwner && hasPermission(context, "assignments.delete")} />
    </div>
  )
}
