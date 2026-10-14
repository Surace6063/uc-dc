-- CreateEnum
CREATE TYPE "LessonPlanStatus" AS ENUM ('DRAFT', 'PLANNED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "MaterialKind" AS ENUM ('FILE', 'LINK');

-- CreateEnum
CREATE TYPE "ClassAssignmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('SUBMITTED', 'REVIEWED', 'RETURNED');

-- CreateEnum
CREATE TYPE "NoticeAudience" AS ENUM ('EVERYONE', 'STAFF', 'STUDENTS', 'PARENTS', 'CLASS');

-- CreateTable
CREATE TABLE "timetable_slots" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "section_id" UUID,
    "subject_id" UUID,
    "teacher_id" UUID,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "room" TEXT,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_plans" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "section_id" UUID,
    "subject_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "topic" TEXT,
    "planned_date" DATE NOT NULL,
    "periods" INTEGER NOT NULL DEFAULT 1,
    "objectives" TEXT,
    "activities" TEXT,
    "resources" TEXT,
    "assessment" TEXT,
    "status" "LessonPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "reflection" TEXT,
    "delivered_on" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teaching_materials" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "section_id" UUID,
    "subject_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "MaterialKind" NOT NULL,
    "url" TEXT,
    "storage_path" TEXT,
    "file_name" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "shared_with_students" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teaching_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "section_id" UUID,
    "subject_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "due_at" TIMESTAMP(3) NOT NULL,
    "max_marks" DECIMAL(6,2),
    "status" "ClassAssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_submissions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT,
    "storage_path" TEXT,
    "file_name" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "recorded_by_id" UUID,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "marks" DECIMAL(6,2),
    "feedback" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "NoticeAudience" NOT NULL,
    "class_id" UUID,
    "section_id" UUID,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "author_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timetable_slots_organization_id_academic_year_id_day_of_wee_idx" ON "timetable_slots"("organization_id", "academic_year_id", "day_of_week");

-- CreateIndex
CREATE INDEX "timetable_slots_teacher_id_day_of_week_idx" ON "timetable_slots"("teacher_id", "day_of_week");

-- CreateIndex
CREATE INDEX "timetable_slots_class_id_section_id_idx" ON "timetable_slots"("class_id", "section_id");

-- CreateIndex
CREATE INDEX "lesson_plans_organization_id_teacher_id_planned_date_idx" ON "lesson_plans"("organization_id", "teacher_id", "planned_date");

-- CreateIndex
CREATE INDEX "lesson_plans_organization_id_class_id_subject_id_idx" ON "lesson_plans"("organization_id", "class_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "teaching_materials_storage_path_key" ON "teaching_materials"("storage_path");

-- CreateIndex
CREATE INDEX "teaching_materials_organization_id_teacher_id_created_at_idx" ON "teaching_materials"("organization_id", "teacher_id", "created_at");

-- CreateIndex
CREATE INDEX "teaching_materials_organization_id_class_id_subject_id_idx" ON "teaching_materials"("organization_id", "class_id", "subject_id");

-- CreateIndex
CREATE INDEX "class_assignments_organization_id_teacher_id_due_at_idx" ON "class_assignments"("organization_id", "teacher_id", "due_at");

-- CreateIndex
CREATE INDEX "class_assignments_organization_id_class_id_status_idx" ON "class_assignments"("organization_id", "class_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "class_assignments_id_organization_id_key" ON "class_assignments"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_submissions_storage_path_key" ON "assignment_submissions"("storage_path");

-- CreateIndex
CREATE INDEX "assignment_submissions_organization_id_status_idx" ON "assignment_submissions"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_submissions_assignment_id_student_id_key" ON "assignment_submissions"("assignment_id", "student_id");

-- CreateIndex
CREATE INDEX "notices_organization_id_published_at_idx" ON "notices"("organization_id", "published_at");

-- CreateIndex
CREATE INDEX "notices_organization_id_audience_idx" ON "notices"("organization_id", "audience");

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_academic_year_id_organization_id_fkey" FOREIGN KEY ("academic_year_id", "organization_id") REFERENCES "academic_years"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_class_id_organization_id_fkey" FOREIGN KEY ("class_id", "organization_id") REFERENCES "academic_classes"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_section_id_class_id_fkey" FOREIGN KEY ("section_id", "class_id") REFERENCES "sections"("id", "class_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_subject_id_organization_id_fkey" FOREIGN KEY ("subject_id", "organization_id") REFERENCES "subjects"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_teacher_id_organization_id_fkey" FOREIGN KEY ("teacher_id", "organization_id") REFERENCES "teachers"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_teacher_id_organization_id_fkey" FOREIGN KEY ("teacher_id", "organization_id") REFERENCES "teachers"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_academic_year_id_organization_id_fkey" FOREIGN KEY ("academic_year_id", "organization_id") REFERENCES "academic_years"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_class_id_organization_id_fkey" FOREIGN KEY ("class_id", "organization_id") REFERENCES "academic_classes"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_section_id_class_id_fkey" FOREIGN KEY ("section_id", "class_id") REFERENCES "sections"("id", "class_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_subject_id_organization_id_fkey" FOREIGN KEY ("subject_id", "organization_id") REFERENCES "subjects"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_materials" ADD CONSTRAINT "teaching_materials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_materials" ADD CONSTRAINT "teaching_materials_teacher_id_organization_id_fkey" FOREIGN KEY ("teacher_id", "organization_id") REFERENCES "teachers"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_materials" ADD CONSTRAINT "teaching_materials_academic_year_id_organization_id_fkey" FOREIGN KEY ("academic_year_id", "organization_id") REFERENCES "academic_years"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_materials" ADD CONSTRAINT "teaching_materials_class_id_organization_id_fkey" FOREIGN KEY ("class_id", "organization_id") REFERENCES "academic_classes"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_materials" ADD CONSTRAINT "teaching_materials_section_id_class_id_fkey" FOREIGN KEY ("section_id", "class_id") REFERENCES "sections"("id", "class_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_materials" ADD CONSTRAINT "teaching_materials_subject_id_organization_id_fkey" FOREIGN KEY ("subject_id", "organization_id") REFERENCES "subjects"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_teacher_id_organization_id_fkey" FOREIGN KEY ("teacher_id", "organization_id") REFERENCES "teachers"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_academic_year_id_organization_id_fkey" FOREIGN KEY ("academic_year_id", "organization_id") REFERENCES "academic_years"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_class_id_organization_id_fkey" FOREIGN KEY ("class_id", "organization_id") REFERENCES "academic_classes"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_section_id_class_id_fkey" FOREIGN KEY ("section_id", "class_id") REFERENCES "sections"("id", "class_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_subject_id_organization_id_fkey" FOREIGN KEY ("subject_id", "organization_id") REFERENCES "subjects"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_assignment_id_organization_id_fkey" FOREIGN KEY ("assignment_id", "organization_id") REFERENCES "class_assignments"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_student_id_organization_id_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "students"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_class_id_organization_id_fkey" FOREIGN KEY ("class_id", "organization_id") REFERENCES "academic_classes"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_section_id_class_id_fkey" FOREIGN KEY ("section_id", "class_id") REFERENCES "sections"("id", "class_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Rules the application also enforces, kept in the database too.
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_day_of_week_check" CHECK ("day_of_week" BETWEEN 0 AND 6);
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_times_check" CHECK ("start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "start_time" < "end_time");
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_periods_check" CHECK ("periods" BETWEEN 1 AND 20);
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_max_marks_check" CHECK ("max_marks" IS NULL OR "max_marks" > 0);
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_marks_check" CHECK ("marks" IS NULL OR "marks" >= 0);
ALTER TABLE "teaching_materials" ADD CONSTRAINT "teaching_materials_kind_check" CHECK (("kind" = 'LINK' AND "url" IS NOT NULL) OR ("kind" = 'FILE' AND "storage_path" IS NOT NULL));
ALTER TABLE "notices" ADD CONSTRAINT "notices_class_audience_check" CHECK (("audience" = 'CLASS') = ("class_id" IS NOT NULL));

-- New permission: post notices to the whole organisation. Granted to the
-- default owner, admin and principal roles of existing organisations (new
-- organisations get it from the code's default roles).
INSERT INTO "permissions" ("id", "key", "description", "created_at")
VALUES (gen_random_uuid(), 'notices.manage', 'Post and manage notices for the whole organisation', now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", now()
FROM "roles" r
CROSS JOIN "permissions" p
WHERE p."key" = 'notices.manage' AND r."slug" IN ('owner', 'admin', 'principal')
ON CONFLICT DO NOTHING;
