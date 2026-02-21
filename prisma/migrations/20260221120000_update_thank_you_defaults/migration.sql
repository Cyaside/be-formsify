-- AlterTable: update default values for thank you fields
ALTER TABLE "Form"
ALTER COLUMN "thankYouTitle" SET DEFAULT 'Thankyou';

ALTER TABLE "Form"
ALTER COLUMN "thankYouMessage" SET DEFAULT 'for using formsify';
