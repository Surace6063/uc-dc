import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { AdmissionForm } from "@/features/students/components/admission-form"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { getEducationStructure } from "@/services/academics/structure-service"

export const metadata: Metadata = {
  title: "Add student",
}

export default async function NewStudentPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "students.create")) return <AccessDenied />

  const structure = await getEducationStructure(context)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        title="Add student"
        description="Admit a student and, optionally, enroll them in a class for an academic year."
        breadcrumbs={[{ label: "Students", href: "/dashboard/students" }, { label: "Add student" }]}
      />
      <AdmissionForm
        structure={structure}
        showSensitive={hasPermission(context, "students.sensitive.view")}
        canEnroll={hasPermission(context, "students.enroll")}
        canUploadDocuments={hasPermission(context, "students.documents.manage")}
      />
    </div>
  )
}
