"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { BellIcon, BellOffIcon, CalendarRangeIcon, ChevronDownIcon, SearchIcon } from "lucide-react"

import { HeaderBreadcrumbs } from "@/components/navigation/breadcrumbs"
import { NAV_CONFIGS, navDestinations, visibleNavGroups } from "@/components/navigation/nav-config"
import { ModeToggle } from "@/components/mode-toggle"
import { UserAvatar, UserMenuContent } from "@/components/nav-user"
import { useSession } from "@/components/shared/session-provider"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Kbd } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

// ------------------------------------------------------------ search

// Ctrl/⌘ + K opens a search over the pages in the member's navigation.
// Searching records (students, teachers, …) is done on each module's list.
function HeaderSearch() {
  const router = useRouter()
  const { navigation, permissions, guardianPortal } = useSession()
  const [open, setOpen] = React.useState(false)
  const groups = visibleNavGroups(NAV_CONFIGS[navigation], permissions, { guardian: guardianPortal })
  const destinations = navDestinations(groups)
  const byGroup = Object.entries(Object.groupBy(destinations, (d) => d.group))

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-56 justify-start gap-2 bg-muted/40 px-3 font-normal text-muted-foreground shadow-none md:flex lg:w-72"
      >
        <SearchIcon />
        <span className="flex-1 text-left">Search pages…</span>
        <Kbd className="border bg-background">Ctrl K</Kbd>
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Search pages" className="md:hidden" onClick={() => setOpen(true)}>
        <SearchIcon />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search pages" description="Go to any page in your navigation.">
        <Command>
          <CommandInput placeholder="Search pages…" />
          <CommandList>
            <CommandEmpty>No matching pages.</CommandEmpty>
            {byGroup.map(([group, items]) => (
              <CommandGroup key={group} heading={group}>
                {items?.map((d) => (
                  <CommandItem key={d.href + d.title} value={`${d.parent ?? ""} ${d.title} ${group}`} onSelect={() => go(d.href)}>
                    <d.icon />
                    <span>{d.title}</span>
                    {d.parent && <span className="text-xs text-muted-foreground">{d.parent}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}

// ------------------------------------------------------------ academic year

// Pages whose lists follow the `year` URL filter. Elsewhere the header only
// shows the current year (the dashboard has its own year filter).
const YEAR_PAGES = [
  "/dashboard/students",
  "/dashboard/teachers",
  "/dashboard/classes",
  "/dashboard/subjects",
  "/dashboard/attendance/records",
  "/dashboard/attendance/sessions",
  "/dashboard/exams",
  "/dashboard/exams/analytics",
  "/dashboard/teaching/classes",
  "/dashboard/teaching/subjects",
  "/dashboard/teaching/exams",
  "/dashboard/teaching/results",
  "/dashboard/timetable",
  "/dashboard/lesson-plans",
  "/dashboard/materials",
  "/dashboard/assignments",
  "/dashboard/finance",
  "/dashboard/finance/structures",
  "/dashboard/finance/assignments",
  "/dashboard/finance/outstanding",
  "/dashboard/finance/concessions",
]
// Filters that don't depend on the year and survive a year change; every
// other filter (class, section, examination, …) belongs to the old year.
const KEPT_ON_YEAR_CHANGE = ["q", "view", "sort", "dir", "pageSize", "tab", "kind", "when", "status"]

function AcademicYearSelect() {
  const { academicYear, academicYears } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectable = YEAR_PAGES.includes(pathname) && academicYears.length > 0

  if (!selectable) {
    if (!academicYear) return null
    return (
      <div className="hidden items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-sm whitespace-nowrap xl:flex" title="Current academic year">
        <CalendarRangeIcon className="size-4 text-muted-foreground" />
        <span className="text-muted-foreground">Academic year</span>
        <span className="font-semibold tabular-nums">{academicYear.name}</span>
      </div>
    )
  }

  const param = searchParams.get("year")
  const selectedId = param && academicYears.some((y) => y.id === param) ? param : param === "all" ? "all" : (academicYear?.id ?? "")
  const selected = academicYears.find((y) => y.id === selectedId)

  function change(id: string) {
    const next = new URLSearchParams()
    for (const key of KEPT_ON_YEAR_CHANGE) {
      const v = searchParams.get(key)
      if (v) next.set(key, v)
    }
    // The current year is the pages' default, so it needs no parameter.
    if (id !== academicYear?.id) next.set("year", id)
    const qs = next.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" className="h-9 gap-2 bg-muted/40 shadow-none" aria-label="Academic year" />}
      >
        <CalendarRangeIcon className="text-muted-foreground" />
        <span className="hidden text-muted-foreground lg:inline">Year</span>
        <span className="font-semibold tabular-nums">{selected?.name ?? (selectedId === "all" ? "All years" : "Choose")}</span>
        <ChevronDownIcon className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Academic year</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={selectedId} onValueChange={(v) => change(String(v))}>
            {academicYears.map((y) => (
              <DropdownMenuRadioItem key={y.id} value={y.id}>
                <span className="flex-1 tabular-nums">{y.name}</span>
                {y.isCurrent && <span className="text-xs text-muted-foreground">Current</span>}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs text-muted-foreground">Changing the year clears this page&apos;s other filters.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ------------------------------------------------------------ notifications

// There's no notification store yet, so the menu says so instead of
// showing sample items or an unread dot.
function NotificationsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Notifications" />}>
        <BellIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <Empty className="border-0 p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BellOffIcon />
            </EmptyMedia>
            <EmptyTitle className="text-sm">No notifications</EmptyTitle>
            <EmptyDescription className="text-xs">Alerts about attendance, results and approvals will appear here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ------------------------------------------------------------ header

export function DashboardHeader() {
  const { user } = useSession()

  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 print:hidden items-center gap-2 border-b bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:gap-3 sm:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-4!" />
      <div className="min-w-0 flex-1">
        <HeaderBreadcrumbs />
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <HeaderSearch />
        <React.Suspense fallback={null}>
          <AcademicYearSelect />
        </React.Suspense>
        <ModeToggle />
        <NotificationsMenu />
        <Separator orientation="vertical" className="mx-1 hidden h-6! sm:block" />
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Account menu" className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <UserAvatar user={user} />
          </DropdownMenuTrigger>
          <UserMenuContent user={user} />
        </DropdownMenu>
      </div>
    </header>
  )
}
