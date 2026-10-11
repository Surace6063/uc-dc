import Link from "next/link"
import { ChevronRightIcon } from "lucide-react"

export type Crumb = { label: string; href?: string }

// Page title with breadcrumbs and an actions area, for module pages.
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
  const trail: Crumb[] = [{ label: "Dashboard", href: "/dashboard" }, ...breadcrumbs]
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="mb-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {trail.map((crumb, i) => (
            <span key={`${crumb.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRightIcon className="size-3" />}
              {crumb.href && i < trail.length - 1 ? (
                <Link href={crumb.href} className="hover:text-foreground">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current={i === trail.length - 1 ? "page" : undefined}>{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
