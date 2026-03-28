export function getTelegramInitData(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tg = (globalThis as any)?.Telegram?.WebApp;
  try {
    tg?.ready();
  } catch {
    // ignore
  }
  return typeof tg?.initData === 'string' ? tg.initData : '';
}











