-- Add new statuses for NFT transfer flow
ALTER TYPE "NftGiftStatus" ADD VALUE 'PENDING_SEND';
ALTER TYPE "NftGiftStatus" ADD VALUE 'SENT';
