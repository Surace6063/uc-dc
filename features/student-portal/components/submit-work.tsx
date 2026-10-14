"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { SendIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { MATERIAL_MAX_BYTES } from "@/features/teaching/constants"

// Hands in the student's own work through the upload route; the server
// checks the assignment is open, the student is in the class, and the file.
export function SubmitWork({ assignmentId, hasFile, previousContent }: { assignmentId: string; hasFile: boolean; previousContent: string }) {
  const router = useRouter()
  const [content, setContent] = React.useState(previousContent)
  const [file, setFile] = React.useState<File | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const fileInput = React.useRef<HTMLInputElement>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!content.trim() && !file && !hasFile) {
      setError("Write your answer or attach a file.")
      return
    }
    if (file && file.size > MATERIAL_MAX_BYTES) {
      setError(`The file must be ${MATERIAL_MAX_BYTES / 1024 / 1024} MB or smaller.`)
      return
    }
    setPending(true)
    const body = new FormData()
    body.set("content", content)
    if (file) body.set("file", file)
    const res = await fetch(`/api/assignments/${assignmentId}/submission`, { method: "POST", body }).catch(() => null)
    setPending(false)
    if (!res?.ok) {
      const json = await res?.json().catch(() => null)
      const fieldErrors = json?.error?.fieldErrors as Record<string, string[] | undefined> | undefined
      setError(fieldErrors?.file?.[0] ?? fieldErrors?.content?.[0] ?? json?.error?.message ?? "Your work couldn't be submitted. Please try again.")
      return
    }
    toast.add({ title: "Work submitted", description: "Your teacher can now review it.", type: "success" })
    setFile(null)
    if (fileInput.current) fileInput.current.value = ""
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="grid max-w-2xl gap-4" noValidate>
      {error && <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
      <div className="grid gap-1.5">
        <Label htmlFor="work-content">Answer or note</Label>
        <Textarea id="work-content" rows={6} maxLength={5000} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Type your answer, or a note for your teacher" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="work-file">File</Label>
        <Input id="work-file" ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <p className="text-xs text-muted-foreground">
          PDF or photo (JPG, PNG, WebP), up to {MATERIAL_MAX_BYTES / 1024 / 1024} MB.{hasFile ? " Attaching a new file replaces the one you handed in." : ""}
        </p>
      </div>
      <Button type="submit" className="justify-self-start" disabled={pending}>
        {pending ? <Spinner /> : <SendIcon data-icon="inline-start" />}
        Submit
      </Button>
    </form>
  )
}
