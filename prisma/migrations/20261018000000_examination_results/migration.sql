-- Examinations, grading and results: assessment types, versioned grading
-- scales, result policies, examinations with subjects and components, marks
-- sheets with a review workflow, marks with change history, result holds
-- and immutable, versioned result publications.

-- CreateEnum
CREATE TYPE "AssessmentCategory" AS ENUM ('CLASS_TEST', 'UNIT_TEST', 'TERMINAL', 'MIDTERM', 'FINAL', 'PRACTICAL', 'INTERNAL', 'PROJECT', 'SEMESTER', 'MOCK', 'OTHER');

-- CreateEnum
CREATE TYPE "ExaminationStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'APPROVED', 'PUBLISHED', 'REVISION', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ComponentType" AS ENUM ('THEORY', 'PRACTICAL', 'INTERNAL', 'PROJECT', 'PRESENTATION', 'VIVA', 'LAB', 'ASSIGNMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "GradingType" AS ENUM ('LETTER', 'GRADE_POINT', 'PERCENTAGE_BAND');

-- CreateEnum
CREATE TYPE "GradingScaleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "AbsentTreatment" AS ENUM ('RESULT_ABSENT', 'COUNT_AS_ZERO');

-- CreateEnum
CREATE TYPE "GpaMethod" AS ENUM ('NONE', 'CREDIT_WEIGHTED', 'SIMPLE_AVERAGE');

-- CreateEnum
CREATE TYPE "SubjectPassRule" AS ENUM ('MARKS', 'GRADE', 'MARKS_AND_GRADE');

-- CreateEnum
CREATE TYPE "RankBasis" AS ENUM ('TOTAL', 'PERCENTAGE', 'GPA');

-- CreateEnum
CREATE TYPE "RankScope" AS ENUM ('CLASS', 'SECTION');

-- CreateEnum
CREATE TYPE "RankTieMode" AS ENUM ('SHARED', 'DENSE');

-- CreateEnum
CREATE TYPE "MarksSheetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED', 'APPROVED', 'RETURNED');

-- CreateEnum
CREATE TYPE "MarkStatus" AS ENUM ('SCORED', 'ABSENT', 'EXEMPT', 'INCOMPLETE', 'WITHHELD');

-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('PASS', 'FAIL', 'ABSENT', 'INCOMPLETE', 'WITHHELD', 'EXEMPT', 'PENDING');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('ACTIVE', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "assessment_types" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "category" "AssessmentCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_scales" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "grading_type" "GradingType" NOT NULL,
    "status" "GradingScaleStatus" NOT NULL DEFAULT 'DRAFT',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previous_version_id" UUID,
    "effective_from" DATE,
    "effective_to" DATE,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grading_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_scale_rules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "grading_scale_id" UUID NOT NULL,
    "grade" TEXT NOT NULL,
    "minimum_percentage" DECIMAL(5,2) NOT NULL,
    "maximum_percentage" DECIMAL(5,2) NOT NULL,
    "grade_point" DECIMAL(4,2),
    "description" TEXT,
    "is_failing" BOOLEAN NOT NULL DEFAULT false,
    "sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "grading_scale_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_policies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "education_level_id" UUID,
    "grading_scale_id" UUID,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "subject_pass_rule" "SubjectPassRule" NOT NULL DEFAULT 'MARKS',
    "component_pass_required" BOOLEAN NOT NULL DEFAULT false,
    "absent_treatment" "AbsentTreatment" NOT NULL DEFAULT 'RESULT_ABSENT',
    "optional_in_aggregate" BOOLEAN NOT NULL DEFAULT false,
    "gpa_method" "GpaMethod" NOT NULL DEFAULT 'NONE',
    "percentage_decimals" INTEGER NOT NULL DEFAULT 2,
    "gpa_decimals" INTEGER NOT NULL DEFAULT 2,
    "grace_marks_per_subject" DECIMAL(5,2),
    "grace_max_subjects" INTEGER NOT NULL DEFAULT 0,
    "ranking_enabled" BOOLEAN NOT NULL DEFAULT false,
    "rank_basis" "RankBasis" NOT NULL DEFAULT 'PERCENTAGE',
    "rank_scope" "RankScope" NOT NULL DEFAULT 'SECTION',
    "rank_tie_mode" "RankTieMode" NOT NULL DEFAULT 'SHARED',
    "require_verification" BOOLEAN NOT NULL DEFAULT true,
    "separate_reviewer" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "examinations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "assessment_type_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "education_level_id" UUID,
    "program_id" UUID,
    "term" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "result_publication_date" DATE,
    "grading_scale_id" UUID NOT NULL,
    "result_policy_id" UUID NOT NULL,
    "status" "ExaminationStatus" NOT NULL DEFAULT 'DRAFT',
    "rules_snapshot" JSONB,
    "approved_at" TIMESTAMP(3),
    "approved_by_id" UUID,
    "published_at" TIMESTAMP(3),
    "published_by_id" UUID,
    "created_by_id" UUID,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "examinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "examination_subjects" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "examination_id" UUID NOT NULL,
    "subject_offering_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "maximum_marks" DECIMAL(7,2) NOT NULL,
    "pass_marks" DECIMAL(7,2),
    "credit_hours" DECIMAL(5,2),
    "is_compulsory" BOOLEAN NOT NULL DEFAULT true,
    "exam_date" DATE,
    "start_time" TEXT,
    "end_time" TEXT,
    "venue" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "examination_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_components" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "examination_subject_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "component_type" "ComponentType" NOT NULL DEFAULT 'THEORY',
    "maximum_marks" DECIMAL(7,2) NOT NULL,
    "pass_marks" DECIMAL(7,2),
    "weightage" DECIMAL(5,2),
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marks_sheets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "examination_id" UUID NOT NULL,
    "examination_subject_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "section_id" UUID,
    "status" "MarksSheetStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID,
    "first_submitted_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "submitted_by_id" UUID,
    "verified_at" TIMESTAMP(3),
    "verified_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "approved_by_id" UUID,
    "returned_at" TIMESTAMP(3),
    "returned_by_id" UUID,
    "return_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marks_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_marks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "examination_id" UUID NOT NULL,
    "examination_subject_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "marks_sheet_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "status" "MarkStatus" NOT NULL,
    "marks_obtained" DECIMAL(7,2),
    "entered_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_marks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_mark_history" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "examination_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "from_status" "MarkStatus",
    "from_marks" DECIMAL(7,2),
    "to_status" "MarkStatus",
    "to_marks" DECIMAL(7,2),
    "reason" TEXT NOT NULL,
    "changed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_mark_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mark_remarks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "examination_subject_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "remark" TEXT,
    "internal_note" TEXT,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mark_remarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_holds" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "examination_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),
    "released_by_id" UUID,

    CONSTRAINT "result_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_publications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "examination_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "rules_snapshot" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "published_by_id" UUID,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded_at" TIMESTAMP(3),
    "notified_at" TIMESTAMP(3),

    CONSTRAINT "result_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_results" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "publication_id" UUID NOT NULL,
    "examination_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "section_id" UUID,
    "status" "ResultStatus" NOT NULL,
    "total_obtained" DECIMAL(9,2),
    "total_maximum" DECIMAL(9,2),
    "percentage" DECIMAL(7,4),
    "grade" TEXT,
    "grade_point" DECIMAL(4,2),
    "gpa" DECIMAL(6,4),
    "rank" INTEGER,
    "breakdown" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_subject_results" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "publication_id" UUID NOT NULL,
    "result_id" UUID NOT NULL,
    "examination_subject_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "section_id" UUID,
    "is_compulsory" BOOLEAN NOT NULL,
    "status" "ResultStatus" NOT NULL,
    "obtained" DECIMAL(9,2),
    "maximum" DECIMAL(9,2),
    "percentage" DECIMAL(7,4),
    "grade" TEXT,
    "grade_point" DECIMAL(4,2),

    CONSTRAINT "student_subject_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assessment_types_organization_id_name_key" ON "assessment_types"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_types_id_organization_id_key" ON "assessment_types"("id", "organization_id");

-- CreateIndex
CREATE INDEX "grading_scales_organization_id_status_idx" ON "grading_scales"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "grading_scales_organization_id_name_version_key" ON "grading_scales"("organization_id", "name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "grading_scales_id_organization_id_key" ON "grading_scales"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "grading_scales_one_default_key" ON "grading_scales"("organization_id") WHERE (is_default);

-- CreateIndex
CREATE INDEX "grading_scale_rules_grading_scale_id_sequence_idx" ON "grading_scale_rules"("grading_scale_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "grading_scale_rules_grading_scale_id_grade_key" ON "grading_scale_rules"("grading_scale_id", "grade");

-- CreateIndex
CREATE UNIQUE INDEX "result_policies_organization_id_name_key" ON "result_policies"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "result_policies_id_organization_id_key" ON "result_policies"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_policies_one_default_key" ON "result_policies"("organization_id") WHERE (is_default);

-- CreateIndex
CREATE INDEX "examinations_organization_id_academic_year_id_status_idx" ON "examinations"("organization_id", "academic_year_id", "status");

-- CreateIndex
CREATE INDEX "examinations_organization_id_start_date_idx" ON "examinations"("organization_id", "start_date");

-- CreateIndex
CREATE INDEX "examinations_organization_id_assessment_type_id_idx" ON "examinations"("organization_id", "assessment_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "examinations_organization_id_academic_year_id_name_key" ON "examinations"("organization_id", "academic_year_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "examinations_id_organization_id_key" ON "examinations"("id", "organization_id");

-- CreateIndex
CREATE INDEX "examination_subjects_organization_id_class_id_idx" ON "examination_subjects"("organization_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "examination_subjects_examination_id_subject_offering_id_key" ON "examination_subjects"("examination_id", "subject_offering_id");

-- CreateIndex
CREATE UNIQUE INDEX "examination_subjects_id_organization_id_key" ON "examination_subjects"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "examination_subjects_id_examination_id_class_id_key" ON "examination_subjects"("id", "examination_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_components_examination_subject_id_name_key" ON "assessment_components"("examination_subject_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_components_id_organization_id_key" ON "assessment_components"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_components_id_examination_subject_id_key" ON "assessment_components"("id", "examination_subject_id");

-- CreateIndex
CREATE INDEX "marks_sheets_organization_id_examination_id_status_idx" ON "marks_sheets"("organization_id", "examination_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "marks_sheets_section_key" ON "marks_sheets"("examination_subject_id", "section_id") WHERE (section_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "marks_sheets_whole_class_key" ON "marks_sheets"("examination_subject_id") WHERE (section_id IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "marks_sheets_id_organization_id_key" ON "marks_sheets"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "marks_sheets_id_examination_subject_id_key" ON "marks_sheets"("id", "examination_subject_id");

-- CreateIndex
CREATE INDEX "student_marks_organization_id_examination_id_student_id_idx" ON "student_marks"("organization_id", "examination_id", "student_id");

-- CreateIndex
CREATE INDEX "student_marks_marks_sheet_id_idx" ON "student_marks"("marks_sheet_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_marks_component_id_student_id_key" ON "student_marks"("component_id", "student_id");

-- CreateIndex
CREATE INDEX "student_mark_history_organization_id_examination_id_student_idx" ON "student_mark_history"("organization_id", "examination_id", "student_id");

-- CreateIndex
CREATE INDEX "student_mark_history_component_id_student_id_idx" ON "student_mark_history"("component_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "mark_remarks_examination_subject_id_student_id_key" ON "mark_remarks"("examination_subject_id", "student_id");

-- CreateIndex
CREATE INDEX "result_holds_organization_id_examination_id_idx" ON "result_holds"("organization_id", "examination_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_holds_one_open_key" ON "result_holds"("examination_id", "student_id") WHERE (released_at IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "result_publications_examination_id_version_key" ON "result_publications"("examination_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "result_publications_id_organization_id_key" ON "result_publications"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_publications_id_examination_id_key" ON "result_publications"("id", "examination_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_publications_one_active_key" ON "result_publications"("examination_id") WHERE (status = 'ACTIVE');

-- CreateIndex
CREATE INDEX "student_results_organization_id_student_id_idx" ON "student_results"("organization_id", "student_id");

-- CreateIndex
CREATE INDEX "student_results_organization_id_examination_id_class_id_sec_idx" ON "student_results"("organization_id", "examination_id", "class_id", "section_id");

-- CreateIndex
CREATE INDEX "student_results_organization_id_academic_year_id_status_idx" ON "student_results"("organization_id", "academic_year_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "student_results_publication_id_student_id_key" ON "student_results"("publication_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_results_id_publication_id_key" ON "student_results"("id", "publication_id");

-- CreateIndex
CREATE INDEX "student_subject_results_organization_id_publication_id_subj_idx" ON "student_subject_results"("organization_id", "publication_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_subject_results_result_id_examination_subject_id_key" ON "student_subject_results"("result_id", "examination_subject_id");

-- AddForeignKey
ALTER TABLE "assessment_types" ADD CONSTRAINT "assessment_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_scales" ADD CONSTRAINT "grading_scales_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_scales" ADD CONSTRAINT "grading_scales_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "grading_scales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_scale_rules" ADD CONSTRAINT "grading_scale_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_scale_rules" ADD CONSTRAINT "grading_scale_rules_grading_scale_id_organization_id_fkey" FOREIGN KEY ("grading_scale_id", "organization_id") REFERENCES "grading_scales"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_policies" ADD CONSTRAINT "result_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_policies" ADD CONSTRAINT "result_policies_education_level_id_organization_id_fkey" FOREIGN KEY ("education_level_id", "organization_id") REFERENCES "education_levels"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_policies" ADD CONSTRAINT "result_policies_grading_scale_id_organization_id_fkey" FOREIGN KEY ("grading_scale_id", "organization_id") REFERENCES "grading_scales"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_academic_year_id_organization_id_fkey" FOREIGN KEY ("academic_year_id", "organization_id") REFERENCES "academic_years"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_assessment_type_id_organization_id_fkey" FOREIGN KEY ("assessment_type_id", "organization_id") REFERENCES "assessment_types"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_education_level_id_organization_id_fkey" FOREIGN KEY ("education_level_id", "organization_id") REFERENCES "education_levels"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_program_id_organization_id_fkey" FOREIGN KEY ("program_id", "organization_id") REFERENCES "programs"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_grading_scale_id_organization_id_fkey" FOREIGN KEY ("grading_scale_id", "organization_id") REFERENCES "grading_scales"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_result_policy_id_organization_id_fkey" FOREIGN KEY ("result_policy_id", "organization_id") REFERENCES "result_policies"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examination_subjects" ADD CONSTRAINT "examination_subjects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examination_subjects" ADD CONSTRAINT "examination_subjects_examination_id_organization_id_fkey" FOREIGN KEY ("examination_id", "organization_id") REFERENCES "examinations"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examination_subjects" ADD CONSTRAINT "examination_subjects_class_id_organization_id_fkey" FOREIGN KEY ("class_id", "organization_id") REFERENCES "academic_classes"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examination_subjects" ADD CONSTRAINT "examination_subjects_subject_offering_id_class_id_fkey" FOREIGN KEY ("subject_offering_id", "class_id") REFERENCES "subject_offerings"("id", "class_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_components" ADD CONSTRAINT "assessment_components_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_components" ADD CONSTRAINT "assessment_components_examination_subject_id_organization__fkey" FOREIGN KEY ("examination_subject_id", "organization_id") REFERENCES "examination_subjects"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks_sheets" ADD CONSTRAINT "marks_sheets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks_sheets" ADD CONSTRAINT "marks_sheets_examination_id_organization_id_fkey" FOREIGN KEY ("examination_id", "organization_id") REFERENCES "examinations"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks_sheets" ADD CONSTRAINT "marks_sheets_examination_subject_id_examination_id_class_i_fkey" FOREIGN KEY ("examination_subject_id", "examination_id", "class_id") REFERENCES "examination_subjects"("id", "examination_id", "class_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks_sheets" ADD CONSTRAINT "marks_sheets_section_id_class_id_fkey" FOREIGN KEY ("section_id", "class_id") REFERENCES "sections"("id", "class_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_marks" ADD CONSTRAINT "student_marks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_marks" ADD CONSTRAINT "student_marks_examination_id_organization_id_fkey" FOREIGN KEY ("examination_id", "organization_id") REFERENCES "examinations"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_marks" ADD CONSTRAINT "student_marks_component_id_examination_subject_id_fkey" FOREIGN KEY ("component_id", "examination_subject_id") REFERENCES "assessment_components"("id", "examination_subject_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_marks" ADD CONSTRAINT "student_marks_marks_sheet_id_examination_subject_id_fkey" FOREIGN KEY ("marks_sheet_id", "examination_subject_id") REFERENCES "marks_sheets"("id", "examination_subject_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_marks" ADD CONSTRAINT "student_marks_student_id_organization_id_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "students"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_marks" ADD CONSTRAINT "student_marks_enrollment_id_student_id_fkey" FOREIGN KEY ("enrollment_id", "student_id") REFERENCES "enrollments"("id", "student_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_mark_history" ADD CONSTRAINT "student_mark_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_mark_history" ADD CONSTRAINT "student_mark_history_examination_id_organization_id_fkey" FOREIGN KEY ("examination_id", "organization_id") REFERENCES "examinations"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_remarks" ADD CONSTRAINT "mark_remarks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_remarks" ADD CONSTRAINT "mark_remarks_examination_subject_id_organization_id_fkey" FOREIGN KEY ("examination_subject_id", "organization_id") REFERENCES "examination_subjects"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_remarks" ADD CONSTRAINT "mark_remarks_student_id_organization_id_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "students"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_holds" ADD CONSTRAINT "result_holds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_holds" ADD CONSTRAINT "result_holds_examination_id_organization_id_fkey" FOREIGN KEY ("examination_id", "organization_id") REFERENCES "examinations"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_holds" ADD CONSTRAINT "result_holds_student_id_organization_id_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "students"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_examination_id_organization_id_fkey" FOREIGN KEY ("examination_id", "organization_id") REFERENCES "examinations"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_results" ADD CONSTRAINT "student_results_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_results" ADD CONSTRAINT "student_results_publication_id_examination_id_fkey" FOREIGN KEY ("publication_id", "examination_id") REFERENCES "result_publications"("id", "examination_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_results" ADD CONSTRAINT "student_results_student_id_organization_id_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "students"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_results" ADD CONSTRAINT "student_results_enrollment_id_student_id_fkey" FOREIGN KEY ("enrollment_id", "student_id") REFERENCES "enrollments"("id", "student_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subject_results" ADD CONSTRAINT "student_subject_results_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subject_results" ADD CONSTRAINT "student_subject_results_publication_id_organization_id_fkey" FOREIGN KEY ("publication_id", "organization_id") REFERENCES "result_publications"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subject_results" ADD CONSTRAINT "student_subject_results_result_id_publication_id_fkey" FOREIGN KEY ("result_id", "publication_id") REFERENCES "student_results"("id", "publication_id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ------------------------------------------------------------ integrity

ALTER TABLE "examinations" ADD CONSTRAINT "examinations_dates" CHECK (
  "end_date" >= "start_date" AND
  ("result_publication_date" IS NULL OR "result_publication_date" >= "start_date")
);

ALTER TABLE "grading_scales" ADD CONSTRAINT "grading_scales_values" CHECK (
  "version" >= 1 AND
  ("effective_to" IS NULL OR "effective_from" IS NULL OR "effective_to" >= "effective_from")
);

-- Bands sit inside 0–100 with min < max (overlaps and gaps are checked by
-- the service, which sees the whole scale).
ALTER TABLE "grading_scale_rules" ADD CONSTRAINT "grading_scale_rules_range" CHECK (
  "minimum_percentage" >= 0 AND "maximum_percentage" <= 100 AND
  "minimum_percentage" < "maximum_percentage" AND
  ("grade_point" IS NULL OR "grade_point" >= 0)
);

ALTER TABLE "result_policies" ADD CONSTRAINT "result_policies_values" CHECK (
  "percentage_decimals" BETWEEN 0 AND 4 AND
  "gpa_decimals" BETWEEN 0 AND 4 AND
  "grace_max_subjects" BETWEEN 0 AND 20 AND
  ("grace_marks_per_subject" IS NULL OR "grace_marks_per_subject" >= 0)
);

ALTER TABLE "examination_subjects" ADD CONSTRAINT "examination_subjects_values" CHECK (
  "maximum_marks" > 0 AND
  ("pass_marks" IS NULL OR ("pass_marks" >= 0 AND "pass_marks" <= "maximum_marks")) AND
  ("credit_hours" IS NULL OR "credit_hours" > 0) AND
  ("start_time" IS NULL OR "start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') AND
  ("end_time" IS NULL OR "end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

ALTER TABLE "assessment_components" ADD CONSTRAINT "assessment_components_values" CHECK (
  "maximum_marks" > 0 AND
  ("pass_marks" IS NULL OR ("pass_marks" >= 0 AND "pass_marks" <= "maximum_marks")) AND
  ("weightage" IS NULL OR ("weightage" > 0 AND "weightage" <= 100))
);

-- Marks are recorded exactly when the student was scored, and never negative.
ALTER TABLE "student_marks" ADD CONSTRAINT "student_marks_scored" CHECK (
  ("status" = 'SCORED') = ("marks_obtained" IS NOT NULL) AND
  ("marks_obtained" IS NULL OR "marks_obtained" >= 0)
);

ALTER TABLE "student_results" ADD CONSTRAINT "student_results_rank" CHECK ("rank" IS NULL OR "rank" >= 1);
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_version" CHECK ("version" >= 1);

-- A mark never exceeds its component's full marks, and marks are written
-- only while their sheet is a draft or was returned for correction: the
-- review workflow is enforced here as well as in the service.
CREATE FUNCTION "student_marks_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  max_marks numeric;
  sheet_status "MarksSheetStatus";
BEGIN
  SELECT "maximum_marks" INTO max_marks FROM "assessment_components" WHERE "id" = NEW."component_id";
  IF NEW."marks_obtained" IS NOT NULL AND NEW."marks_obtained" > max_marks THEN
    RAISE EXCEPTION 'Marks % exceed the component''s full marks %', NEW."marks_obtained", max_marks
      USING ERRCODE = 'check_violation', CONSTRAINT = 'student_marks_within_maximum';
  END IF;
  SELECT "status" INTO sheet_status FROM "marks_sheets" WHERE "id" = NEW."marks_sheet_id";
  IF sheet_status NOT IN ('DRAFT', 'RETURNED') THEN
    RAISE EXCEPTION 'Marks on a % sheet cannot be changed', sheet_status
      USING ERRCODE = 'check_violation', CONSTRAINT = 'student_marks_sheet_editable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "student_marks_guard" BEFORE INSERT OR UPDATE ON "student_marks"
  FOR EACH ROW EXECUTE FUNCTION "student_marks_guard"();

-- Published results are immutable. A publication may only be superseded
-- (status, superseded_at) or marked as notified.
CREATE FUNCTION "published_results_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Published results cannot be changed; publish a revised version instead'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'published_results_immutable';
END $$;

CREATE TRIGGER "student_results_immutable" BEFORE UPDATE ON "student_results"
  FOR EACH ROW EXECUTE FUNCTION "published_results_immutable"();
CREATE TRIGGER "student_subject_results_immutable" BEFORE UPDATE ON "student_subject_results"
  FOR EACH ROW EXECUTE FUNCTION "published_results_immutable"();

CREATE FUNCTION "result_publications_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."examination_id" <> OLD."examination_id" OR NEW."version" <> OLD."version"
     OR NEW."rules_snapshot" IS DISTINCT FROM OLD."rules_snapshot" OR NEW."summary" IS DISTINCT FROM OLD."summary"
     OR NEW."published_at" <> OLD."published_at" OR NEW."published_by_id" IS DISTINCT FROM OLD."published_by_id"
     OR NEW."reason" IS DISTINCT FROM OLD."reason"
     OR (OLD."status" = 'SUPERSEDED' AND NEW."status" <> 'SUPERSEDED') THEN
    RAISE EXCEPTION 'Published results cannot be changed; publish a revised version instead'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'published_results_immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "result_publications_guard" BEFORE UPDATE ON "result_publications"
  FOR EACH ROW EXECUTE FUNCTION "result_publications_guard"();

-- Keep the new tables away from Supabase's public Data API, like the rest
-- (the app reaches them only through Prisma on the server).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assessment_types', 'grading_scales', 'grading_scale_rules', 'result_policies', 'examinations',
    'examination_subjects', 'assessment_components', 'marks_sheets', 'student_marks', 'student_mark_history', 'mark_remarks',
    'result_holds', 'result_publications', 'student_results', 'student_subject_results']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- ------------------------------------------------------------ permissions
-- (kept in sync with lib/authorization/permissions.ts)

INSERT INTO "permissions" ("id", "key", "description", "created_at") VALUES
  (gen_random_uuid(), 'exams.configure', 'Configure grading scales, result policies and assessment types', now()),
  (gen_random_uuid(), 'exams.marks.manage', 'Enter and edit marks for any examination subject', now()),
  (gen_random_uuid(), 'exams.review', 'Verify submitted marks and return them for correction', now()),
  (gen_random_uuid(), 'exams.approve', 'Approve marks and results, and reopen published results for correction', now()),
  (gen_random_uuid(), 'exams.publish', 'Publish examination results', now()),
  (gen_random_uuid(), 'exams.export', 'Import marks and export results', now()),
  (gen_random_uuid(), 'results.view_all', 'View every class''s results, mark sheets and analytics', now())
ON CONFLICT ("key") DO NOTHING;

UPDATE "permissions" SET "description" = v.description
FROM (VALUES
  ('exams.view', 'View examinations'),
  ('exams.create', 'Create examinations'),
  ('exams.update', 'Edit examinations, their subjects and components'),
  ('exams.grade', 'Enter marks for subjects one is assigned to teach'),
  ('results.view', 'View results: one''s own, one''s children''s or one''s classes''')
) AS v(key, description)
WHERE "permissions"."key" = v.key;

-- New default role for every existing organisation.
INSERT INTO "roles" ("id", "organization_id", "name", "slug", "description", "is_system", "created_at", "updated_at")
SELECT gen_random_uuid(), o."id", 'Examination Officer', 'exam_officer',
  'Configures examinations, manages marks workflows and coordinates result publication.', true, now(), now()
FROM "organizations" o
ON CONFLICT ("organization_id", "slug") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", now()
FROM "roles" r
JOIN "permissions" p ON (
  (r."slug" IN ('owner', 'admin') AND p."key" IN (
    'exams.configure', 'exams.marks.manage', 'exams.review', 'exams.approve', 'exams.publish', 'exams.export', 'results.view_all'))
  OR (r."slug" = 'principal' AND p."key" IN ('exams.review', 'exams.approve', 'exams.publish', 'exams.export', 'results.view_all'))
  OR (r."slug" = 'academic_coordinator' AND p."key" IN ('exams.review', 'exams.approve', 'exams.export', 'results.view_all'))
  OR (r."slug" = 'exam_officer' AND p."key" IN (
    'dashboard.view', 'students.view', 'teachers.view', 'academics.view', 'classes.view', 'subjects.view', 'reports.view',
    'notifications.view', 'exams.view', 'exams.create', 'exams.update', 'exams.configure', 'exams.marks.manage', 'exams.review',
    'exams.publish', 'exams.export', 'results.view', 'results.view_all'))
)
WHERE r."is_system" = true
ON CONFLICT DO NOTHING;

-- Teachers enter marks for what they teach; creating and configuring
-- examinations moves to examination officers and administrators.
DELETE FROM "role_permissions" rp
USING "roles" r, "permissions" p
WHERE rp."role_id" = r."id" AND rp."permission_id" = p."id"
  AND r."is_system" = true AND r."slug" = 'teacher'
  AND p."key" IN ('exams.create', 'exams.update');
