import { NextResponse } from "next/server";

const RATE_LIMIT = new Map<string, { count: number; timestamp: number }>();
const WINDOW_MS = 60000; // 1 минута
const MAX_REQUESTS = 30; // нормальная скорость игры

export function rateLimit(userId: string) {
  const now = Date.now();
  const record = RATE_LIMIT.get(userId) || { count: 0, timestamp: now };

  if (now - record.timestamp > WINDOW_MS) {
    record.count = 0;
    record.timestamp = now;
  }

  if (record.count >= MAX_REQUESTS) {
    return NextResponse.json({ error: "Подождите 1 минуту" }, { status: 429 });
  }

  record.count++;
  RATE_LIMIT.set(userId, record);
  return null; // разрешено
}
