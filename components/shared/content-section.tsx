import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

// A titled block of a page: heading, optional description and actions,
// then content, either on a card (default) or directly on the page.
export function ContentSection({
  title,
  description,
  actions,
  children,
  variant = "card",
  className,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  variant?: "card" | "plain"
  className?: string
}) {
  const heading = (title || actions) && (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {title && <h2 className="text-base font-semibold tracking-tight">{title}</h2>}
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
  if (variant === "plain") {
    return (
      <section className={cn("flex min-w-0 flex-col gap-3", className)}>
        {heading}
        {children}
      </section>
    )
  }
  return (
    <section className="min-w-0">
      <Card className={cn("min-w-0 gap-4 p-5", className)}>
        {heading}
        {children}
      </Card>
    </section>
  )
}
