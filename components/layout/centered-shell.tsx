import { Logo } from "@/components/landing/logo"
import { UserMenuButton } from "@/components/layout/user-menu-button"

// Minimal frame for steps outside the dashboard (onboarding, org picker).
export function CenteredShell({
  user,
  children,
}: {
  user: { name: string; email: string }
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <header className="flex h-16 items-center justify-between border-b bg-background px-4 sm:px-6">
        <Logo />
        <UserMenuButton user={user} />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-12 sm:py-20">
        <div className="w-full max-w-lg">{children}</div>
      </main>
    </div>
  )
}
