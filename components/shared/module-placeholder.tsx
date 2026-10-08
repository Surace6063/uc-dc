// Stand-in for modules that haven't been built yet. The page around it has
// already passed its server-side permission check.
export function ModulePlaceholder({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">This module hasn&apos;t been built yet.</p>
    </div>
  )
}
