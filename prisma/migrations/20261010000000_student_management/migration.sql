-- CreateEnum
CREATE TYPE "GroupingKind" AS ENUM ('GRADE', 'SEMESTER', 'YEAR', 'LEVEL', 'COHORT', 'OTHER');

-- CreateEnum
CREATE TYPE "AcademicYearStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NumberingMode" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'WITHDRAWN', 'TRANSFERRED', 'GRADUATED');

-- CreateEnum
CREATE TYPE "AdmissionType" AS ENUM ('NEW', 'TRANSFER', 'READMISSION', 'LATERAL_ENTRY');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('PERMANENT', 'TEMPORARY');

-- CreateEnum
CREATE TYPE "GuardianRelationship" AS ENUM ('FATHER', 'MOTHER', 'GRANDFATHER', 'GRANDMOTHER', 'BROTHER', 'SISTER', 'UNCLE', 'AUNT', 'SPOUSE', 'LEGAL_GUARDIAN', 'OTHER');

-- CreateEnum
CREATE TYPE "EnrollmentType" AS ENUM ('NEW_ADMISSION', 'PROMOTION', 'REPEAT', 'TRANSFER', 'READMISSION', 'LATERAL_ENTRY');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'PROMOTED', 'COMPLETED', 'DETAINED', 'TRANSFERRED', 'WITHDRAWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StudentHistoryAction" AS ENUM ('CREATED', 'STATUS_CHANGED', 'ARCHIVED', 'RESTORED');

