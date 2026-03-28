-- CreateTable
CREATE TABLE IF NOT EXISTS "AdminSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totpSecret" VARCHAR(64),
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totpBackupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AdminSettings_userId_key" ON "AdminSettings"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AdminSettings_userId_idx" ON "AdminSettings"("userId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'AdminSettings_userId_fkey'
    ) THEN
        ALTER TABLE "AdminSettings"
            ADD CONSTRAINT "AdminSettings_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;



