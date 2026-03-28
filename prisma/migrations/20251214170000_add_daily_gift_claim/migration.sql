-- CreateTable
CREATE TABLE "DailyGiftClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "claimDay" TIMESTAMP(3) NOT NULL,
    "streak" INTEGER NOT NULL DEFAULT 1,
    "reward" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyGiftClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyGiftClaim_userId_claimDay_key" ON "DailyGiftClaim"("userId", "claimDay");

-- CreateIndex
CREATE INDEX "DailyGiftClaim_userId_createdAt_idx" ON "DailyGiftClaim"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "DailyGiftClaim" ADD CONSTRAINT "DailyGiftClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

