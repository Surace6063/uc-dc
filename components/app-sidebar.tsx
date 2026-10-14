"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRightIcon, ShieldIcon } from "lucide-react"

import {
  activeHref,
  NAV_CONFIGS,
  visibleNavGroups,
  type NavItem,
} from "@/components/navigation/nav-config"
import { OrganizationSwitcher } from "@/components/navigation/organization-switcher"
import { NavUser } from "@/components/nav-user"
import { useSession } from "@/components/shared/session-provider"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"

// The shared sidebar: institution, the member's navigation configuration
// (management, teacher, student or finance), and their account. Collapses
// to icons on desktop and becomes a drawer on mobile (components/ui/sidebar).

export function AppSidebar() {
  const pathname = usePathname()
  const { user, permissions, guardianPortal, navigation } = useSession()
  const { isMobile, setOpenMobile } = useSidebar()
  const config = NAV_CONFIGS[navigation]
  const groups = visibleNavGroups(config, permissions, { guardian: guardianPortal })
  const active = activeHref(pathname, groups)
  // Following a link closes the mobile drawer.
  const onNavigate = React.useCallback(() => {
    if (isMobile) setOpenMobile(false)
  }, [isMobile, setOpenMobile])

  return (
    <Sidebar collapsible="icon" className="print:hidden">
      <SidebarHeader>
        <OrganizationSwitcher />
        <p className="px-2 pt-1 text-[11px] font-medium tracking-wider text-sidebar-foreground/60 uppercase group-data-[collapsible=icon]:hidden">
          {config.label} dashboard
        </p>
      </SidebarHeader>
      <SidebarSeparator className="mx-0" />

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) =>
                item.items?.length ? (
                  <ExpandableItem key={item.href} item={item} active={active} onNavigate={onNavigate} />
                ) : (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton isActive={active === item.href} tooltip={item.title} render={<Link href={item.href} onClick={onNavigate} />}>
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              )}
            </SidebarMenu>
          </SidebarGroup>
        ))}

        {user.isPlatformAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Platform</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Platform console" render={<Link href="/platform" onClick={onNavigate} />}>
                  <ShieldIcon />
                  <span>Platform console</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

// A link with sub-pages. The row itself navigates (so it still works when
// the sidebar is collapsed to icons); the chevron shows or hides the
// sub-pages, which open by themselves when one of them is current.
function ExpandableItem({ item, active, onNavigate }: { item: NavItem; active: string | null; onNavigate: () => void }) {
  const hrefs = [item.href, ...(item.items ?? []).map((s) => s.href)]
  const containsActive = active !== null && hrefs.includes(active)
  const [open, setOpen] = React.useState(containsActive)
  // Opens when navigation moves into this group (adjusting state during
  // render rather than in an effect).
  const [wasActive, setWasActive] = React.useState(containsActive)
  if (containsActive !== wasActive) {
    setWasActive(containsActive)
    if (containsActive) setOpen(true)
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} render={<SidebarMenuItem />}>
      {/* Highlighted while any of its pages is current (visible when collapsed). */}
      <SidebarMenuButton isActive={containsActive} tooltip={item.title} render={<Link href={item.href} onClick={onNavigate} />}>
        <item.icon />
        <span>{item.title}</span>
      </SidebarMenuButton>
      <CollapsibleTrigger
        render={<SidebarMenuAction className="data-panel-open:rotate-90" aria-label={`${open ? "Hide" : "Show"} ${item.title} pages`} />}
      >
        <ChevronRightIcon />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>
          {item.items!.map((sub) => (
            <SidebarMenuSubItem key={sub.href + sub.title}>
              <SidebarMenuSubButton isActive={active === sub.href} render={<Link href={sub.href} onClick={onNavigate} />}>
                <span>{sub.title}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  )
}
