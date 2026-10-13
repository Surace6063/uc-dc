-- CreateEnum
CREATE TYPE "AcademicRank" AS ENUM ('PROFESSOR', 'ASSOCIATE_PROFESSOR', 'ASSISTANT_PROFESSOR', 'LECTURER', 'TEACHING_ASSISTANT', 'OTHER');

-- CreateEnum
CREATE TYPE "DevelopmentType" AS ENUM ('TRAINING', 'WORKSHOP', 'SEMINAR', 'CONFERENCE', 'FDP', 'CERTIFICATION', 'OTHER');

-- AlterTable
ALTER TABLE "teachers" ADD COLUMN     "academic_rank" "AcademicRank",
ADD COLUMN     "full_time_elsewhere" BOOLEAN;

-- AlterTable
ALTER TABLE "teacher_employment_records" ADD COLUMN     "academic_rank" "AcademicRank";

-- AlterTable
ALTER TABLE "teacher_certifications" ADD COLUMN     "category" "DevelopmentType";

-- CreateIndex
CREATE INDEX "teachers_organization_id_academic_rank_idx" ON "teachers"("organization_id", "academic_rank");
