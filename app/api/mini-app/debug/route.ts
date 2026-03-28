import { NextRequest, NextResponse } from 'next/server';
import { isDemoRequest } from '@/lib/demo-mode';
import { verifyInitData, getBotToken, parseInitData } from '@/lib/telegram/init-data';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const raw = req.headers.get('x-telegram-init-data');
  const demo = isDemoRequest(req);
  
  let tokenExists = false;
  let tokenLength = 0;
  let verifyResult = false;
  let parseResult: Record<string, unknown> = {};
  let dbOk = false;
  let userCount = 0;

  try {
    const token = getBotToken();
    tokenExists = true;
    tokenLength = token.length;
    if (raw) {
      verifyResult = verifyInitData(raw, token);
      try { parseResult = parseInitData(raw) as unknown as Record<string, unknown>; } catch(e) { parseResult = { error: String(e) }; }
    }
  } catch(e) {
    parseResult = { tokenError: String(e) };
  }

  try {
    userCount = await prisma.user.count();
    dbOk = true;
  } catch(e) {
    parseResult = { ...parseResult, dbError: String(e) };
  }

  return NextResponse.json({
    demo,
    hasInitData: !!raw,
    initDataLength: raw?.length ?? 0,
    tokenExists,
    tokenLength,
    verifyResult,
    parseResult,
    dbOk,
    userCount,
    nodeEnv: process.env.NODE_ENV,
  });
}
