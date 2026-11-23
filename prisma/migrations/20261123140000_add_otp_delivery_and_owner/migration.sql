-- Existing challenges predate provider delivery tracking and must fail closed:
-- the previous request route did not send SMS, so their delivery is unknown.
CREATE TYPE "OtpDeliveryStatus" AS ENUM ('PENDING', 'ACCEPTED', 'FAILED', 'UNKNOWN');

ALTER TABLE "OtpChallenge"
ADD COLUMN "deliveryStatus" "OtpDeliveryStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "requestedByUserId" UUID;

CREATE INDEX "OtpChallenge_requestedByUserId_idx" ON "OtpChallenge"("requestedByUserId");

ALTER TABLE "OtpChallenge"
ADD CONSTRAINT "OtpChallenge_requestedByUserId_fkey"
FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
