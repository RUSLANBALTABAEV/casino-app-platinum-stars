import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const { userId, starsAmount } = await req.json();
  await prisma.starBalance.upsert({
    where: { userId: String(userId) },
    update: { available: { increment: starsAmount } },
    create: {
      userId: String(userId),
      available: starsAmount,
      reserved: 0,
      lifetimeEarn: starsAmount,
      lifetimeSpend: 0,
      bonusAvailable: 0,
      bonusReserved: 0,
      bonusLifetimeEarn: 0,
      bonusLifetimeSpend: 0,
    },
  });
  return NextResponse.json({ success: true });
}
