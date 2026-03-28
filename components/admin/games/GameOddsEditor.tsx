'use client';

import React, { useState, useCallback, useMemo } from 'react';

type GameConfig = {
  winChance?: number; multiplier?: number; drawChance?: number;
  nftChance?: number; nftGiftIds?: string[]; baseBet?: number;
  maxMultiplier?: number; stepMultiplier?: number;
  minMines?: number; maxMines?: number;
  minPlayers?: number; maxPlayers?: number;
  winnerTakesAll?: boolean; requiredCount?: number;
  autoCashout?: number; roundDelay?: number;
};

type Field = {
  key: keyof GameConfig;
  label: string;
  type: 'percent' | 'number' | 'toggle';
  min?: number; max?: number; step?: number; hint?: string;
};

type GameOddsEditorProps = {
  gameType: string; gameLabel: string;
  initialConfig: string;
  action: (formData: FormData) => Promise<void>;
  isDisabled?: boolean;
};

const GAME_FIELDS: Record<string, Field[]> = {
  COINFLIP: [
    { key: 'winChance',  label: 'Шанс победы',        type: 'percent', min: 1,  max: 99,  step: 1,   hint: 'Вероятность выигрыша (%). RTP = winChance × multiplier' },
    { key: 'multiplier', label: 'Множитель выигрыша',  type: 'number',  min: 1.1,max: 5,   step: 0.05,hint: 'Во сколько раз увеличивается ставка при победе' },
    { key: 'nftChance',  label: 'Шанс NFT (%)',        type: 'percent', min: 0,  max: 10,  step: 0.1, hint: 'Дополнительный шанс выпадения NFT-подарка' },
  ],
  UPGRADE: [
    { key: 'winChance',  label: 'Шанс апгрейда',       type: 'percent', min: 1,  max: 99,  step: 1,   hint: 'Вероятность успешного апгрейда (%)' },
    { key: 'multiplier', label: 'Множитель выигрыша',  type: 'number',  min: 1.1,max: 5,   step: 0.05,hint: 'Во сколько раз увеличивается ставка' },
    { key: 'nftChance',  label: 'Шанс NFT (%)',        type: 'percent', min: 0,  max: 10,  step: 0.1, hint: 'Шанс выпадения NFT-подарка' },
  ],
  TICTACTOE: [
    { key: 'winChance',  label: 'Шанс победы',         type: 'percent', min: 1,  max: 90,  step: 1,   hint: 'Вероятность победы игрока (%)' },
    { key: 'drawChance', label: 'Шанс ничьей',         type: 'percent', min: 0,  max: 40,  step: 1,   hint: 'Вероятность ничьей (ставка возвращается)' },
    { key: 'multiplier', label: 'Множитель выигрыша',  type: 'number',  min: 1.1,max: 5,   step: 0.1, hint: 'Множитель при победе' },
  ],
  MINES: [
    { key: 'maxMultiplier',  label: 'Макс. множитель',   type: 'number',  min: 5,  max: 50,  step: 1,   hint: 'Максимальный множитель при полном прохождении' },
    { key: 'stepMultiplier', label: 'Шаг множителя',     type: 'number',  min: 0.1,max: 1,   step: 0.05,hint: 'Прирост за каждый шаг' },
    { key: 'minMines',       label: 'Мин. мин на поле',  type: 'number',  min: 1,  max: 10,  step: 1,   hint: 'Минимум мин (выбирает игрок)' },
    { key: 'maxMines',       label: 'Макс. мин на поле', type: 'number',  min: 5,  max: 20,  step: 1,   hint: 'Максимум мин (выбирает игрок)' },
    { key: 'nftChance',      label: 'Шанс NFT (%)',      type: 'percent', min: 0,  max: 10,  step: 0.1, hint: 'Шанс получить NFT при выводе' },
  ],
  CRASH: [
    { key: 'maxMultiplier', label: 'Макс. множитель',        type: 'number',  min: 5,  max: 100, step: 1,   hint: 'Потолок множителя до краша' },
    { key: 'baseBet',       label: 'Мин. ставка (★)',        type: 'number',  min: 1,  max: 100, step: 1,   hint: 'Минимальная ставка' },
    { key: 'autoCashout',   label: 'Авто-кешаут по умолч.',  type: 'number',  min: 1.1,max: 10,  step: 0.1, hint: 'Множитель авто-вывода' },
    { key: 'roundDelay',    label: 'Пауза между раундами (с)',type: 'number',  min: 1,  max: 30,  step: 1,   hint: 'Секунды паузы' },
  ],
  BATTLE: [
    { key: 'minPlayers',     label: 'Мин. игроков',         type: 'number',  min: 2,  max: 10,  step: 1,   hint: 'Минимум участников' },
    { key: 'maxPlayers',     label: 'Макс. игроков',        type: 'number',  min: 2,  max: 20,  step: 1,   hint: 'Максимум участников' },
    { key: 'winnerTakesAll', label: 'Победитель берёт всё', type: 'toggle',                                hint: 'Весь банк достаётся победителю' },
  ],
  CRAFT: [
    { key: 'requiredCount', label: 'Требуемых предметов', type: 'number', min: 2, max: 10, step: 1, hint: 'Сколько NFT нужно для крафта' },
  ],
};

