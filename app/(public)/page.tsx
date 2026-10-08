import type { Metadata } from "next"

import { ActivityTicker } from "@/components/landing/activity-ticker"
import { Chalkboard } from "@/components/landing/chalkboard"
import { Faq } from "@/components/landing/faq"
import { Hero } from "@/components/landing/hero"
import { IdCards } from "@/components/landing/id-cards"
import { MotionProvider } from "@/components/landing/motion"
import { Onboarding } from "@/components/landing/onboarding"
import { Pricing } from "@/components/landing/pricing"
import { Routine } from "@/components/landing/routine"
import { SchoolDay } from "@/components/landing/school-day"
import { site } from "@/components/landing/site"
import { SiteFooter } from "@/components/landing/site-footer"
import { SiteHeader } from "@/components/landing/site-header"

export const metadata: Metadata = {
  title: { absolute: `${site.name}: ${site.tagline}` },
  description:
    "All-in-one SaaS for schools and colleges: admissions, attendance, exams, fees and staff management, plus a built-in LMS for courses, assignments, quizzes and live classes.",
}

export default function HomePage() {
  return (
    <MotionProvider>
      <div className="flex min-h-svh flex-col bg-paper selection:bg-highlight">
        <SiteHeader />
        <main className="flex-1 overflow-x-clip">
          <Hero />
          <ActivityTicker />
          <SchoolDay />
          <Routine />
          <IdCards />
          <Onboarding />
          <Pricing />
          <Faq />
          <Chalkboard />
        </main>
        <SiteFooter />
      </div>
    </MotionProvider>
  )
}
