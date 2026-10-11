import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { EducationStructureManager } from "@/features/academics/components/structure-manager"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { getEducationStructure } from "@/services/academics/structure-service"

export const metadata: Metadata = {
  title: "Education Structure",
}

export default async function AcademicsPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "academics.view")) return <AccessDenied />

  const structure = await getEducationStructure(context)
  const canManage = hasPermission(context, "academics.manage")

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Education structure"
        description={
          canManage
            ? "Configure the levels, programs, classes, sections and academic years your institution uses. Students are admitted and filtered by this structure."
            : "The levels, programs, classes and academic years your institution uses. Ask an administrator to make changes."
        }
        breadcrumbs={[{ label: "Academics" }]}
      />
      <EducationStructureManager structure={structure} canManage={canManage} />
    </div>
  )
}
