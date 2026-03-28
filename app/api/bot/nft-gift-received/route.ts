import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logSecurityEvent } from "@/lib/services/security";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-internal-secret");
  const expectedSecret = process.env.BACKEND_INTERNAL_SECRET || process.env.BOT_INTERNAL_SECRET;
  if (expectedSecret && secret !== expectedSecret) {
    console.error('[NFT-GIFT] Unauthorized: secret mismatch', { received: secret?.slice(0,8), expected: expectedSecret?.slice(0,8) });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { telegramId: number; giftId?: string; stickerId?: string; giftName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { telegramId, giftId, stickerId, giftName = "NFT" } = body;
  if (!telegramId) {
    return NextResponse.json({ error: "telegramId required" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Find NFT in catalog by telegramGiftId / stickerId
    let nftGift = null;
    const searchIds = [stickerId, giftId].filter(Boolean) as string[];
    if (searchIds.length > 0) {
      nftGift = await prisma.nftGift.findFirst({
        where: { telegramGiftId: { in: searchIds }, isActive: true }
      });
    }

    // Get or create placeholder NFT entry
    const nftEntry = nftGift ?? await (async () => {
      const existing = await prisma.nftGift.findFirst({
        where: { name: giftName, isActive: false }
      });
      if (existing) return existing;
      return prisma.nftGift.create({
        data: {
          name: giftName,
          rarity: "common",
          isActive: false,
          description: "Получен как Telegram-подарок",
          ...(stickerId ? { telegramGiftId: stickerId } : {}),
        }
      });
    })();

    const starsCredited = nftGift?.priceStars ?? 0;

    // Create userNftGift record
    const userGift = await prisma.userNftGift.create({
      data: {
        userId: user.id,
        giftId: nftEntry.id,
        status: "OWNED",
        source: "TELEGRAM_GIFT",
        metadata: {
          telegramGiftId: giftId ?? null,
          stickerId: stickerId ?? null,
          receivedAt: new Date().toISOString()
        }
      }
    });

    // Credit stars if mapped
    if (starsCredited > 0) {
      await prisma.$transaction([
        prisma.starBalance.upsert({
          where: { userId: user.id },
          update: {
            available: { increment: starsCredited },
            lifetimeEarn: { increment: starsCredited }
          },
          create: {
            userId: user.id,
            available: starsCredited,
            lifetimeEarn: starsCredited
          }
        }),
        prisma.transaction.create({
          data: {
            userId: user.id,
            type: "REWARD",
            amount: starsCredited,
            currency: "STARS",
            provider: "MANUAL",
            status: "COMPLETED",
            meta: {
              source: "NFT_GIFT_RECEIVED",
              giftName,
              telegramGiftId: giftId ?? null,
              userGiftId: userGift.id
            }
          }
        })
      ]);
    }

    await logSecurityEvent({
      type: "NFT_GIFT_RECEIVED",
      severity: "INFO",
      message: `Получен NFT-подарок: ${giftName}, зачислено ${starsCredited} звёзд`,
      userId: user.id,
      metadata: { telegramId, giftId, stickerId, starsCredited }
    });

    return NextResponse.json({
      ok: true,
      userGiftId: userGift.id,
      giftName: nftEntry.name,
      starsCredited
    });
  } catch (err) {
    console.error("[NFT-GIFT-RECEIVED]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
