import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ⚠️ node-cron НЕ работает в Next.js standalone!
// Настройте Amvera Cron Jobs: POST /api/withdraw/auto каждые 5 минут
// Заголовок: x-cron-secret: <CRON_SECRET>

export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pending = await prisma.withdrawal.findMany({
    where: { status: "PENDING", amount: { lte: 1000 } },
  });

  let sent = 0;
  let moderation = 0;
  let errors = 0;

  for (const w of pending) {
    try {
      await prisma.withdrawal.update({
        where: { id: w.id },
        data: { status: "SENT", processedAt: new Date() },
      });
      sent++;
    } catch (e) {
      errors++;
      if (w.amount > 1000) {
        await prisma.withdrawal.update({
          where: { id: w.id },
          data: { status: "APPROVED" },
        });
        moderation++;
      }
    }
  }

  return NextResponse.json({ status: "done", sent, moderation, errors, total: pending.length });
}

export async function GET() {
  return NextResponse.json({ status: "OK" });
}
