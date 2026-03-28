'use client';

import React, { useEffect, useState } from 'react';
import { useTelegram } from '@/context/TelegramContext';
import { buildTelegramAuthHeaders } from '@/lib/telegram';

type DebugResult = {
  demo: boolean; hasInitData: boolean; initDataLength: number;
  tokenExists: boolean; tokenLength: number; verifyResult: boolean;
  dbOk: boolean; userCount: number; nodeEnv: string;
  parseResult: Record<string, unknown>;
};
type GameTestResult = {
  success: boolean;
  result?: { win: boolean; payout: number; balance?: { available: number } };
  error?: string;
};

function readInitDataDirect(): string | null {
  if (typeof window === 'undefined') return null;
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.initData?.length > 10) return tg.initData;
  const proxy = (window as any).TelegramWebviewProxy;
  if (proxy?.initData?.length > 10) return proxy.initData;
  return null;
}

export default function DebugPage(): React.JSX.Element {
  const { initDataRaw, isReady } = useTelegram();
  const [directRaw] = useState(() => readInitDataDirect());
  const [auth, setAuth] = useState<DebugResult | null>(null);
  const [gameTest, setGameTest] = useState<GameTestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [gameLoading, setGameLoading] = useState(false);

  const bestRaw = initDataRaw || directRaw || undefined;

  useEffect(() => {
    if (!isReady) return;
    setLoading(true);
    fetch('/api/mini-app/debug', { headers: buildTelegramAuthHeaders(bestRaw) })
      .then(r => r.json()).then(d => setAuth(d as DebugResult))
      .catch(e => setAuth({ demo: false, hasInitData: false, initDataLength: 0, tokenExists: false, tokenLength: 0, verifyResult: false, dbOk: false, userCount: 0, nodeEnv: 'error', parseResult: { error: String(e) } }))
      .finally(() => setLoading(false));
  }, [isReady, bestRaw]);

  const testGame = async () => {
    setGameLoading(true); setGameTest(null);
    try {
      const res = await fetch('/api/mini-app/games/coinflip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildTelegramAuthHeaders(bestRaw) },
        body: JSON.stringify({ bet: 1, choice: 'heads' })
      });
      const data = await res.json() as GameTestResult;
      setGameTest({ ...data, success: res.ok });
    } catch (e) {
      setGameTest({ success: false, error: String(e) });
    } finally { setGameLoading(false); }
  };

  const row = (label: string, value: unknown, ok?: boolean) => (
    <div key={label} className="flex items-center justify-between py-2 border-b border-white/5">
      <span className="text-xs text-white/60">{label}</span>
      <span className={`text-xs font-bold ${ok === true ? 'text-emerald-400' : ok === false ? 'text-red-400' : 'text-yellow-400'}`}>
        {String(value)}
      </span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#08080c] p-4 space-y-4 text-white">
      <h1 className="text-xl font-extrabold text-yellow-400">🔧 Диагностика</h1>
      <div className="rounded-2xl border border-white/10 bg-white/3 p-4 space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-2">Клиент</p>
        {row('isReady', isReady, isReady)}
        {row('initDataRaw (hook)', initDataRaw ? `✓ ${initDataRaw.length}ch` : '✗ пусто', !!initDataRaw)}
        {row('initDataRaw (direct)', directRaw ? `✓ ${directRaw.length}ch` : '✗ пусто', !!directRaw)}
        {row('bestRaw используем', bestRaw ? `✓ ${bestRaw.length}ch` : '✗ нет', !!bestRaw)}
        {row('window.Telegram', typeof window !== 'undefined' ? String(!!(window as any).Telegram) : 'ssr', !!(typeof window !== 'undefined' && (window as any).Telegram))}
        {row('WebApp.initData', typeof window !== 'undefined' ? String(!!((window as any).Telegram?.WebApp?.initData)) : 'ssr')}
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/3 p-4 space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-2">Сервер</p>
        {loading && <p className="text-yellow-400 text-sm animate-pulse">⏳ Загрузка...</p>}
        {auth && (
          <>
            {row('demo', auth.demo, !auth.demo)}
            {row('hasInitData', auth.hasInitData, auth.hasInitData)}
            {row('verifyResult', auth.verifyResult, auth.verifyResult)}
            {row('dbOk', auth.dbOk, auth.dbOk)}
            {row('userCount', auth.userCount)}
            {row('nodeEnv', auth.nodeEnv)}
          </>
        )}
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/3 p-4 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Тест Coinflip (1★)</p>
        <button type="button" onClick={() => void testGame()} disabled={gameLoading || !bestRaw}
          className="w-full rounded-xl py-3 text-sm font-bold disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#fbbf24,#d97706)', color: '#000' }}>
          {gameLoading ? '⏳...' : !bestRaw ? '⚠️ Нет initData' : '▶ Тест'}
        </button>
        {gameTest && (
          <div className="space-y-1">
            {row('success', gameTest.success, gameTest.success)}
            {gameTest.error && row('error', gameTest.error, false)}
            {gameTest.result && (
              <>
                {row('win', gameTest.result.win)}
                {row('payout', gameTest.result.payout)}
                {row('balance', gameTest.result.balance?.available ?? '—')}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
