-- AlterTable
ALTER TABLE "Form"
ADD COLUMN "thankYouTitle" TEXT NOT NULL DEFAULT 'Terima kasih!',
ADD COLUMN "thankYouMessage" TEXT NOT NULL DEFAULT 'Respons kamu sudah terekam.';
