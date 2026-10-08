"use client"

import { UserAvatar, UserMenuContent } from "@/components/nav-user"
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export function UserMenuButton({ user }: { user: { name: string; email: string } }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <UserAvatar user={user} />
      </DropdownMenuTrigger>
      <UserMenuContent user={user} />
    </DropdownMenu>
  )
}
