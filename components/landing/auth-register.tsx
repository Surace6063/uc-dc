"use client"

import { CheckIcon } from "lucide-react"
import { motion } from "motion/react"

import { ease } from "@/components/landing/motion"

// "Today's register" card on the sign-in pages: every kind of user is
// marked present, one tick at a time.
const roles = [
  { role: "Administrators", note: "run the institution" },
  { role: "Teachers", note: "classes, marks, lessons" },
  { role: "Students", note: "courses and homework" },
  { role: "Parents", note: "progress and fees" },
  { role: "Staff", note: "office and accounts" },
]

export function AuthRegister() {
  return (
    <motion.div
      aria-hidden
      className="mt-10 max-w-sm rounded-xl border bg-card p-4 shadow-xl shadow-black/5"
      initial={{ opacity: 0, y: 30, rotate: -6 }}
      animate={{ opacity: 1, y: 0, rotate: -2 }}
      transition={{ type: "spring", stiffness: 90, damping: 14, delay: 0.3 }}
    >
      <div className="flex items-baseline justify-between border-b border-dashed pb-2">
        <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
          Today&apos;s register
        </p>
        <p className="font-hand text-lg text-primary">all present</p>
      </div>
      <ul className="mt-2 space-y-1.5">
        {roles.map((item, i) => (
          <motion.li
            key={item.role}
            className="flex items-center justify-between gap-4 text-sm"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease, delay: 0.6 + i * 0.12 }}
          >
            <span>
              <span className="font-medium">{item.role}</span>{" "}
              <span className="text-muted-foreground">· {item.note}</span>
            </span>
            <motion.span
              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              initial={{ scale: 0, rotate: -40 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 15, delay: 1.1 + i * 0.18 }}
            >
              <CheckIcon className="size-3" />
            </motion.span>
          </motion.li>
        ))}
      </ul>
    </motion.div>
  )
}
