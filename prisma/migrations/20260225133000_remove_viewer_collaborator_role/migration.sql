-- Normalize any legacy VIEWER rows before removing enum value
UPDATE "FormCollaborator"
SET "role" = 'EDITOR'
WHERE "role" = 'VIEWER';

-- Recreate enum without VIEWER (PostgreSQL does not support dropping enum values directly in-place)
ALTER TABLE "FormCollaborator"
ALTER COLUMN "role" DROP DEFAULT;

ALTER TYPE "CollaboratorRole" RENAME TO "CollaboratorRole_old";

CREATE TYPE "CollaboratorRole" AS ENUM ('OWNER', 'EDITOR');

ALTER TABLE "FormCollaborator"
ALTER COLUMN "role" TYPE "CollaboratorRole"
USING ("role"::text::"CollaboratorRole");

DROP TYPE "CollaboratorRole_old";

ALTER TABLE "FormCollaborator"
ALTER COLUMN "role" SET DEFAULT 'EDITOR';
