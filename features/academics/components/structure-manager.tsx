"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ClassesTab } from "@/features/academics/components/classes-sections"
import { LevelsTab, ProgramsTab } from "@/features/academics/components/levels-programs"
import {
  BatchesTab,
  DocumentsTab,
  FacultiesTab,
  NumberingTab,
  YearsTab,
} from "@/features/academics/components/other-tabs"
import Link from "next/link"

import { DesignationsTab, EmployeeIdSettings } from "@/features/academics/components/staff-tabs"
import type { EducationStructure } from "@/services/academics/structure-service"

const TABS = [
  { value: "levels", label: "Levels" },
  { value: "programs", label: "Programs" },
  { value: "classes", label: "Classes & sections" },
  { value: "years", label: "Academic years" },
  { value: "faculties", label: "Faculties" },
  { value: "batches", label: "Batches" },
  { value: "subjects", label: "Subjects" },
  { value: "designations", label: "Designations" },
  { value: "documents", label: "Documents" },
  { value: "numbering", label: "Numbering" },
] as const

export function EducationStructureManager({
  structure,
  canManage,
}: {
  structure: EducationStructure
  canManage: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const requested = searchParams.get("tab")
  const tab = TABS.some((t) => t.value === requested) ? requested! : "levels"

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => router.replace(`${pathname}?tab=${value}`, { scroll: false })}
      className="gap-5"
    >
      <div className="overflow-x-auto">
        <TabsList variant="line">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value="levels">
        <LevelsTab structure={structure} canManage={canManage} />
      </TabsContent>
      <TabsContent value="programs">
        <ProgramsTab structure={structure} canManage={canManage} />
      </TabsContent>
      <TabsContent value="classes">
        <ClassesTab structure={structure} canManage={canManage} />
      </TabsContent>
      <TabsContent value="years">
        <YearsTab structure={structure} canManage={canManage} />
      </TabsContent>
      <TabsContent value="faculties">
        <FacultiesTab structure={structure} canManage={canManage} />
      </TabsContent>
      <TabsContent value="batches">
        <BatchesTab structure={structure} canManage={canManage} />
      </TabsContent>
      <TabsContent value="subjects">
        <div className="rounded-xl border border-dashed p-6 text-sm">
          <p className="font-medium">Subjects and courses have their own module</p>
          <p className="mt-1 text-muted-foreground">
            Subjects, categories, curricula and which subjects each class studies are managed under{" "}
            <Link href="/dashboard/subjects" className="underline underline-offset-2">
              Subjects &amp; Courses
            </Link>
            .
          </p>
        </div>
      </TabsContent>
      <TabsContent value="designations">
        <DesignationsTab structure={structure} canManage={canManage} />
      </TabsContent>
      <TabsContent value="documents">
        <DocumentsTab structure={structure} canManage={canManage} />
      </TabsContent>
      <TabsContent value="numbering" className="flex flex-col gap-6">
        <NumberingTab structure={structure} canManage={canManage} />
        <EmployeeIdSettings structure={structure} canManage={canManage} />
      </TabsContent>
    </Tabs>
  )
}
