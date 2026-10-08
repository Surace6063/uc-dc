import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"

import { AuthRegister } from "@/components/landing/auth-register"
import { Logo } from "@/components/landing/logo"
import { MotionProvider, Reveal, Scribble } from "@/components/landing/motion"
import { site } from "@/components/landing/site"

// Shared two-column shell for sign-in, registration and password pages,
// styled like the landing page: an exercise-book page beside the form.
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <MotionProvider>
      <main className="grid min-h-svh bg-background lg:grid-cols-[1.1fr_1fr]">
        {/* Notebook panel */}
        <section className="relative isolate hidden overflow-hidden border-r bg-paper lg:flex lg:flex-col lg:justify-between lg:py-10 lg:pr-12 lg:pl-24 xl:pr-16 xl:pl-28">
          <div aria-hidden className="absolute inset-0 -z-10 bg-ruled" />
          <div
            aria-hidden
            className="absolute inset-y-0 left-14 -z-10 w-[5px] border-x border-margin"
          />
          <div aria-hidden className="absolute inset-y-0 left-4 -z-10 flex flex-col justify-around">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-4 rounded-full bg-foreground/10 shadow-[inset_0_2px_3px_rgb(0_0_0/0.2)]"
              />
            ))}
          </div>

          <Logo />

          <div className="max-w-md">
            <Reveal y={12}>
              <p className="-rotate-2 font-hand text-3xl text-primary">
                one sign-in for everyone
              </p>
              <h2 className="mt-3 font-display text-5xl leading-[1.02] tracking-tight xl:text-6xl">
                Your whole campus,{" "}
                <span className="relative inline-block">
                  <em className="text-primary">one</em>
                  <Scribble
                    variant="circle"
                    animateOnMount
                    delay={0.8}
                    className="-inset-x-4 -inset-y-1 text-primary"
                  />
                </span>{" "}
                login away.
              </h2>
              <p className="mt-5 text-base leading-relaxed text-muted-foreground">
                Administrators, teachers, students, parents and staff all sign
                in here. {site.name} opens the right school or college and the
                right tools for each of them.
              </p>
            </Reveal>

            <AuthRegister />
          </div>

          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {site.name} · Made in {site.location}
          </p>
        </section>

        {/* Form panel */}
        <section className="flex flex-col px-6 py-8 sm:px-10">
          <div className="flex items-center justify-between">
            <div className="lg:invisible">
              <Logo />
            </div>
            <Link
              href="/"
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeftIcon className="size-4" />
              Back to site
            </Link>
          </div>

          <div className="flex flex-1 items-center justify-center py-10">
            <div className="w-full max-w-sm">{children}</div>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Need help signing in?{" "}
            <a href={`mailto:${site.email}`} className="font-medium text-foreground hover:underline">
              {site.email}
            </a>
          </p>
        </section>
      </main>
    </MotionProvider>
  )
}
