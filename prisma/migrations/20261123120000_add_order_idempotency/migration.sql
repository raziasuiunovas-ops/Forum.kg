-- Persist order idempotency state and the first successful HTTP response.
-- The key itself is never stored; keyHash is a SHA-256 digest.

CREATE TYPE "OrderIdempotencyStatus" AS ENUM ('PROCESSING', 'COMPLETED');

CREATE TABLE "OrderIdempotency" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "keyHash" VARCHAR(64) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "status" "OrderIdempotencyStatus" NOT NULL DEFAULT 'PROCESSING',
    "orderId" UUID,
    "responseStatus" INTEGER,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderIdempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderIdempotency_orderId_key"
    ON "OrderIdempotency"("orderId");
CREATE UNIQUE INDEX "OrderIdempotency_userId_keyHash_key"
    ON "OrderIdempotency"("userId", "keyHash");
CREATE INDEX "OrderIdempotency_createdAt_idx"
    ON "OrderIdempotency"("createdAt");

ALTER TABLE "OrderIdempotency"
    ADD CONSTRAINT "OrderIdempotency_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "OrderIdempotency_orderId_fkey"
        FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
