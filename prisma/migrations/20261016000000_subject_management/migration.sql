-- Subject & course management: categories, richer subjects, prerequisites,
-- versioned curricula, year-specific offerings, section limits and elective groups.

-- CreateEnum
CREATE TYPE "SubjectRequirement" AS ENUM ('COMPULSORY', 'ELECTIVE', 'OPTIONAL', 'ADDITIONAL');

-- CreateEnum
CREATE TYPE "CurriculumStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "CurriculumComponent" AS ENUM ('THEORY', 'PRACTICAL', 'PROJECT', 'MIXED');

-- CreateEnum
CREATE TYPE "OfferingStatus" AS ENUM ('ACTIVE', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "PrerequisiteKind" AS ENUM ('REQUIRED', 'RECOMMENDED');

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "category_id" UUID,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "local_name" TEXT,
ADD COLUMN     "medium" "InstructionMedium",
ADD COLUMN     "practical_hours" INTEGER,
ADD COLUMN     "requirement" "SubjectRequirement" NOT NULL DEFAULT 'COMPULSORY',
ADD COLUMN     "theory_hours" INTEGER,
ADD COLUMN     "weekly_periods" INTEGER,
ALTER COLUMN "credit_hours" SET DATA TYPE DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "subject_categories" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subject_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_prerequisites" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "prerequisite_id" UUID NOT NULL,
    "kind" "PrerequisiteKind" NOT NULL DEFAULT 'REQUIRED',
    "minimum_grade" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subject_prerequisites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curricula" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "education_level_id" UUID,
    "program_id" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "status" "CurriculumStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_from" DATE,
    "effective_to" DATE,
    "previous_version_id" UUID,
    "document_path" TEXT,
    "document_name" TEXT,
    "document_type" TEXT,
    "document_size" INTEGER,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curricula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_units" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "curriculum_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "component" "CurriculumComponent" NOT NULL DEFAULT 'THEORY',
    "estimated_hours" INTEGER,
    "learning_objectives" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_topics" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "estimated_hours" INTEGER,
    "learning_objectives" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elective_groups" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "min_choices" INTEGER NOT NULL DEFAULT 1,
    "max_choices" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "batchId" UUID,

    CONSTRAINT "elective_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_offerings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "curriculum_id" UUID,
    "elective_group_id" UUID,
    "requirement" "SubjectRequirement" NOT NULL DEFAULT 'COMPULSORY',
    "credit_hours" DOUBLE PRECISION,
    "weekly_periods" INTEGER,
    "code" TEXT,
    "status" "OfferingStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "batchId" UUID,

    CONSTRAINT "subject_offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_offering_sections" (
    "offering_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subject_offering_sections_pkey" PRIMARY KEY ("offering_id","section_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subject_categories_organization_id_name_key" ON "subject_categories"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "subject_categories_id_organization_id_key" ON "subject_categories"("id", "organization_id");

-- CreateIndex
CREATE INDEX "subject_prerequisites_organization_id_prerequisite_id_idx" ON "subject_prerequisites"("organization_id", "prerequisite_id");

-- CreateIndex
CREATE UNIQUE INDEX "subject_prerequisites_subject_id_prerequisite_id_key" ON "subject_prerequisites"("subject_id", "prerequisite_id");

-- CreateIndex
CREATE INDEX "curricula_organization_id_subject_id_status_idx" ON "curricula"("organization_id", "subject_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "curricula_subject_id_name_version_key" ON "curricula"("subject_id", "name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "curricula_id_organization_id_key" ON "curricula"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "curricula_id_subject_id_key" ON "curricula"("id", "subject_id");

-- CreateIndex
CREATE INDEX "curriculum_units_curriculum_id_sequence_idx" ON "curriculum_units"("curriculum_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_units_id_organization_id_key" ON "curriculum_units"("id", "organization_id");

-- CreateIndex
CREATE INDEX "curriculum_topics_unit_id_sequence_idx" ON "curriculum_topics"("unit_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "elective_groups_academic_year_id_class_id_name_key" ON "elective_groups"("academic_year_id", "class_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "elective_groups_id_organization_id_key" ON "elective_groups"("id", "organization_id");

-- CreateIndex
CREATE INDEX "subject_offerings_organization_id_subject_id_idx" ON "subject_offerings"("organization_id", "subject_id");

-- CreateIndex
CREATE INDEX "subject_offerings_organization_id_academic_year_id_class_id_idx" ON "subject_offerings"("organization_id", "academic_year_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "subject_offerings_academic_year_id_class_id_subject_id_key" ON "subject_offerings"("academic_year_id", "class_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "subject_offerings_id_organization_id_key" ON "subject_offerings"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "subject_offerings_id_class_id_key" ON "subject_offerings"("id", "class_id");

-- CreateIndex
CREATE INDEX "subject_offering_sections_section_id_idx" ON "subject_offering_sections"("section_id");

-- CreateIndex
CREATE INDEX "subjects_organization_id_archived_at_name_idx" ON "subjects"("organization_id", "archived_at", "name");

-- AddForeignKey
ALTER TABLE "subject_categories" ADD CONSTRAINT "subject_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_category_id_organization_id_fkey" FOREIGN KEY ("category_id", "organization_id") REFERENCES "subject_categories"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_prerequisites" ADD CONSTRAINT "subject_prerequisites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_prerequisites" ADD CONSTRAINT "subject_prerequisites_subject_id_organization_id_fkey" FOREIGN KEY ("subject_id", "organization_id") REFERENCES "subjects"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_prerequisites" ADD CONSTRAINT "subject_prerequisites_prerequisite_id_organization_id_fkey" FOREIGN KEY ("prerequisite_id", "organization_id") REFERENCES "subjects"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_subject_id_organization_id_fkey" FOREIGN KEY ("subject_id", "organization_id") REFERENCES "subjects"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_education_level_id_organization_id_fkey" FOREIGN KEY ("education_level_id", "organization_id") REFERENCES "education_levels"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_program_id_organization_id_fkey" FOREIGN KEY ("program_id", "organization_id") REFERENCES "programs"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "curricula"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_units" ADD CONSTRAINT "curriculum_units_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_units" ADD CONSTRAINT "curriculum_units_curriculum_id_organization_id_fkey" FOREIGN KEY ("curriculum_id", "organization_id") REFERENCES "curricula"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_topics" ADD CONSTRAINT "curriculum_topics_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_topics" ADD CONSTRAINT "curriculum_topics_unit_id_organization_id_fkey" FOREIGN KEY ("unit_id", "organization_id") REFERENCES "curriculum_units"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_groups" ADD CONSTRAINT "elective_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_groups" ADD CONSTRAINT "elective_groups_academic_year_id_organization_id_fkey" FOREIGN KEY ("academic_year_id", "organization_id") REFERENCES "academic_years"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_groups" ADD CONSTRAINT "elective_groups_class_id_organization_id_fkey" FOREIGN KEY ("class_id", "organization_id") REFERENCES "academic_classes"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_groups" ADD CONSTRAINT "elective_groups_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_offerings" ADD CONSTRAINT "subject_offerings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_offerings" ADD CONSTRAINT "subject_offerings_subject_id_organization_id_fkey" FOREIGN KEY ("subject_id", "organization_id") REFERENCES "subjects"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_offerings" ADD CONSTRAINT "subject_offerings_academic_year_id_organization_id_fkey" FOREIGN KEY ("academic_year_id", "organization_id") REFERENCES "academic_years"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_offerings" ADD CONSTRAINT "subject_offerings_class_id_organization_id_fkey" FOREIGN KEY ("class_id", "organization_id") REFERENCES "academic_classes"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_offerings" ADD CONSTRAINT "subject_offerings_curriculum_id_subject_id_fkey" FOREIGN KEY ("curriculum_id", "subject_id") REFERENCES "curricula"("id", "subject_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_offerings" ADD CONSTRAINT "subject_offerings_elective_group_id_organization_id_fkey" FOREIGN KEY ("elective_group_id", "organization_id") REFERENCES "elective_groups"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_offerings" ADD CONSTRAINT "subject_offerings_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_offering_sections" ADD CONSTRAINT "subject_offering_sections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_offering_sections" ADD CONSTRAINT "subject_offering_sections_offering_id_class_id_fkey" FOREIGN KEY ("offering_id", "class_id") REFERENCES "subject_offerings"("id", "class_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_offering_sections" ADD CONSTRAINT "subject_offering_sections_section_id_class_id_fkey" FOREIGN KEY ("section_id", "class_id") REFERENCES "sections"("id", "class_id") ON DELETE NO ACTION ON UPDATE CASCADE;


-- A subject can't be its own prerequisite (cycles are checked by the service).
ALTER TABLE "subject_prerequisites" ADD CONSTRAINT "subject_prerequisites_not_self" CHECK ("subject_id" <> "prerequisite_id");

-- Offering numbers stay sensible.
ALTER TABLE "elective_groups" ADD CONSTRAINT "elective_groups_choices" CHECK ("min_choices" >= 0 AND "max_choices" >= "min_choices");

-- Keep the new tables away from Supabase's public Data API, like the rest
-- (the app reaches them only through Prisma on the server).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['subject_categories', 'subject_prerequisites', 'curricula', 'curriculum_units', 'curriculum_topics', 'elective_groups', 'subject_offerings', 'subject_offering_sections']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- Permissions (kept in sync with lib/authorization/permissions.ts).
INSERT INTO "permissions" ("id", "key", "description", "created_at") VALUES
  (gen_random_uuid(), 'subjects.manage', 'Create, edit and archive subjects, categories, prerequisites and curricula', now()),
  (gen_random_uuid(), 'subjects.offerings.manage', 'Decide which subjects each class studies in an academic year', now()),
  (gen_random_uuid(), 'subjects.export', 'Export and import subject lists', now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", now()
FROM "roles" r
JOIN "permissions" p ON (
  (r."slug" IN ('owner', 'admin', 'principal') AND p."key" IN ('subjects.manage', 'subjects.offerings.manage', 'subjects.export'))
)
WHERE r."is_system" = true
ON CONFLICT DO NOTHING;
