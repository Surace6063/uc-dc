import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { EditStudentForm } from "@/features/students/components/edit-student-form"
import { fullName } from "@/features/students/constants"
import type { UpdateStudentInput } from "@/features/students/schemas"
import { hasPermission } from "@/lib/authorization/context"
import { NotFoundError } from "@/lib/authorization/errors"
import { getPageContext } from "@/lib/authorization/page"
import { fromDate } from "@/lib/validation"
import { getStudentProfile } from "@/services/students/student-service"

export const metadata: Metadata = {
  title: "Edit student",
}

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "students.update")) return <AccessDenied />

  const id = z.uuid().safeParse((await params).id)
  if (!id.success) notFound()
  const student = await getStudentProfile(context, id.data).catch((error) => {
    if (error instanceof NotFoundError) notFound()
    throw error
  })
  if (student.archivedAt) {
    return <AccessDenied title="Archived students can't be edited. Restore the student first." />
  }

  const address = (type: "PERMANENT" | "TEMPORARY") => {
    const a = student.addresses.find((x) => x.type === type)
    return {
      province: a?.province ? String(a.province) : "",
      district: a?.district ?? "",
      municipality: a?.municipality ?? "",
      wardNumber: a?.wardNumber ? String(a.wardNumber) : "",
      tole: a?.tole ?? "",
      street: a?.street ?? "",
      postalCode: a?.postalCode ?? "",
    }
  }
  const permanent = address("PERMANENT")
  const temporary = address("TEMPORARY")

  const initial: UpdateStudentInput = {
    personal: {
      firstName: student.firstName,
      middleName: student.middleName ?? "",
      lastName: student.lastName,
      dateOfBirth: fromDate(student.dateOfBirth),
      gender: student.gender ?? "",
      nationality: student.nationality ?? "",
      email: student.email ?? "",
      phone: student.phone ?? "",
      alternatePhone: student.alternatePhone ?? "",
      bloodGroup: (student.bloodGroup ?? "") as UpdateStudentInput["personal"]["bloodGroup"],
      motherTongue: student.motherTongue ?? "",
      medicalNotes: student.medicalNotes ?? "",
    },
    admission: {
      admissionNumber: student.admissionNumber,
      admissionDate: fromDate(student.admissionDate),
      admissionType: student.admissionType,
      previousSchool: student.previousSchool ?? "",
    },
    permanentAddress: permanent,
    sameAsPermanent: JSON.stringify(permanent) === JSON.stringify(temporary),
    temporaryAddress: temporary,
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        title={`Edit ${fullName(student)}`}
        description={`Admission number ${student.admissionNumber}`}
        breadcrumbs={[
          { label: "Students", href: "/dashboard/students" },
          { label: fullName(student), href: `/dashboard/students/${student.id}` },
          { label: "Edit" },
        ]}
      />
      <EditStudentForm
        studentId={student.id}
        initial={initial}
        showSensitive={hasPermission(context, "students.sensitive.view")}
      />
    </div>
  )
}
