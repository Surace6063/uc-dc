"use client"

import { GENDER_LABELS } from "@/features/students/constants"
import { LocalTable } from "@/features/teaching/components/local-table"
import type { ClassRoster } from "@/services/teaching/class-service"

type Row = ClassRoster["students"][number]

const fullName = (s: Row["student"]) => [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ")

export function RosterTable({ students }: { students: Row[] }) {
  return (
    <LocalTable
      rows={students}
      getRowId={(r) => r.id}
      searchText={(r) => `${fullName(r.student)} ${r.student.admissionNumber} ${r.rollNumber ?? ""}`}
      searchPlaceholder="Search name, roll or admission no."
      initialSort={{ id: "roll" }}
      empty="No students are enrolled in this class for the year."
      columns={[
        { id: "roll", header: "Roll", sortValue: (r) => r.rollNumber, cell: (r) => <span className="tabular-nums">{r.rollNumber ?? "—"}</span>, className: "w-20" },
        {
          id: "name",
          header: "Student",
          sortValue: (r) => fullName(r.student),
          cell: (r) => (
            <span className="block min-w-44">
              <span className="font-medium">{fullName(r.student)}</span>
              <span className="block font-mono text-xs text-muted-foreground">{r.student.admissionNumber}</span>
            </span>
          ),
        },
        { id: "section", header: "Section", sortValue: (r) => r.section?.name ?? null, cell: (r) => r.section?.name ?? "—" },
        { id: "gender", header: "Gender", sortValue: (r) => r.student.gender, cell: (r) => (r.student.gender ? GENDER_LABELS[r.student.gender] : "—") },
        { id: "contact", header: "Contact", cell: (r) => <span className="text-sm text-muted-foreground">{[r.student.phone, r.student.email].filter(Boolean).join(" · ") || "—"}</span> },
        { id: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => (r.status === "ON_HOLD" ? "On hold" : "Active") },
      ]}
    />
  )
}
