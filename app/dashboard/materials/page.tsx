import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { MaterialsView } from "@/features/teaching/components/materials-view"
import { parseMaterialFilters } from "@/features/teaching/filters"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { listMaterials } from "@/services/teaching/material-service"
import { teachingOptions } from "@/services/teaching/options-service"

export const metadata: Metadata = { title: "Teaching materials" }

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "courses.view")) return <AccessDenied />
  const raw = await searchParams
  const filters = parseMaterialFilters(raw)
  const [list, options] = await Promise.all([listMaterials(context, filters), teachingOptions(context)])

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Teaching materials" description="Notes, worksheets, slides and links you share with your classes." breadcrumbs={[{ label: "Teaching materials" }]} />
      <MaterialsView
        rows={list.rows}
        total={list.total}
        yearId={list.yearId}
        filters={filters}
        options={options}
        canCreate={options.isTeacher && hasPermission(context, "courses.create")}
        canDelete={hasPermission(context, "courses.update")}
        openNew={raw.new === "1"}
      />
    </div>
  )
}
