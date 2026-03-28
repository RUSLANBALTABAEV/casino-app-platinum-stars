-- CreateEnum
CREATE TYPE "ManualDepositStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');

-- CreateTable
CREATE TABLE "ManualDepositRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "rubAmount" INTEGER NOT NULL,
    "paymentPurpose" VARCHAR(64),
    "receiptFileId" VARCHAR(256),
    "receiptType" VARCHAR(32),
    "status" "ManualDepositStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" VARCHAR(512),
    "processedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualDepositRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualDepositRequest_userId_status_idx" ON "ManualDepositRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "ManualDepositRequest_status_createdAt_idx" ON "ManualDepositRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ManualDepositRequest_createdAt_idx" ON "ManualDepositRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "ManualDepositRequest" ADD CONSTRAINT "ManualDepositRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualDepositRequest" ADD CONSTRAINT "ManualDepositRequest_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