-- CreateTable
CREATE TABLE "faculties" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faculties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "education_levels" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "preset_key" TEXT,
    "description" TEXT,
    "grouping_kind" "GroupingKind" NOT NULL DEFAULT 'GRADE',
    "uses_programs" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "education_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "education_level_id" UUID NOT NULL,
    "faculty_id" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "duration" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_classes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "education_level_id" UUID NOT NULL,
    "program_id" UUID,
    "name" TEXT NOT NULL,
    "kind" "GroupingKind" NOT NULL DEFAULT 'GRADE',
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "program_id" UUID,
    "name" TEXT NOT NULL,
    "start_year" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "AcademicYearStatus" NOT NULL DEFAULT 'PLANNED',
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_requirements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "education_level_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_settings" (
    "organization_id" UUID NOT NULL,
    "admission_number_mode" "NumberingMode" NOT NULL DEFAULT 'AUTOMATIC',
    "admission_number_prefix" TEXT NOT NULL DEFAULT 'ADM-',
    "admission_number_padding" INTEGER NOT NULL DEFAULT 5,
    "next_admission_sequence" INTEGER NOT NULL DEFAULT 1,
    "roll_number_mode" "NumberingMode" NOT NULL DEFAULT 'AUTOMATIC',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_settings_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "admission_number" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "last_name" TEXT NOT NULL,
    "date_of_birth" DATE,
    "gender" "Gender",
    "nationality" TEXT,
    "profile_image_path" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "alternate_phone" TEXT,
    "blood_group" TEXT,
    "mother_tongue" TEXT,
    "medical_notes" TEXT,
    "previous_school" TEXT,
    "admission_date" DATE NOT NULL,
    "admission_type" "AdmissionType" NOT NULL DEFAULT 'NEW',
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "user_id" UUID,
    "archived_at" TIMESTAMP(3),
    "archived_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_addresses" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "type" "AddressType" NOT NULL,
    "province" INTEGER,
    "district" TEXT,
    "municipality" TEXT,
    "ward_number" INTEGER,
    "tole" TEXT,
    "street" TEXT,
    "postal_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "alternate_phone" TEXT,
    "email" TEXT,
    "occupation" TEXT,
    "address" TEXT,
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_guardians" (
    "student_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "relationship" "GuardianRelationship" NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_emergency_contact" BOOLEAN NOT NULL DEFAULT false,
    "receives_academic_notifications" BOOLEAN NOT NULL DEFAULT true,
    "receives_billing_notifications" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_guardians_pkey" PRIMARY KEY ("student_id","guardian_id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "education_level_id" UUID NOT NULL,
    "program_id" UUID,
    "class_id" UUID NOT NULL,
    "section_id" UUID,
    "batch_id" UUID,
    "roll_number" TEXT,
    "enrollment_date" DATE NOT NULL,
    "enrollment_type" "EnrollmentType" NOT NULL DEFAULT 'NEW_ADMISSION',
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "ended_on" DATE,
    "status_reason" TEXT,
    "previous_enrollment_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "requirement_id" UUID,
    "title" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_status_history" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "action" "StudentHistoryAction" NOT NULL,
    "from_status" "StudentStatus",
    "to_status" "StudentStatus",
    "reason" TEXT,
    "changed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "faculties_organization_id_code_key" ON "faculties"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "faculties_id_organization_id_key" ON "faculties"("id", "organization_id");

-- CreateIndex
CREATE INDEX "education_levels_organization_id_sort_order_idx" ON "education_levels"("organization_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "education_levels_organization_id_code_key" ON "education_levels"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "education_levels_id_organization_id_key" ON "education_levels"("id", "organization_id");

-- CreateIndex
CREATE INDEX "programs_organization_id_education_level_id_idx" ON "programs"("organization_id", "education_level_id");

-- CreateIndex
CREATE UNIQUE INDEX "programs_organization_id_code_key" ON "programs"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "programs_id_organization_id_key" ON "programs"("id", "organization_id");

-- CreateIndex
CREATE INDEX "academic_classes_organization_id_education_level_id_program_idx" ON "academic_classes"("organization_id", "education_level_id", "program_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "academic_classes_id_organization_id_key" ON "academic_classes"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_classes_level_name_key" ON "academic_classes"("education_level_id", "name") WHERE (program_id IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "academic_classes_program_name_key" ON "academic_classes"("program_id", "name") WHERE (program_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "sections_class_id_name_key" ON "sections"("class_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sections_id_organization_id_key" ON "sections"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "sections_id_class_id_key" ON "sections"("id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "batches_organization_id_name_key" ON "batches"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "batches_id_organization_id_key" ON "batches"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_organization_id_name_key" ON "academic_years"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_id_organization_id_key" ON "academic_years"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_one_current_key" ON "academic_years"("organization_id") WHERE (is_current);

-- CreateIndex
CREATE UNIQUE INDEX "document_requirements_organization_id_name_key" ON "document_requirements"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "document_requirements_id_organization_id_key" ON "document_requirements"("id", "organization_id");

-- CreateIndex
CREATE INDEX "students_organization_id_status_archived_at_idx" ON "students"("organization_id", "status", "archived_at");

-- CreateIndex
CREATE INDEX "students_organization_id_last_name_first_name_idx" ON "students"("organization_id", "last_name", "first_name");

-- CreateIndex
CREATE INDEX "students_organization_id_admission_date_idx" ON "students"("organization_id", "admission_date");

-- CreateIndex
CREATE INDEX "students_organization_id_created_at_idx" ON "students"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "students_organization_id_admission_number_key" ON "students"("organization_id", "admission_number");

-- CreateIndex
CREATE UNIQUE INDEX "students_id_organization_id_key" ON "students"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_organization_id_user_id_key" ON "students"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "student_addresses_province_district_idx" ON "student_addresses"("province", "district");

-- CreateIndex
CREATE UNIQUE INDEX "student_addresses_student_id_type_key" ON "student_addresses"("student_id", "type");

-- CreateIndex
CREATE INDEX "guardians_organization_id_phone_idx" ON "guardians"("organization_id", "phone");

-- CreateIndex
CREATE INDEX "guardians_organization_id_full_name_idx" ON "guardians"("organization_id", "full_name");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_id_organization_id_key" ON "guardians"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_organization_id_user_id_key" ON "guardians"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "student_guardians_guardian_id_idx" ON "student_guardians"("guardian_id");

-- CreateIndex
CREATE INDEX "student_guardians_organization_id_idx" ON "student_guardians"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_guardians_one_primary_key" ON "student_guardians"("student_id") WHERE (is_primary);

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_previous_enrollment_id_key" ON "enrollments"("previous_enrollment_id");

-- CreateIndex
CREATE INDEX "enrollments_organization_id_academic_year_id_status_idx" ON "enrollments"("organization_id", "academic_year_id", "status");

-- CreateIndex
CREATE INDEX "enrollments_organization_id_education_level_id_idx" ON "enrollments"("organization_id", "education_level_id");

-- CreateIndex
CREATE INDEX "enrollments_organization_id_program_id_idx" ON "enrollments"("organization_id", "program_id");

-- CreateIndex
CREATE INDEX "enrollments_organization_id_class_id_section_id_idx" ON "enrollments"("organization_id", "class_id", "section_id");

-- CreateIndex
CREATE INDEX "enrollments_student_id_enrollment_date_idx" ON "enrollments"("student_id", "enrollment_date");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_one_active_per_year_key" ON "enrollments"("student_id", "academic_year_id") WHERE (status = 'ACTIVE');

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_roll_number_key" ON "enrollments"("academic_year_id", "class_id", "section_id", "roll_number") WHERE (status = 'ACTIVE' AND roll_number IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_roll_number_no_section_key" ON "enrollments"("academic_year_id", "class_id", "roll_number") WHERE (status = 'ACTIVE' AND roll_number IS NOT NULL AND section_id IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "student_documents_storage_path_key" ON "student_documents"("storage_path");

-- CreateIndex
CREATE INDEX "student_documents_organization_id_student_id_idx" ON "student_documents"("organization_id", "student_id");

-- CreateIndex
CREATE INDEX "student_documents_requirement_id_idx" ON "student_documents"("requirement_id");

-- CreateIndex
CREATE INDEX "student_status_history_student_id_created_at_idx" ON "student_status_history"("student_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_entity_type_entity_id_idx" ON "audit_logs"("organization_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "faculties" ADD CONSTRAINT "faculties_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "education_levels" ADD CONSTRAINT "education_levels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_education_level_id_organization_id_fkey" FOREIGN KEY ("education_level_id", "organization_id") REFERENCES "education_levels"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_faculty_id_organization_id_fkey" FOREIGN KEY ("faculty_id", "organization_id") REFERENCES "faculties"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_classes" ADD CONSTRAINT "academic_classes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_classes" ADD CONSTRAINT "academic_classes_education_level_id_organization_id_fkey" FOREIGN KEY ("education_level_id", "organization_id") REFERENCES "education_levels"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_classes" ADD CONSTRAINT "academic_classes_program_id_organization_id_fkey" FOREIGN KEY ("program_id", "organization_id") REFERENCES "programs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_class_id_organization_id_fkey" FOREIGN KEY ("class_id", "organization_id") REFERENCES "academic_classes"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_program_id_organization_id_fkey" FOREIGN KEY ("program_id", "organization_id") REFERENCES "programs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_education_level_id_organization_id_fkey" FOREIGN KEY ("education_level_id", "organization_id") REFERENCES "education_levels"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_settings" ADD CONSTRAINT "student_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_addresses" ADD CONSTRAINT "student_addresses_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_id_organization_id_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "students"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_id_organization_id_fkey" FOREIGN KEY ("guardian_id", "organization_id") REFERENCES "guardians"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_organization_id_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "students"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_academic_year_id_organization_id_fkey" FOREIGN KEY ("academic_year_id", "organization_id") REFERENCES "academic_years"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_education_level_id_organization_id_fkey" FOREIGN KEY ("education_level_id", "organization_id") REFERENCES "education_levels"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_program_id_organization_id_fkey" FOREIGN KEY ("program_id", "organization_id") REFERENCES "programs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_id_organization_id_fkey" FOREIGN KEY ("class_id", "organization_id") REFERENCES "academic_classes"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_section_id_class_id_fkey" FOREIGN KEY ("section_id", "class_id") REFERENCES "sections"("id", "class_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_batch_id_organization_id_fkey" FOREIGN KEY ("batch_id", "organization_id") REFERENCES "batches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_previous_enrollment_id_fkey" FOREIGN KEY ("previous_enrollment_id") REFERENCES "enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_student_id_organization_id_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "students"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "document_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_status_history" ADD CONSTRAINT "student_status_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_status_history" ADD CONSTRAINT "student_status_history_student_id_organization_id_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "students"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Data: register the new permission keys and grant them to the existing
-- system Owner and Admin roles, so current organisations can use the module
-- immediately. Additive only (ON CONFLICT DO NOTHING); no rows are removed.
INSERT INTO "permissions" ("id", "key", "description", "created_at") VALUES
  (gen_random_uuid(), 'students.archive', 'Archive and restore students', now()),
  (gen_random_uuid(), 'students.enroll', 'Enroll, promote and transfer students', now()),
  (gen_random_uuid(), 'students.import', 'Import students from a file', now()),
  (gen_random_uuid(), 'students.export', 'Export student lists', now()),
  (gen_random_uuid(), 'students.sensitive.view', 'View students'' medical notes and other restricted details', now()),
  (gen_random_uuid(), 'students.documents.view', 'View and download student documents', now()),
  (gen_random_uuid(), 'students.documents.manage', 'Upload and delete student documents', now()),
  (gen_random_uuid(), 'academics.manage', 'Configure education levels, programs, classes, sections and academic years', now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", now()
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."is_system" = true
  AND r."slug" IN ('owner', 'admin')
  AND p."key" IN (
    'students.view', 'students.create', 'students.update', 'students.delete',
    'students.archive', 'students.enroll', 'students.import', 'students.export',
    'students.sensitive.view', 'students.documents.view', 'students.documents.manage',
    'academics.view', 'academics.manage'
  )
ON CONFLICT DO NOTHING;
