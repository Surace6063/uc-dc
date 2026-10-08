"use client"

import * as React from "react"
import Link from "next/link"
import { Building2Icon, CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react"

import { useSession } from "@/components/shared/session-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { switchOrganization } from "@/features/organizations/actions"

// Shows the current organisation; lets members of several switch between them.
// The server action verifies membership before changing anything.
export function OrganizationSwitcher() {
  const { organization, role, memberships } = useSession()
  const [pending, startTransition] = React.useTransition()

  function select(organizationId: string) {
    if (organizationId === organization.id) return
    const formData = new FormData()
    formData.set("organizationId", organizationId)
    startTransition(() => switchOrganization(formData))
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" className="data-popup-open:bg-sidebar-accent" />}
          >
            <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Building2Icon className="size-4" />
            </span>
            <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">
                {pending ? "Switching…" : organization.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">{role.name}</span>
            </span>
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={8} className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Organisations</DropdownMenuLabel>
              {memberships.map((m) => (
                <DropdownMenuItem key={m.organizationId} onClick={() => select(m.organizationId)}>
                  <Building2Icon />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{m.organizationName}</span>
                    <span className="block text-xs text-muted-foreground">{m.roleName}</span>
                  </span>
                  {m.organizationId === organization.id && <CheckIcon className="ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/onboarding" />}>
              <PlusIcon />
              Create organisation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
