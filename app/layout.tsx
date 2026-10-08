import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { displayFont, handFont } from "@/components/landing/fonts"
import { site } from "@/components/landing/site"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

// Pages set a short title ("Sign in"); the product name is appended here.
export const metadata: Metadata = {
  title: { template: `%s · ${site.name}`, default: site.name },
  description: site.tagline,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        geist.variable,
        // Brand fonts (serif headlines, handwritten notes) used across the site.
        displayFont.variable,
        handFont.variable
      )}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
