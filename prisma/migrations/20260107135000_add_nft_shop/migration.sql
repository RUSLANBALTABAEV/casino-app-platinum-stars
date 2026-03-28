-- Add NFT shop inventory + orders
CREATE TYPE "NftInventoryStatus" AS ENUM ('IN_STOCK', 'RESERVED', 'SENT');
CREATE TYPE "NftShopOrderStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'FULFILLED');
CREATE TYPE "NftShopOrderType" AS ENUM ('BUY', 'SELL');

CREATE TABLE "NftInventoryItem" (
  "id" TEXT NOT NULL,
  "giftId" TEXT NOT NULL,
  "status" "NftInventoryStatus" NOT NULL DEFAULT 'IN_STOCK',
  "telegramGiftId" VARCHAR(64),
  "source" VARCHAR(64),
  "notes" VARCHAR(256),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NftInventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NftShopOrder" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "giftId" TEXT NOT NULL,
  "type" "NftShopOrderType" NOT NULL DEFAULT 'BUY',
  "status" "NftShopOrderStatus" NOT NULL DEFAULT 'PENDING',
  "priceStars" INTEGER NOT NULL,
  "feeStars" INTEGER NOT NULL DEFAULT 0,
  "totalStars" INTEGER NOT NULL,
  "source" VARCHAR(32),
  "notes" VARCHAR(256),
  "metadata" JSONB,
  "assignedItemId" TEXT,
  "userGiftId" TEXT,
  "processedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  "fulfilledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NftShopOrder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NftInventoryItem_status_idx" ON "NftInventoryItem"("status");
CREATE INDEX "NftInventoryItem_giftId_status_idx" ON "NftInventoryItem"("giftId", "status");
CREATE INDEX "NftShopOrder_status_createdAt_idx" ON "NftShopOrder"("status", "createdAt");
CREATE INDEX "NftShopOrder_userId_createdAt_idx" ON "NftShopOrder"("userId", "createdAt");
CREATE INDEX "NftShopOrder_giftId_idx" ON "NftShopOrder"("giftId");

ALTER TABLE "NftInventoryItem" ADD CONSTRAINT "NftInventoryItem_giftId_fkey"
  FOREIGN KEY ("giftId") REFERENCES "NftGift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NftShopOrder" ADD CONSTRAINT "NftShopOrder_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NftShopOrder" ADD CONSTRAINT "NftShopOrder_giftId_fkey"
  FOREIGN KEY ("giftId") REFERENCES "NftGift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NftShopOrder" ADD CONSTRAINT "NftShopOrder_assignedItemId_fkey"
  FOREIGN KEY ("assignedItemId") REFERENCES "NftInventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NftShopOrder" ADD CONSTRAINT "NftShopOrder_userGiftId_fkey"
  FOREIGN KEY ("userGiftId") REFERENCES "UserNftGift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NftShopOrder" ADD CONSTRAINT "NftShopOrder_processedById_fkey"
  FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
