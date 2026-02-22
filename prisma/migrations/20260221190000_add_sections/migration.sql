-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- Add column
ALTER TABLE "Question" ADD COLUMN "sectionId" TEXT;

-- Backfill sections
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

WITH new_sections AS (
  INSERT INTO "Section" ("id", "formId", "title", "description", "order", "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text, f.id, 'Section 1', NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM "Form" f
  RETURNING "id", "formId"
)
UPDATE "Question" q
SET "sectionId" = s.id
FROM new_sections s
WHERE q."formId" = s."formId";

UPDATE "Question" q
SET "sectionId" = s.id
FROM "Section" s
WHERE q."sectionId" IS NULL AND s."formId" = q."formId";

ALTER TABLE "Question" ALTER COLUMN "sectionId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Section_formId_idx" ON "Section"("formId");
CREATE INDEX "Question_sectionId_idx" ON "Question"("sectionId");

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
