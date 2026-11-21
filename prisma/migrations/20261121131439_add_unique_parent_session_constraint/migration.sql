-- Add unique partial index to prevent multiple active children per parent session
-- This ensures only one child session can exist for a parent at a time
-- The WHERE clause allows multiple revoked children (historical data)
CREATE UNIQUE INDEX "Session_parentSessionId_unique_active" 
ON "Session"("parentSessionId") 
WHERE "revokedAt" IS NULL AND "parentSessionId" IS NOT NULL;