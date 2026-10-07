"use client"

import * as React from "react"
import { BellIcon, CalendarRangeIcon, SearchIcon } from "lucide-react"

import { ModeToggle } from "@/components/mode-toggle"
import { academicYear, currentUser } from "@/components/nav-data"
import { UserAvatar, UserMenuContent } from "@/components/nav-user"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

function HeaderSearch() {
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Ctrl/⌘ + K focuses the search box.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // TODO: wire up search.
  }

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className="relative w-full max-w-md"
    >
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="search"
        name="q"
        aria-label="Search"
        placeholder="Search everything…"
        className="h-9 bg-muted/50 pr-14 pl-9 [&::-webkit-search-cancel-button]:hidden"
      />
      <Kbd className="absolute top-1/2 right-2 hidden -translate-y-1/2 border bg-background sm:inline-flex">
        Ctrl K
      </Kbd>
    </form>
  )
}

export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-4!" />
      <HeaderSearch />

      <div className="ml-auto flex items-center gap-1">
        <div className="mr-2 hidden items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-sm whitespace-nowrap xl:flex">
          <CalendarRangeIcon className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Academic year</span>
          <span className="font-semibold tabular-nums">
            {academicYear.ad}
            <span className="ml-1 font-normal text-muted-foreground">
              ({academicYear.bs} BS)
            </span>
          </span>
        </div>

        <ModeToggle />

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Notifications"
          className="relative"
        >
          <BellIcon />
          <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-background" />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-6!" />

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Account menu"
            className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <UserAvatar user={currentUser} />
          </DropdownMenuTrigger>
          <UserMenuContent user={currentUser} />
        </DropdownMenu>
      </div>
    </header>
  )
}
