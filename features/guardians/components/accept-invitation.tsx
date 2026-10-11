"use client"

import * as React from "react"
import { CheckIcon } from "lucide-react"

import { FormAlert } from "@/components/shared/form"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { acceptGuardianInvitationAction } from "@/features/guardians/actions"

// On success the action redirects to the parent portal.
export function AcceptInvitationButton({ token }: { token: string }) {
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  return (
    <div className="grid gap-3">
      {error && <FormAlert tone="error">{error}</FormAlert>}
      <Button
        className="h-11 w-full text-base"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await acceptGuardianInvitationAction(token)
            if (result && !result.ok) setError(result.error)
          })
        }
      >
        {pending ? <Spinner /> : <CheckIcon data-icon="inline-start" />}
        Accept and open the parent portal
      </Button>
    </div>
  )
}
