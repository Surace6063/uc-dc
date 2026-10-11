"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { runAction } from "@/lib/authorization/action"
import { requirePermission } from "@/lib/authorization/context"
import * as structure from "@/services/academics/structure-service"

// Education structure mutations. Every action re-checks academics.manage on
// the server; the organisation always comes from the session.

const id = z.uuid()
const optionalRecordId = z.uuid().nullable()

export type StructureEntity =
  | "level"
  | "program"
  | "class"
  | "section"
  | "year"
  | "faculty"
  | "batch"
  | "requirement"
  | "designation"

const savers = {
  level: structure.saveEducationLevel,
  program: structure.saveProgram,
  class: structure.saveAcademicClass,
  section: structure.saveSection,
  year: structure.saveAcademicYear,
  faculty: structure.saveFaculty,
  batch: structure.saveBatch,
  requirement: structure.saveDocumentRequirement,
  designation: structure.saveDesignation,
} as const

const deleters = {
  level: structure.deleteEducationLevel,
  program: structure.deleteProgram,
  class: structure.deleteAcademicClass,
  section: structure.deleteSection,
  year: structure.deleteAcademicYear,
  faculty: structure.deleteFaculty,
  batch: structure.deleteBatch,
  requirement: structure.deleteDocumentRequirement,
  designation: structure.deleteDesignation,
} as const

const entitySchema = z.enum(Object.keys(savers) as [StructureEntity, ...StructureEntity[]])

function refresh() {
  revalidatePath("/dashboard/academics")
  revalidatePath("/dashboard/classes", "layout")
  revalidatePath("/dashboard/students", "layout")
  revalidatePath("/dashboard/teachers", "layout")
}

export async function saveStructureRecord(entity: StructureEntity, recordId: string | null, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("academics.manage")
    const save = savers[entitySchema.parse(entity)]
    const record = await save(ctx, optionalRecordId.parse(recordId), values)
    refresh()
    return { id: record && "id" in record ? (record.id as string) : null }
  }, "Saved.")
}

export async function deleteStructureRecord(entity: StructureEntity, recordId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("academics.manage")
    await deleters[entitySchema.parse(entity)](ctx, id.parse(recordId))
    refresh()
  }, "Deleted.")
}

export async function applyPresetAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("academics.manage")
    await structure.applyEducationPreset(ctx, values)
    refresh()
  }, "Education level added.")
}

export async function generateClassesAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("academics.manage")
    const result = await structure.generateClasses(ctx, values)
    refresh()
    return result
  })
}

export async function setCurrentYearAction(yearId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("academics.manage")
    await structure.setCurrentAcademicYear(ctx, id.parse(yearId))
    revalidatePath("/dashboard", "layout")
  }, "Current academic year updated.")
}

export async function saveStudentSettingsAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("academics.manage")
    await structure.saveStudentSettings(ctx, values)
    refresh()
  }, "Settings saved.")
}

export async function saveStaffSettingsAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("academics.manage")
    await structure.saveStaffSettings(ctx, values)
    refresh()
  }, "Settings saved.")
}
