-- CreateTable
CREATE TABLE "ProfessionDictionary" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "profession" TEXT NOT NULL,
    "professionId" TEXT,
    "category" TEXT,
    "synonyms" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfessionDictionary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfessionDictionary_source_idx" ON "ProfessionDictionary"("source");

-- CreateIndex
CREATE INDEX "ProfessionDictionary_category_idx" ON "ProfessionDictionary"("category");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionDictionary_source_profession_key" ON "ProfessionDictionary"("source", "profession");
