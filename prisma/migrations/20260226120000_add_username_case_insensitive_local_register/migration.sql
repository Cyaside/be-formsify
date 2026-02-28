-- Add username for local registration.
-- Usernames are stored in lowercase by the application, so a normal unique index
-- enforces case-insensitive uniqueness in practice.
ALTER TABLE "User"
ADD COLUMN "username" TEXT;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
