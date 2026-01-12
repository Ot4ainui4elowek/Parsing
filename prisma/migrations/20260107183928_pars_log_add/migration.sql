-- DropIndex
DROP INDEX "ParseLog_source_createdAt_idx";

-- AlterTable
ALTER TABLE "ParseLog" ADD COLUMN     "searchQuery" TEXT;

-- CreateIndex
CREATE INDEX "ParseLog_source_searchQuery_createdAt_idx" ON "ParseLog"("source", "searchQuery", "createdAt");
