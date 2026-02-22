-- AlterTable
ALTER TABLE "Form" ADD COLUMN     "isClosed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "responseLimit" INTEGER;
