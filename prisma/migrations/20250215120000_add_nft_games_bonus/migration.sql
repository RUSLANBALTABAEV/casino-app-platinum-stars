-- Extend GameType enum with new games
ALTER TYPE "GameType" ADD VALUE IF NOT EXISTS 'CRASH';
ALTER TYPE "GameType" ADD VALUE IF NOT EXISTS 'MINES';
ALTER TYPE "GameType" ADD VALUE IF NOT EXISTS 'COINFLIP';
ALTER TYPE "GameType" ADD VALUE IF NOT EXISTS 'TICTACTOE';
ALTER TYPE "GameType" ADD VALUE IF NOT EXISTS 'UPGRADE';
ALTER TYPE "GameType" ADD VALUE IF NOT EXISTS 'BATTLE';
ALTER TYPE "GameType" ADD VALUE IF NOT EXISTS 'CRAFT';

-- Create enums for NFT and battle
DO $$
BEGIN
  CREATE TYPE "NftGiftStatus" AS ENUM ('OWNED', 'STAKED', 'CRAFTED', 'SOLD');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$
BEGIN
  CREATE TYPE "BattleStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add bonus balance columns
ALTER TABLE "StarBalance" ADD COLUMN IF NOT EXISTS "bonusAvailable" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StarBalance" ADD COLUMN IF NOT EXISTS "bonusReserved" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StarBalance" ADD COLUMN IF NOT EXISTS "bonusLifetimeEarn" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StarBalance" ADD COLUMN IF NOT EXISTS "bonusLifetimeSpend" INTEGER NOT NULL DEFAULT 0;

-- NFT gifts catalog
CREATE TABLE IF NOT EXISTS "NftGift" (
  "id" TEXT NOT NULL,
  "telegramGiftId" VARCHAR(64),
  "name" VARCHAR(160) NOT NULL,
  "rarity" VARCHAR(64) NOT NULL,
  "description" VARCHAR(256),
  "imageUrl" VARCHAR(512),
  "priceStars" INTEGER,
  "priceBonus" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NftGift_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NftGift_rarity_idx" ON "NftGift"("rarity");
CREATE INDEX IF NOT EXISTS "NftGift_isActive_idx" ON "NftGift"("isActive");

-- Add NFT gift column to case rewards
ALTER TABLE "CaseReward" ADD COLUMN IF NOT EXISTS "nftGiftId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CaseReward_nftGiftId_fkey'
  ) THEN
    ALTER TABLE "CaseReward"
      ADD CONSTRAINT "CaseReward_nftGiftId_fkey"
      FOREIGN KEY ("nftGiftId") REFERENCES "NftGift"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- User NFT gifts inventory
CREATE TABLE IF NOT EXISTS "UserNftGift" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "giftId" TEXT NOT NULL,
  "status" "NftGiftStatus" NOT NULL DEFAULT 'OWNED',
  "source" VARCHAR(64),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserNftGift_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UserNftGift_userId_status_idx" ON "UserNftGift"("userId", "status");
CREATE INDEX IF NOT EXISTS "UserNftGift_giftId_idx" ON "UserNftGift"("giftId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'UserNftGift_userId_fkey'
  ) THEN
    ALTER TABLE "UserNftGift"
      ADD CONSTRAINT "UserNftGift_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'UserNftGift_giftId_fkey'
  ) THEN
    ALTER TABLE "UserNftGift"
      ADD CONSTRAINT "UserNftGift_giftId_fkey"
      FOREIGN KEY ("giftId") REFERENCES "NftGift"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Battle matches
CREATE TABLE IF NOT EXISTS "BattleMatch" (
  "id" TEXT NOT NULL,
  "status" "BattleStatus" NOT NULL DEFAULT 'PENDING',
  "currency" VARCHAR(16) NOT NULL DEFAULT 'STARS',
  "entries" JSONB NOT NULL,
  "winnerUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "BattleMatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BattleMatch_status_createdAt_idx" ON "BattleMatch"("status", "createdAt");

-- Lottery entries and results
CREATE TABLE IF NOT EXISTS "LotteryEntry" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "poolId" TEXT NOT NULL,
  "poolName" VARCHAR(160) NOT NULL,
  "ticketCost" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LotteryEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LotteryEntry_userId_createdAt_idx" ON "LotteryEntry"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "LotteryEntry_poolId_createdAt_idx" ON "LotteryEntry"("poolId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'LotteryEntry_userId_fkey'
  ) THEN
    ALTER TABLE "LotteryEntry"
      ADD CONSTRAINT "LotteryEntry_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "LotteryResult" (
  "id" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "poolId" TEXT NOT NULL,
  "poolName" VARCHAR(160) NOT NULL,
  "position" INTEGER NOT NULL,
  "prize" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LotteryResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LotteryResult_entryId_key" ON "LotteryResult"("entryId");
CREATE INDEX IF NOT EXISTS "LotteryResult_userId_createdAt_idx" ON "LotteryResult"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "LotteryResult_poolId_createdAt_idx" ON "LotteryResult"("poolId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'LotteryResult_entryId_fkey'
  ) THEN
    ALTER TABLE "LotteryResult"
      ADD CONSTRAINT "LotteryResult_entryId_fkey"
      FOREIGN KEY ("entryId") REFERENCES "LotteryEntry"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'LotteryResult_userId_fkey'
  ) THEN
    ALTER TABLE "LotteryResult"
      ADD CONSTRAINT "LotteryResult_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
