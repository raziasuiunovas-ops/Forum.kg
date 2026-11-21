-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_parentSessionId_fkey";

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_parentSessionId_fkey" FOREIGN KEY ("parentSessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
