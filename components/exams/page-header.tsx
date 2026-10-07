import Link from "next/link"
import { ChevronRightIcon } from "lucide-react"

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <nav
          aria-label="Breadcrumb"
          className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"
        >
          <Link href="/dashboard" className="hover:text-foreground">
            Dashboard
          </Link>
          <ChevronRightIcon className="size-3" />
          <Link href="/dashboard/exams" className="hover:text-foreground">
            Examination
          </Link>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

export function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(
    "en-US",
    opts ?? { month: "short", day: "numeric", year: "numeric" }
  )
}
