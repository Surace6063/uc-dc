import type { Metadata } from "next"
import Image from "next/image"
import {
  BookOpenCheckIcon,
  CalendarCheckIcon,
  GraduationCapIcon,
  MegaphoneIcon,
} from "lucide-react"

import { LoginForm } from "@/components/login-form"

export const metadata: Metadata = {
  title: "Sign in · United College",
  description: "Sign in to the United College portal.",
}

const features = [
  {
    icon: BookOpenCheckIcon,
    title: "Academic records",
    description: "Results, assessments and progress in one place.",
  },
  {
    icon: CalendarCheckIcon,
    title: "Attendance & routines",
    description: "Daily attendance and class schedules at a glance.",
  },
  {
    icon: MegaphoneIcon,
    title: "Notices",
    description: "Stay current with college announcements.",
  },
]

export default function LoginPage() {
  return (
    <main className="grid min-h-svh bg-background lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07] bg-[linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] bg-size-[44px_44px] mask-[radial-gradient(ellipse_at_top_left,black_30%,transparent_75%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -bottom-40 size-[520px] rounded-full bg-black/20 blur-3xl"
        />

        <div className="relative">
          <div className="inline-flex rounded-2xl bg-white px-5 py-3 shadow-lg shadow-black/10">
            <Image
              src="/uc-logo.png"
              alt="United College — Affiliated to Tribhuvan University"
              width={685}
              height={364}
              preload
              className="h-14 w-auto"
            />
          </div>
        </div>

        <div className="relative max-w-lg">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium tracking-wide text-white/90">
            <GraduationCapIcon className="size-3.5" />
            College Portal
          </span>
          <h1 className="mt-6 text-4xl leading-tight font-semibold tracking-tight xl:text-5xl">
            Your campus,
            <br />
            all in one place.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-white/85">
            Sign in to access your academic records, class routines and the
            latest notices from United College.
          </p>

          <ul className="mt-10 space-y-5">
            {features.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-white/80">{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/75">
          © {new Date().getFullYear()} United College. Affiliated to Tribhuvan
          University.
        </p>
      </section>

      {/* Form panel */}
      <section className="flex flex-col px-6 py-10 sm:px-10">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <Image
              src="/uc-logo.png"
              alt="United College — Affiliated to Tribhuvan University"
              width={685}
              height={364}
              preload
              className="mb-10 h-14 w-auto lg:hidden"
            />
            <LoginForm />
          </div>
        </div>
        <p className="mt-10 text-center text-xs text-muted-foreground lg:hidden">
          © {new Date().getFullYear()} United College
        </p>
      </section>
    </main>
  )
}
