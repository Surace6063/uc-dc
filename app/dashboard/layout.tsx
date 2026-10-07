import { cookies } from "next/headers"

import { AppSidebar } from "@/components/app-sidebar"
import { DashboardHeader } from "@/components/dashboard-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <Toaster>
      <TooltipProvider>
        <SidebarProvider defaultOpen={defaultOpen}>
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <DashboardHeader />
            <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-6">
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </Toaster>
  )
}
