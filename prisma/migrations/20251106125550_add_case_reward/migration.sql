-- CreateTable
CREATE TABLE "CaseReward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "caseName" VARCHAR(160) NOT NULL,
    "itemId" TEXT,
    "itemName" VARCHAR(160) NOT NULL,
    "rarity" VARCHAR(64) NOT NULL,
    "color" VARCHAR(32),
    "stars" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseReward_userId_createdAt_idx" ON "CaseReward"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CaseReward" ADD CONSTRAINT "CaseReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
