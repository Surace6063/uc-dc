import { Reveal } from "@/components/landing/motion"
import { cn } from "@/lib/utils"

// Headline with a handwritten eyebrow; wrap the key phrase in <em>.
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: {
  eyebrow: string
  title: React.ReactNode
  description?: string
  align?: "center" | "left"
  className?: string
}) {
  return (
    <Reveal
      className={cn(
        "max-w-2xl",
        align === "center" ? "mx-auto text-center" : "text-left",
        className
      )}
    >
      <p className="inline-block -rotate-2 font-hand text-2xl text-primary">
        {eyebrow}
      </p>
      <h2 className="mt-2 font-display text-4xl leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-6xl [&_em]:text-primary">
        {title}
      </h2>
      {description && (
        <p className="mt-5 text-lg leading-relaxed text-pretty text-muted-foreground">
          {description}
        </p>
      )}
    </Reveal>
  )
}
