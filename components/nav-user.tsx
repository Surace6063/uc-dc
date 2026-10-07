"use client"

import Link from "next/link"
import {
  ChevronsUpDownIcon,
  LogOutIcon,
  SettingsIcon,
  UserIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

type User = { name: string; email: string }

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function UserAvatar({ user }: { user: User }) {
  return (
    <Avatar className="rounded-lg after:rounded-lg">
      <AvatarFallback className="rounded-lg bg-primary/10 text-primary">
        {initials(user.name)}
      </AvatarFallback>
    </Avatar>
  )
}

function UserIdentity({ user }: { user: User }) {
  return (
    <>
      <UserAvatar user={user} />
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{user.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {user.email}
        </span>
      </div>
    </>
  )
}

export function UserMenuContent({
  user,
  side = "bottom",
  align = "end",
}: {
  user: User
  side?: "bottom" | "right"
  align?: "start" | "end"
}) {
  return (
    <DropdownMenuContent
      side={side}
      align={align}
      sideOffset={8}
      className="w-56"
    >
      <div className="flex items-center gap-2 px-1.5 py-1.5">
        <UserIdentity user={user} />
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem>
          <UserIcon />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/dashboard/settings" />}>
          <SettingsIcon />
          Settings
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" render={<Link href="/login" />}>
        <LogOutIcon />
        Log out
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}

export function NavUser({ user }: { user: User }) {
  const { isMobile } = useSidebar()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-popup-open:bg-sidebar-accent"
              />
            }
          >
            <UserIdentity user={user} />
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <UserMenuContent
            user={user}
            side={isMobile ? "bottom" : "right"}
            align="end"
          />
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
