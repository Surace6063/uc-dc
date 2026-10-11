import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { EditTeacherForm } from "@/features/teachers/components/edit-teacher-form"
import { teacherName } from "@/features/teachers/constants"
import type { UpdateTeacherInput } from "@/features/teachers/schemas"
import { hasPermission } from "@/lib/authorization/context"
import { NotFoundError } from "@/lib/authorization/errors"
import { getPageContext } from "@/lib/authorization/page"
import { fromDate } from "@/lib/validation"
import { getTeacherProfile } from "@/services/teachers/teacher-service"

export const metadata: Metadata = {
  title: "Edit teacher",
}

export default async function EditTeacherPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "teachers.update")) return <AccessDenied />
  const id = z.uuid().safeParse((await params).id)
  if (!id.success) notFound()
  const teacher = await getTeacherProfile(context, id.data).catch((error) => {
    if (error instanceof NotFoundError) notFound()
    throw error
  })
  if (teacher.archivedAt) return <AccessDenied title="Archived teachers can't be edited. Restore the profile first." />

  const sensitive = teacher.sensitive
  const address = (type: "PERMANENT" | "TEMPORARY") => {
    const a = sensitive?.addresses.find((x) => x.type === type)
    return {
      province: a?.province ? String(a.province) : "", district: a?.district ?? "", municipality: a?.municipality ?? "",
      wardNumber: a?.wardNumber ? String(a.wardNumber) : "", tole: a?.tole ?? "", street: a?.street ?? "", postalCode: a?.postalCode ?? "",
    }
  }
  const permanent = address("PERMANENT")
  const temporary = address("TEMPORARY")
  const initial: UpdateTeacherInput = {
    employeeId: teacher.employeeId,
    personal: {
      firstName: teacher.firstName, middleName: teacher.middleName ?? "", lastName: teacher.lastName,
      nameNepali: teacher.nameNepali ?? "", dateOfBirth: fromDate(sensitive?.dateOfBirth), gender: teacher.gender ?? "",
      nationality: teacher.nationality ?? "",
    },
    contact: {
      email: teacher.email ?? "", phone: teacher.phone ?? "", alternatePhone: teacher.alternatePhone ?? "",
      emergencyContactName: sensitive?.emergencyContactName ?? "", emergencyContactPhone: sensitive?.emergencyContactPhone ?? "",
      emergencyContactRelationship: sensitive?.emergencyContactRelationship ?? "",
    },
    permanentAddress: permanent,
    sameAsPermanent: JSON.stringify(permanent) === JSON.stringify(temporary),
    temporaryAddress: temporary,
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        title={`Edit ${teacherName(teacher)}`}
        description={`Employee ID ${teacher.employeeId}`}
        breadcrumbs={[
          { label: "Teachers", href: "/dashboard/teachers" },
          { label: teacherName(teacher), href: `/dashboard/teachers/${teacher.id}` },
          { label: "Edit" },
        ]}
      />
      <EditTeacherForm teacherId={teacher.id} initial={initial} showSensitive={hasPermission(context, "teachers.sensitive.view")} />
    </div>
  )
}
