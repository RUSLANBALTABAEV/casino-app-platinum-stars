import { NextResponse } from 'next/server';

export async function GET() {
  // Never expose diagnostic endpoints in production unless explicitly enabled.
  if (process.env.NODE_ENV === 'production' && process.env.DEBUG_API !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ message: 'API works!', timestamp: new Date().toISOString() });
}







