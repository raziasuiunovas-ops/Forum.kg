-- CreateTable
CREATE TABLE "Admin2FACode" (
    "id" UUID NOT NULL,
    "pendingToken" VARCHAR(255) NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "codeHash" VARCHAR(128) NOT NULL,
    "chatId" VARCHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin2FACode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin2FACode_pendingToken_key" ON "Admin2FACode"("pendingToken");

-- CreateIndex
CREATE INDEX "Admin2FACode_expiresAt_idx" ON "Admin2FACode"("expiresAt");

-- CreateIndex
CREATE INDEX "Admin2FACode_username_createdAt_idx" ON "Admin2FACode"("username", "createdAt");
