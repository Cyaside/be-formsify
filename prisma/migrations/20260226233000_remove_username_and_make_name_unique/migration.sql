-- Remove legacy username and enforce unique display name via "name".
DROP INDEX IF EXISTS "User_username_key";

ALTER TABLE "User"
DROP COLUMN IF EXISTS "username";

CREATE UNIQUE INDEX IF NOT EXISTS "User_name_key" ON "User"("name");
