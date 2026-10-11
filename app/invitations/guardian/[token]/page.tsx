import type { Metadata } from "next"
import Link from "next/link"
import { HeartHandshakeIcon } from "lucide-react"

import { Logo } from "@/components/landing/logo"
import { CenteredShell } from "@/components/layout/centered-shell"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { signOut } from "@/features/auth/actions"
import { AcceptInvitationButton } from "@/features/guardians/components/accept-invitation"
import { getCurrentUser } from "@/lib/auth/session"
import { findInvitation } from "@/services/guardians/invitation-service"

export const metadata: Metadata = {
  title: "Parent portal invitation",
  // The URL carries a secret token.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
}

const formatDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

function Frame({ user, children }: { user: { name: string; email: string } | null; children: React.ReactNode }) {
  if (user) return <CenteredShell user={user}>{children}</CenteredShell>
  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <header className="flex h-16 items-center border-b bg-background px-4 sm:px-6">
        <Logo />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-12 sm:py-20">
        <div className="w-full max-w-lg">{children}</div>
      </main>
    </div>
  )
}

// Public landing page for a guardian's invitation link. Shows only the school
// and guardian name and a masked email to whoever holds the link; accepting
// needs a signed-in account with the invited email (checked on the server).
export default async function GuardianInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const [invitation, user] = await Promise.all([findInvitation(token), getCurrentUser()])
  const here = `/invitations/guardian/${token}`

  if (invitation.state !== "pending") {
    const message =
      invitation.state === "accepted"
        ? "This invitation has already been accepted. Sign in to open the parent portal."
        : invitation.state === "expired"
          ? "This invitation has expired. Ask the school to send a new one."
          : "This invitation link isn't valid any more. Ask the school to send a new one."
    return (
      <Frame user={user}>
        <Card className="gap-4 p-6">
          <h1 className="text-xl font-semibold">Invitation unavailable</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
          <Button variant="outline" nativeButton={false} render={<Link href={user ? "/dashboard" : "/login"} />}>
            {user ? "Go to dashboard" : "Sign in"}
          </Button>
        </Card>
      </Frame>
    )
  }

  const matches = user && user.email.toLowerCase() === invitation.email.toLowerCase()

  return (
    <Frame user={user}>
      <Card className="gap-5 p-6">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <HeartHandshakeIcon className="size-5" />
        </span>
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold">{invitation.organizationName} invited you to its parent portal</h1>
          <p className="text-sm text-muted-foreground">
            As {invitation.guardianName}, you&apos;ll be able to see information the school shares about your children.
            The invitation is for <span className="font-medium text-foreground">{invitation.maskedEmail}</span> and expires on {formatDate(invitation.expiresAt)}.
          </p>
        </div>

        {!user ? (
          <div className="grid gap-2">
            <Button className="h-11" nativeButton={false} render={<Link href={`/login?next=${encodeURIComponent(here)}`} />}>
              Sign in to accept
            </Button>
            <Button variant="outline" className="h-11" nativeButton={false} render={<Link href={`/register?next=${encodeURIComponent(here)}`} />}>
              Create an account
            </Button>
            <p className="text-xs text-muted-foreground">Use the email address the invitation was sent to. Your password is never shared with the school.</p>
          </div>
        ) : matches ? (
          <AcceptInvitationButton token={token} />
        ) : (
          <div className="grid gap-3">
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              You&apos;re signed in as {user.email}, but this invitation is for {invitation.maskedEmail}. Sign out and sign in with that address.
            </p>
            <form action={signOut}>
              <Button type="submit" variant="outline" className="w-full">Sign out</Button>
            </form>
          </div>
        )}
      </Card>
    </Frame>
  )
}
