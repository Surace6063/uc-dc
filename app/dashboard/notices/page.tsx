import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { NoticesView } from "@/features/teaching/components/notices-view"
import { parseNoticeFilters } from "@/features/teaching/filters"
import { getPageContext } from "@/lib/authorization/page"
import { canManageNotices, canReadNotices, listNotices, noticeClassOptions } from "@/services/teaching/notice-service"
import { teachingOptions } from "@/services/teaching/options-service"
import { listAcademicYearOptions } from "@/services/academics/structure-service"

export const metadata: Metadata = { title: "Notices" }

export default async function NoticesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getPageContext()
  if (!canReadNotices(context)) return <AccessDenied />
  const raw = await searchParams
  const filters = parseNoticeFilters(raw)
  const manager = canManageNotices(context)
  const [list, options, years, allClasses] = await Promise.all([
    listNotices(context, filters),
    teachingOptions(context),
    listAcademicYearOptions(context),
    // Office staff post to any class.
    noticeClassOptions(context),
  ])
  const canPost = manager || options.places.length > 0

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Notices"
        description={manager ? "Announcements for everyone, a group, or one class." : "Announcements for you, and notices you post to your classes."}
        breadcrumbs={[{ label: "Notices" }]}
      />
      <NoticesView
        rows={list.rows}
        total={list.total}
        filters={filters}
        options={options}
        years={years}
        allClasses={allClasses}
        canManage={manager}
        canPost={canPost}
        openNew={raw.new === "1"}
      />
    </div>
  )
}
