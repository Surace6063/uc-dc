import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { ClassForm } from "@/features/classes/components/class-form"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { getEducationStructure } from "@/services/academics/structure-service"

export const metadata: Metadata = {
  title: "New class",
}

export default async function NewClassPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const context = await getPageContext()
  if (!hasPermission(context, "classes.manage")) return <AccessDenied />

  const structure = await getEducationStructure(context)
  const query = await searchParams
  const requested = typeof query.level === "string" ? query.level : null
  const level =
    structure.levels.find((l) => l.id === requested) ?? structure.levels.find((l) => l.isActive) ?? structure.levels[0]

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="New class"
        description="A grade, class, year, semester or cohort within one of your education levels."
        breadcrumbs={[{ label: "Classes & Sections", href: "/dashboard/classes" }, { label: "New class" }]}
      />
      {structure.levels.length === 0 ? (
        <AccessDenied title="Add an education level under Education structure first." />
      ) : (
        <ClassForm
          structure={structure}
          classId={null}
          initial={{
            educationLevelId: level?.id ?? "",
            programId: "",
            name: "",
            localName: "",
            code: "",
            description: "",
            kind: level?.groupingKind ?? "GRADE",
            sequence: "",
            capacity: "",
            isActive: true,
            sections: "",
            sectionCapacity: "",
          }}
        />
      )}
    </div>
  )
}
