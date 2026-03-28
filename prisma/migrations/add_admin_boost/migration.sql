-- AddColumn isAdmin to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- AddColumn adminBoostEnabled to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "adminBoostEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable AdminDrainOperation
CREATE TABLE IF NOT EXISTS "AdminDrainOperation" (
    "id" TEXT NOT NULL,
    "performedBy" TEXT NOT NULL,
    "totalStars" INTEGER NOT NULL DEFAULT 0,
    "affectedUsers" INTEGER NOT NULL DEFAULT 0,
    "description" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminDrainOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex on AdminDrainOperation
CREATE INDEX IF NOT EXISTS "AdminDrainOperation_createdAt_idx" ON "AdminDrainOperation"("createdAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'AdminDrainOperation_performedBy_fkey'
    ) THEN
        ALTER TABLE "AdminDrainOperation"
            ADD CONSTRAINT "AdminDrainOperation_performedBy_fkey"
            FOREIGN KEY ("performedBy") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;






