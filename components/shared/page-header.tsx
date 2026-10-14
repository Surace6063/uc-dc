import { SetBreadcrumbs } from "@/components/navigation/breadcrumbs"
import type { Crumb } from "@/components/navigation/nav-config"

export type { Crumb }

// Page title, description and an actions area, for module pages. The
// breadcrumb trail is shown in the dashboard header (with these labels).
export function PageHeader({
  title,
  description,
  breadcrumbs = [],
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  breadcrumbs?: Crumb[]
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      {/* Without explicit crumbs the header derives the trail from the URL. */}
      {breadcrumbs.length > 0 && <SetBreadcrumbs crumbs={[{ label: "Dashboard", href: "/dashboard" }, ...breadcrumbs]} />}
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
