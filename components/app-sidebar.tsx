"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRightIcon } from "lucide-react"
import { cn } from "@/lib/utils"

import { currentUser, navGroups, type NavItem } from "@/components/nav-data"
import { NavUser } from "@/components/nav-user"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"

function NavCollapsible({
  item,
  isActive,
  pathname,
}: {
  item: NavItem
  isActive: boolean
  pathname: string
}) {
  const { state, setOpen: setSidebarOpen } = useSidebar()
  const [open, setOpen] = React.useState(isActive)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      render={<SidebarMenuItem />}
    >
      <CollapsibleTrigger
        render={
          <SidebarMenuButton
            isActive={isActive}
            tooltip={item.title}
            onClick={() => {
              // In icon mode, expand the sidebar so the sub-menu is visible.
              if (state === "collapsed") {
                setSidebarOpen(true)
                setOpen(true)
              }
            }}
          />
        }
      >
        <item.icon />
        <span>{item.title}</span>
        <ChevronRightIcon
          className={cn(
            "ml-auto transition-transform duration-200",
            open && "rotate-90"
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0">
        <SidebarMenuSub>
          {item.items?.map((sub) => (
            <SidebarMenuSubItem key={sub.href}>
              {/* Bullet sitting on the sub-menu guide line. */}
              <span
                aria-hidden
                className={cn(
                  "absolute top-1/2 -left-[14.5px] size-2 -translate-y-1/2 rounded-full border-[1.5px] bg-sidebar transition-colors",
                  pathname === sub.href
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/50"
                )}
              />
              <SidebarMenuSubButton
                isActive={pathname === sub.href}
                render={<Link href={sub.href} />}
              >
                <span>{sub.title}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/dashboard" />}
              className="hover:bg-transparent active:bg-transparent"
            >
              <span className="hidden aspect-square size-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground group-data-[collapsible=icon]:flex">
                UC
              </span>
              <Image
                src="/uc-logo.png"
                alt="United College"
                width={685}
                height={364}
                className="h-10 w-auto group-data-[collapsible=icon]:hidden"
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const isActive =
                  item.href === "/dashboard"
                    ? pathname === item.href
                    : pathname.startsWith(item.href)

                if (item.items) {
                  return (
                    <NavCollapsible
                      key={item.href}
                      item={item}
                      isActive={isActive}
                      pathname={pathname}
                    />
                  )
                }

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.title}
                      render={<Link href={item.href} />}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={currentUser} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
