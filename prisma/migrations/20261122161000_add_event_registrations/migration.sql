-- Event endpoints use the existing Forum aggregate. RSVP registrations are
-- separate from paid tickets and do not issue admission credentials.

ALTER TABLE "Forum"
    ADD COLUMN "locationCoordinates" JSONB,
    ADD COLUMN "registrationDeadline" TIMESTAMP(3),
    ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "ForumTranslation"
    ADD COLUMN "venueName" VARCHAR(255),
    ADD COLUMN "venueAddress" TEXT;

CREATE TABLE "EventRegistration" (
    "id" UUID NOT NULL,
    "forumId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "attendeeFirstName" VARCHAR(100) NOT NULL,
    "attendeeLastName" VARCHAR(100) NOT NULL,
    "attendeePhone" VARCHAR(20) NOT NULL,
    "attendeeEmail" VARCHAR(255),
    "additionalInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventRegistration_forumId_userId_key"
    ON "EventRegistration"("forumId", "userId");
CREATE INDEX "EventRegistration_forumId_createdAt_idx"
    ON "EventRegistration"("forumId", "createdAt");
CREATE INDEX "EventRegistration_userId_createdAt_idx"
    ON "EventRegistration"("userId", "createdAt");

ALTER TABLE "EventRegistration"
    ADD CONSTRAINT "EventRegistration_forumId_fkey"
        FOREIGN KEY ("forumId") REFERENCES "Forum"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "EventRegistration_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
