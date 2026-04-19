-- Add stable display ordering for ability tag links.
ALTER TABLE "ErrorItemAbilityTag" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;

-- Existing manual links should not be forced ahead of AI-generated links after ordering support is added.
UPDATE "ErrorItemAbilityTag" SET "order" = 100 WHERE "source" = 'manual';

-- Avoid duplicate user-defined ability tags for the same subject/name/user.
-- SQLite allows multiple NULL values here, so system tags remain governed by the existing code uniqueness.
CREATE UNIQUE INDEX "AbilityTag_subject_name_userId_key" ON "AbilityTag"("subject", "name", "userId");