// RTP = win% × multiplier (for simple games)
function calcRTP(winChance?: number, multiplier?: number): number | null {
  if (typeof winChance !== 'number' || typeof multiplier !== 'number') return null;
  return Math.round(winChance * multiplier * 100) / 100;
}

function getRTPColor(rtp: number): string {
  if (rtp >= 0.97) return '#34d399'; // green — very fair
  if (rtp >= 0.93) return '#fbbf24'; // gold — normal
  if (rtp >= 0.88) return '#fb923c'; // orange — aggressive
  return '#f87171'; // red — too aggressive
}

function getRTPLabel(rtp: number): string {
  if (rtp >= 0.97) return 'Очень честно';
  if (rtp >= 0.93) return 'Нормально';
  if (rtp >= 0.88) return 'Агрессивно';
  return 'Очень агрессивно';
}

export function GameOddsEditor({
  gameType, gameLabel, initialConfig, action, isDisabled = false
}: GameOddsEditorProps): React.JSX.Element {
  const [config, setConfig] = useState<GameConfig>(() => {
    try { return JSON.parse(initialConfig) as GameConfig; } catch { return {}; }
  });
  const [isPending, setIsPending] = useState(false);
  const [saved, setSaved] = useState(false);

  const fields = GAME_FIELDS[gameType] ?? [];

  const rtp = useMemo(() => calcRTP(config.winChance, config.multiplier), [config.winChance, config.multiplier]);
  const houseEdge = rtp !== null ? Math.round((1 - rtp) * 1000) / 10 : null;

  const handleChange = useCallback((key: keyof GameConfig, value: number | boolean) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    setSaved(false);
    const fd = new FormData();
    fd.set('gameType', gameType);
    fd.set('gameConfig', JSON.stringify(config));
    try { await action(fd); setSaved(true); }
    catch (err) { console.error(err); }
    finally { setIsPending(false); }
  };

  const getVal = (key: keyof GameConfig, type: string): number => {
    const v = config[key];
    if (typeof v !== 'number') return 0;
    return type === 'percent' ? Math.round(v * 100) : v;
  };

  const setVal = (key: keyof GameConfig, type: string, v: number) => {
    handleChange(key, type === 'percent' ? v / 100 : v);
  };

  return (
    <form onSubmit={handleSubmit}
      className="overflow-hidden rounded-2xl border border-white/10"
      style={{ background: 'linear-gradient(135deg,#0d0d12,#0a0a0f)' }}>

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <div>
          <h3 className="text-sm font-extrabold text-white">{gameLabel}</h3>
          {rtp !== null && houseEdge !== null && (
            <div className="mt-1 flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: getRTPColor(rtp) }}>
                RTP {(rtp * 100).toFixed(1)}% — {getRTPLabel(rtp)}
              </span>
              <span className="text-[10px] text-white/30">
                Казино: {houseEdge}%
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">✓ Сохранено</span>}
          <button type="submit" disabled={isDisabled || isPending}
            className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-yellow-300 transition hover:bg-yellow-500/20 disabled:opacity-40">
            {isPending ? '⏳' : 'Сохранить'}
          </button>
        </div>
      </div>

      {/* RTP Visual Bar */}
      {rtp !== null && (
        <div className="px-5 pt-4">
          <div className="flex justify-between text-[9px] text-white/40 mb-1">
            <span>Выигрыш игрока</span>
            <span>RTP {(rtp * 100).toFixed(1)}%</span>
            <span>Казино {((1 - rtp) * 100).toFixed(1)}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-white/8">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${rtp * 100}%`, background: getRTPColor(rtp) }} />
          </div>
          <div className="mt-1 flex justify-between text-[9px]">
            <span style={{ color: getRTPColor(rtp) }}>
              Побед: {Math.round((config.winChance ?? 0) * 100)}%
            </span>
            <span className="text-red-400">
              Поражений: {Math.round((1 - (config.winChance ?? 0) - (config.drawChance ?? 0)) * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* Fields */}
      <div className="space-y-5 px-5 py-4">
        {fields.map(field => (
          <div key={field.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-white/70">{field.label}</label>
              {field.type !== 'toggle' && (
                <span className="text-sm font-extrabold text-yellow-400">
                  {field.type === 'percent'
                    ? `${getVal(field.key, field.type)}%`
                    : getVal(field.key, field.type)}
                </span>
              )}
            </div>

            {field.type !== 'toggle' ? (
              <div className="flex items-center gap-3">
                <input type="range"
                  min={field.min ?? 0}
                  max={field.type === 'percent' ? (field.max ?? 100) : (field.max ?? 10)}
                  step={field.step ?? 1}
                  value={getVal(field.key, field.type)}
                  onChange={e => setVal(field.key, field.type, parseFloat(e.target.value))}
                  disabled={isDisabled}
                  className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-yellow-400 disabled:opacity-50"
                />
                <input type="number"
                  min={field.min ?? 0}
                  max={field.type === 'percent' ? (field.max ?? 100) : (field.max ?? 10)}
                  step={field.step ?? 1}
                  value={getVal(field.key, field.type)}
                  onChange={e => setVal(field.key, field.type, parseFloat(e.target.value) || 0)}
                  disabled={isDisabled}
                  className="w-20 rounded-xl border border-white/10 bg-black/30 px-2 py-1.5 text-center text-sm font-bold text-white focus:border-yellow-500/40 focus:outline-none disabled:opacity-50"
                />
              </div>
            ) : (
              <button type="button"
                onClick={() => handleChange(field.key, !config[field.key])}
                disabled={isDisabled}
                className="relative h-7 w-14 rounded-full transition-colors disabled:opacity-50"
                style={{ background: config[field.key] ? '#fbbf24' : 'rgba(255,255,255,0.15)' }}>
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${config[field.key] ? 'left-8' : 'left-1'}`} />
              </button>
            )}

            {field.hint && <p className="text-[10px] text-white/30">{field.hint}</p>}
          </div>
        ))}
      </div>

      {/* RTP Recommendations */}
      {rtp !== null && (
        <div className="border-t border-white/8 px-5 py-3 text-[10px] text-white/40">
          <span className="font-bold text-white/60">Рекомендации: </span>
          <span style={{ color: '#34d399' }}>97%+ — честно</span>
          {' · '}
          <span style={{ color: '#fbbf24' }}>93–97% — стандарт</span>
          {' · '}
          <span style={{ color: '#fb923c' }}>88–93% — агрессивно</span>
          {' · '}
          <span style={{ color: '#f87171' }}>{'<'}88% — слишком много для казино</span>
        </div>
      )}

      <input type="hidden" name="gameType" value={gameType} />
      <input type="hidden" name="gameConfig" value={JSON.stringify(config)} />
    </form>
  );
}
