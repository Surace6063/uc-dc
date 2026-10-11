-- CreateEnum
CREATE TYPE "SectionShift" AS ENUM ('MORNING', 'DAY', 'EVENING');

-- CreateEnum
CREATE TYPE "InstructionMedium" AS ENUM ('ENGLISH', 'NEPALI', 'BILINGUAL', 'MOTHER_TONGUE', 'OTHER');

-- AlterTable
ALTER TABLE "academic_classes" ADD COLUMN     "local_name" TEXT;

-- AlterTable
ALTER TABLE "sections" ADD COLUMN     "medium" "InstructionMedium",
ADD COLUMN     "room" TEXT,
ADD COLUMN     "shift" "SectionShift";
