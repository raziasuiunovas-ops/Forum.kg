-- Email + password sign-in for regular users (nullable: phone/Google accounts have no password).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" VARCHAR(255);
