import Link from "next/link"
import { ShieldIcon } from "lucide-react"

import { UserMenuButton } from "@/components/layout/user-menu-button"
import { AccessDenied } from "@/components/shared/access-denied"
import { getPageUser } from "@/lib/authorization/page"

const links = [
  { href: "/platform", label: "Overview" },
  { href: "/platform/organizations", label: "Organizations" },
  { href: "/platform/users", label: "Users" },
  { href: "/platform/subscriptions", label: "Subscriptions" },
  { href: "/platform/settings", label: "Settings" },
]

// Platform console for the SaaS operator. Access comes only from the
// platform_admins table; no organisation role grants it.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await getPageUser()
  if (!user.isPlatformAdmin) {
    return (
      <main className="flex min-h-svh flex-col">
        <AccessDenied />
      </main>
    )
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-16 items-center gap-6 border-b px-4 sm:px-6">
        <span className="flex items-center gap-2 font-semibold">
          <ShieldIcon className="size-5 text-primary" />
          Platform
        </span>
        <nav className="flex flex-1 gap-1 overflow-x-auto text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <UserMenuButton user={user} />
      </header>
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  )
}
