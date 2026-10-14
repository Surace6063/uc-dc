"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { trailForPath, type Crumb } from "@/components/navigation/nav-config"
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

// The header shows one breadcrumb trail. A page can supply its own (with
// real names: a student, an examination) through PageHeader; otherwise the
// trail comes from the URL and the navigation titles.

type PageTrail = { pathname: string; crumbs: Crumb[] }

const BreadcrumbContext = React.createContext<{
  trail: PageTrail | null
  setTrail: React.Dispatch<React.SetStateAction<PageTrail | null>>
} | null>(null)

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [trail, setTrail] = React.useState<PageTrail | null>(null)
  const value = React.useMemo(() => ({ trail, setTrail }), [trail])
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>
}

// Registers the page's trail with the header while the page is shown.
// Outside the dashboard layout (no header) the trail is shown in place.
export function SetBreadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  const context = React.useContext(BreadcrumbContext)
  const pathname = usePathname()
  const key = JSON.stringify(crumbs)
  const setTrail = context?.setTrail
  React.useEffect(() => {
    if (!setTrail) return
    setTrail({ pathname, crumbs: JSON.parse(key) as Crumb[] })
    return () => setTrail((current) => (current?.pathname === pathname ? null : current))
  }, [setTrail, pathname, key])
  if (context) return null
  return (
    <div className="mb-1 text-xs">
      <TrailList crumbs={crumbs} />
    </div>
  )
}

export function HeaderBreadcrumbs() {
  const pathname = usePathname()
  const context = React.useContext(BreadcrumbContext)
  // A page's own trail only applies to the page that registered it.
  const crumbs = context?.trail?.pathname === pathname ? context.trail.crumbs : trailForPath(pathname)
  if (crumbs.length === 0) return null
  return <TrailList crumbs={crumbs} />
}

function TrailList({ crumbs }: { crumbs: Crumb[] }) {
  // Long trails keep the first and the last two, with an ellipsis between.
  const shown = crumbs.length > 4 ? [crumbs[0], null, ...crumbs.slice(-2)] : crumbs
  const last = shown.length - 1

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {shown.map((crumb, i) => {
          const isLast = i === last
          // On small screens only the current page is shown.
          const hideOnMobile = !isLast ? "hidden md:inline-flex" : ""
          return (
            <React.Fragment key={crumb ? `${crumb.label}-${i}` : "ellipsis"}>
              {i > 0 && <BreadcrumbSeparator className="hidden md:block" />}
              <BreadcrumbItem className={`min-w-0 ${hideOnMobile}`}>
                {crumb === null ? (
                  <BreadcrumbEllipsis />
                ) : isLast ? (
                  <BreadcrumbPage className="truncate font-medium">{crumb.label}</BreadcrumbPage>
                ) : crumb.href ? (
                  <BreadcrumbLink className="truncate" render={<Link href={crumb.href} />}>
                    {crumb.label}
                  </BreadcrumbLink>
                ) : (
                  <span className="truncate">{crumb.label}</span>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
