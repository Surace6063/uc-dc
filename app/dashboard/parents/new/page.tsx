import type { Metadata } from "next"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { CreateGuardianForm } from "@/features/guardians/components/guardian-form"
import { fullName } from "@/features/students/constants"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { prisma } from "@/lib/prisma"

export const metadata: Metadata = {
  title: "Add guardian",
}

export default async function NewGuardianPage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "parents.create")) return <AccessDenied />

  const canLink = hasPermission(context, "parents.update") && hasPermission(context, "students.view")
  // ?student=<id> pre-selects a student (from the student's profile); it is
  // only used if that student belongs to this organisation.
  const requested = z.uuid().safeParse((await searchParams).student)
  const student =
    canLink && requested.success
      ? await prisma.student.findFirst({
          where: { id: requested.data, organizationId: context.organization.id, archivedAt: null },
          select: { id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true },
        })
      : null

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="Add guardian"
        description="Create a guardian profile. This never creates a login account; invite the guardian to the parent portal from their profile."
        breadcrumbs={[{ label: "Parents", href: "/dashboard/parents" }, { label: "Add guardian" }]}
      />
      <CreateGuardianForm
        permissions={{ sensitive: hasPermission(context, "parents.sensitive.view"), link: canLink }}
        initialStudent={student ? { id: student.id, name: fullName(student), admissionNumber: student.admissionNumber } : null}
      />
    </div>
  )
}
