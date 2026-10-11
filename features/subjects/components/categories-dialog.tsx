"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import { deleteCategoryAction, saveCategoryAction } from "@/features/subjects/actions"
import { SUGGESTED_CATEGORIES } from "@/features/subjects/constants"
import type { SubjectCategoryRow } from "@/services/subjects/subject-service"

// The organisation's own subject categories (Language, Science, …).
export function CategoriesDialog({
  categories,
  onClose,
}: {
  categories: SubjectCategoryRow[]
  onClose: () => void
}) {
  const router = useRouter()
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function run<T>(action: () => Promise<{ ok: boolean; error?: string } & T>, success?: string) {
    setBusy(true)
    const result = await action()
    setBusy(false)
    if (!result.ok) {
      toast.add({ title: "Couldn't save", description: result.error, type: "error" })
      return false
    }
    if (success) toast.add({ title: success, type: "success" })
    router.refresh()
    return true
  }

  const add = async (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    if (await run(() => saveCategoryAction(null, { name: trimmed, isActive: true, sortOrder: categories.length * 10 }), "Category added")) {
      setName("")
    }
  }

  const missing = SUGGESTED_CATEGORIES.filter((c) => !categories.some((x) => x.name.toLowerCase() === c.toLowerCase()))

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Subject categories</DialogTitle>
          <DialogDescription>
            Your own classification for filtering and reports. A category never changes how a subject behaves.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void add(name)
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" aria-label="New category" maxLength={60} />
          <Button type="submit" disabled={busy || !name.trim()}>
            <PlusIcon data-icon="inline-start" />
            Add
          </Button>
        </form>
        {missing.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Suggestions:</span>
            {missing.map((c) => (
              <Button key={c} type="button" size="xs" variant="outline" disabled={busy} onClick={() => void add(c)}>
                {c}
              </Button>
            ))}
          </div>
        )}
        <ul className="divide-y rounded-lg border">
          {categories.length === 0 && <li className="p-3 text-sm text-muted-foreground">No categories yet.</li>}
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
              <Badge variant="secondary">{c._count.subjects} subjects</Badge>
              <Switch
                checked={c.isActive}
                aria-label={`${c.name} active`}
                disabled={busy}
                onCheckedChange={(checked) =>
                  void run(() => saveCategoryAction(c.id, { name: c.name, description: c.description, isActive: checked, sortOrder: c.sortOrder }))
                }
              />
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Delete ${c.name}`}
                disabled={busy || c._count.subjects > 0}
                title={c._count.subjects ? "In use; deactivate it instead" : undefined}
                onClick={() => void run(() => deleteCategoryAction(c.id), "Category deleted")}
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
