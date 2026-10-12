-- Student background fields for UGC/EMIS reporting. Additive only: new
-- enum types and nullable columns, so existing rows stay valid and read as
-- "not recorded".

-- CreateEnum
CREATE TYPE "CasteEthnicity" AS ENUM ('DALIT', 'ADIVASI_JANAJATI', 'MADHESI', 'MUSLIM', 'THARU', 'KHAS_ARYA', 'OTHER');

-- CreateEnum
CREATE TYPE "DisabilityType" AS ENUM ('NONE', 'PHYSICAL', 'VISUAL', 'HEARING', 'DEAF_BLIND', 'SPEECH', 'INTELLECTUAL', 'PSYCHOSOCIAL', 'AUTISM', 'HAEMOPHILIA', 'MULTIPLE', 'OTHER');

-- CreateEnum
CREATE TYPE "ScholarshipCategory" AS ENUM ('NONE', 'UGC', 'UNIVERSITY', 'COLLEGE', 'MERIT', 'NEED_BASED', 'DALIT', 'DISABILITY', 'OTHER');

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "caste_ethnicity" "CasteEthnicity",
ADD COLUMN     "disability_type" "DisabilityType",
ADD COLUMN     "economically_disadvantaged" BOOLEAN,
ADD COLUMN     "entrance_score" DECIMAL(6,2),
ADD COLUMN     "first_generation_learner" BOOLEAN,
ADD COLUMN     "previous_qualification" "QualificationLevel",
ADD COLUMN     "previous_result" TEXT,
ADD COLUMN     "remote_area" BOOLEAN,
ADD COLUMN     "scholarship_category" "ScholarshipCategory";

-- Reporting breakdowns filter on these.
CREATE INDEX "students_organization_id_caste_ethnicity_idx" ON "students"("organization_id", "caste_ethnicity");
