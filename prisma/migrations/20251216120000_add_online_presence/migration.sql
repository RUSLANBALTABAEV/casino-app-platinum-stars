-- CreateTable
CREATE TABLE "OnlinePresence" (
    "userId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnlinePresence_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "OnlinePresence_lastSeenAt_idx" ON "OnlinePresence"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "OnlinePresence" ADD CONSTRAINT "OnlinePresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

