-- CreateEnum
CREATE TYPE "CollaboratorRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- AlterTable
ALTER TABLE "Form"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "FormCollaborator" (
    "formId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "CollaboratorRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormCollaborator_pkey" PRIMARY KEY ("formId","userId")
);

-- CreateIndex
CREATE INDEX "FormCollaborator_formId_idx" ON "FormCollaborator"("formId");

-- CreateIndex
CREATE INDEX "FormCollaborator_userId_idx" ON "FormCollaborator"("userId");

-- AddForeignKey
ALTER TABLE "FormCollaborator" ADD CONSTRAINT "FormCollaborator_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormCollaborator" ADD CONSTRAINT "FormCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
