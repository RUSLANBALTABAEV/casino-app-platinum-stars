'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useTelegram } from '@/context/TelegramContext';
import { useStarBalance } from '@/lib/hooks/useStarBalance';
import { getDefaultRouletteConfig, type RoulettePrizeDefinition, type RouletteVariant } from '@/lib/config/roulette-default';
import { buildTelegramAuthHeaders } from '@/lib/telegram';
import { isDemoModeEnabled } from '@/lib/demo-mode';

type GameMode = 'idle' | 'spinning' | 'paused';

type Prize = RoulettePrizeDefinition;

interface SlotReelFrame {
  top: Prize;
  middle: Prize;
  bottom: Prize;
}

type SlotWinningLine = 'top' | 'middle' | 'bottom' | 'diag-down' | 'diag-up';

interface HistoryEntry {
  title: string;
  subtitle: string;
  rewardType: Prize['rewardType'];
  value: number;
}

interface RouletteHistoryResponse {
  id: string;
  prizeName: string;
  rewardType: Prize['rewardType'];
  rewardValue: number;
  cost: number;
  variant: RouletteVariant;
  createdAt: string;
}

interface RouletteBalance {
  available: number;
  reserved: number;
  bonusAvailable?: number;
  bonusReserved?: number;
}

interface RouletteApiResponse {
  config: {
    spinCost: number;
    variant: RouletteVariant;
    sectors: Prize[];
    slots?: {
      stakeOptions: number[];
      compoundPercent: number;
      nftChance: number;
      nftGiftIds?: string[];
    };
  };
  history: RouletteHistoryResponse[];
  balance: RouletteBalance;
}

interface RouletteSpinResponse {
  result: {
    prize: Prize;
    prizeIndex: number;
    nftGift?: {
      id: string;
      name: string;
      rarity: string;
      imageUrl?: string | null;
    } | null;
    balance: RouletteBalance;
    historyEntry: RouletteHistoryResponse;
  };
  history: RouletteHistoryResponse[];
}

const DEFAULT_CONFIG = getDefaultRouletteConfig();
const DEFAULT_SECTORS: readonly Prize[] = DEFAULT_CONFIG.sectors;
const POINTER_ANGLE = -Math.PI / 2; // top of the wheel
const SPIN_DURATION = 4.6;
const DEFAULT_SPIN_COST = DEFAULT_CONFIG.spinCost;
const DEFAULT_VARIANT: RouletteVariant = DEFAULT_CONFIG.variant;
const HISTORY_LIMIT = 6;

function easeOutCubic(t: number): number {
  const p = 1 - t;
  return 1 - p * p * p;
}

function pickRandomPrize(pool: Prize[]): Prize {
  if (!pool.length) {
    return { ...DEFAULT_SECTORS[0] };
  }
  const index = Math.floor(Math.random() * pool.length);
  return pool[index] ?? pool[0];
}

function buildSlotFrame(pool: Prize[], forced?: Partial<SlotReelFrame>): SlotReelFrame {
  const top = forced?.top ?? pickRandomPrize(pool);
  const middle = forced?.middle ?? pickRandomPrize(pool);
  const bottom = forced?.bottom ?? pickRandomPrize(pool);
  return {
    top,
    middle,
    bottom
  };
}

function createInitialSlotFrames(pool: Prize[]): SlotReelFrame[] {
  const source = pool.length > 0 ? pool : DEFAULT_SECTORS.map((sector) => ({ ...sector }));
  return [buildSlotFrame(source), buildSlotFrame(source), buildSlotFrame(source)];
}

function pickSlotLine(): SlotWinningLine {
  const lines: SlotWinningLine[] = ['top', 'middle', 'bottom', 'diag-down', 'diag-up'];
  return lines[Math.floor(Math.random() * lines.length)] ?? 'middle';
}

function buildSlotFramesWithLine(pool: Prize[], prize: Prize, line: SlotWinningLine): SlotReelFrame[] {
  const reels = [buildSlotFrame(pool), buildSlotFrame(pool), buildSlotFrame(pool)];
  const applyPrize = (reelIndex: number, position: keyof SlotReelFrame) => {
    reels[reelIndex] = { ...reels[reelIndex], [position]: prize };
  };
  switch (line) {
    case 'top':
      applyPrize(0, 'top');
      applyPrize(1, 'top');
      applyPrize(2, 'top');
      break;
    case 'middle':
      applyPrize(0, 'middle');
      applyPrize(1, 'middle');
      applyPrize(2, 'middle');
      break;
    case 'bottom':
      applyPrize(0, 'bottom');
      applyPrize(1, 'bottom');
      applyPrize(2, 'bottom');
      break;
    case 'diag-down':
      applyPrize(0, 'top');
      applyPrize(1, 'middle');
      applyPrize(2, 'bottom');
      break;
    case 'diag-up':
      applyPrize(0, 'bottom');
      applyPrize(1, 'middle');
      applyPrize(2, 'top');
      break;
  }
  return reels;
}

function buildPrizeGradient(prize: Prize): string {
  return `linear-gradient(135deg, ${prize.primary}, ${prize.secondary})`;
}

function getPrizeIcon(prize: Prize): string {
  if (prize.rewardType === 'stars') {
    if (prize.value >= 500) {
      return '💎';
    }
    if (prize.value >= 200) {
      return '🌟';
    }
    if (prize.value >= 60) {
      return '⭐️';
    }
    return '✨';
  }

  const iconMap: Record<string, string> = {
    'item-neon-cards': '🎴',
    'item-golden-vortex': '🌀',
    'item-lucky-charm': '🍀',
    'item-platinum-set': '🛡️',
    'item-casino-heart': '❤️'
  };

  return iconMap[prize.id] ?? '🎁';
}

function toHistoryEntry(entry: RouletteHistoryResponse): HistoryEntry {
  const timestamp = new Date(entry.createdAt);
  const formattedTime = Number.isNaN(timestamp.getTime())
    ? null
    : timestamp.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });

  const descriptor = entry.rewardType === 'stars' ? `Награда: +${entry.rewardValue} ★` : 'Награда: предмет';
  const segments = [`Ставка: ${entry.cost} ★`, descriptor];
  if (formattedTime) {
    segments.push(formattedTime);
  }

  return {
    title: entry.prizeName,
    subtitle: segments.join(' • '),
    rewardType: entry.rewardType,
    value: entry.rewardType === 'stars' ? entry.rewardValue : 0
  } satisfies HistoryEntry;
}

function mapHistoryEntries(entries: RouletteHistoryResponse[]): HistoryEntry[] {
  return entries.map(toHistoryEntry).slice(0, HISTORY_LIMIT);
}

export default function RouletteGame(): React.JSX.Element {
  const { initDataRaw } = useTelegram();
  const { refresh: refreshBalance } = useStarBalance();
  const [sectors, setSectors] = useState<Prize[]>(() => DEFAULT_SECTORS.map((sector) => ({ ...sector })));
  const sectorsRef = useRef<Prize[]>(DEFAULT_SECTORS.map((sector) => ({ ...sector })));
  const [spinCostValue, setSpinCostValue] = useState<number>(DEFAULT_SPIN_COST);
  const spinCostValueRef = useRef<number>(DEFAULT_SPIN_COST);
  const [variant, setVariant] = useState<RouletteVariant>(DEFAULT_VARIANT);
  const variantRef = useRef<RouletteVariant>(DEFAULT_VARIANT);
  const [slotStake, setSlotStake] = useState<number>(DEFAULT_CONFIG.slots?.stakeOptions?.[0] ?? DEFAULT_SPIN_COST);
  const slotStakeRef = useRef<number>(DEFAULT_CONFIG.slots?.stakeOptions?.[0] ?? DEFAULT_SPIN_COST);
  const [slotsConfig, setSlotsConfig] = useState<NonNullable<RouletteApiResponse['config']['slots']>>(
    DEFAULT_CONFIG.slots ?? { stakeOptions: [DEFAULT_SPIN_COST], compoundPercent: 0, nftChance: 0 }
  );

  useEffect(() => {
    slotStakeRef.current = slotStake;
  }, [slotStake]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<GameMode>('idle');
  const modeRef = useRef<GameMode>('idle');

  const [balance, setBalance] = useState<RouletteBalance>({ available: 0, reserved: 0 });
  const [spins, setSpins] = useState<number>(0);
  const [lastPrize, setLastPrize] = useState<Prize | null>(null);
  const [lastNft, setLastNft] = useState<RouletteSpinResponse['result']['nftGift'] | null>(null);
  const lastNftRef = useRef<RouletteSpinResponse['result']['nftGift'] | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isServerMode, setIsServerMode] = useState<boolean>(false);
  const [isAwaitingServer, setIsAwaitingServer] = useState<boolean>(false);
  const [isInfoOpen, setIsInfoOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [slotReels, setSlotReels] = useState<SlotReelFrame[]>(() =>
    createInitialSlotFrames(sectorsRef.current)
  );
  const [slotWinningLine, setSlotWinningLine] = useState<SlotWinningLine | null>(null);
  const slotWinningLineRef = useRef<SlotWinningLine | null>(null);
  const slotIntervalsRef = useRef<number[]>([]);
  const slotTimeoutsRef = useRef<number[]>([]);
  const awaitingServerResultRef = useRef<boolean>(false);
  const pendingBalanceRef = useRef<RouletteBalance | null>(null);
  const pendingHistoryRef = useRef<HistoryEntry[] | null>(null);
  const pendingSpinsRef = useRef<number | null>(null);

  const headers = useMemo(() => buildTelegramAuthHeaders(initDataRaw), [initDataRaw]);

  const dpr = useMemo<number>(() => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1), []);

  useEffect(() => {
    sectorsRef.current = sectors;
  }, [sectors]);

  useEffect(() => {
    spinCostValueRef.current = spinCostValue;
  }, [spinCostValue]);

  useEffect(() => {
    variantRef.current = variant;
  }, [variant]);

  useEffect(() => {
    if (variant === 'slots') {
      setSlotReels(createInitialSlotFrames(sectors));
      setSlotWinningLine(null);
    }
  }, [sectors, variant]);

  useEffect(() => {
    slotWinningLineRef.current = slotWinningLine;
  }, [slotWinningLine]);

  const selectPrize = useCallback((): { index: number; prize: Prize } => {
    const currentSectors = sectorsRef.current;
    if (currentSectors.length === 0) {
      const fallback = DEFAULT_SECTORS[0];
      return { index: 0, prize: fallback };
    }
    const totalWeight = currentSectors.reduce((sum, prize) => sum + prize.weight, 0);
    const roll = Math.random() * (totalWeight || 1);
    let cumulative = 0;
    for (let i = 0; i < currentSectors.length; i += 1) {
      cumulative += currentSectors[i].weight;
      if (roll <= cumulative) {
        return { index: i, prize: currentSectors[i] };
      }
    }
    const lastIndex = Math.max(currentSectors.length - 1, 0);
    return { index: lastIndex, prize: currentSectors[lastIndex] };
  }, []);

  const currentAngleRef = useRef<number>(0);
  const targetAngleRef = useRef<number>(0);
  const spinStartAngleRef = useRef<number>(0);
  const spinStartRef = useRef<number>(0);
  const spinElapsedRef = useRef<number>(0);
  const animationRef = useRef<number | null>(null);
  const resultRef = useRef<Prize | null>(null);

  const showToast = (message: string, duration = 2200) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, duration);
  };

  const stopSlotAnimations = useCallback(() => {
    if (slotIntervalsRef.current.length) {
      for (const interval of slotIntervalsRef.current) {
        window.clearInterval(interval);
      }
      slotIntervalsRef.current = [];
    }
    if (slotTimeoutsRef.current.length) {
      for (const timeout of slotTimeoutsRef.current) {
        window.clearTimeout(timeout);
      }
      slotTimeoutsRef.current = [];
    }
  }, []);

  useEffect(() => {
    if (variant !== 'slots') {
      stopSlotAnimations();
    }
  }, [variant, stopSlotAnimations]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      stopSlotAnimations();
    };
  }, [stopSlotAnimations]);

  const loadGameData = useCallback(
    async (signal?: AbortSignal) => {
      if (!initDataRaw) {
        if (!isDemoModeEnabled()) {
          setIsServerMode(false);
          setError(null);
          return;
        }
      }

      setIsLoading(true);
      setError(null);

      try {
        const authHeaders = buildTelegramAuthHeaders(initDataRaw);
        const response = await fetch('/api/mini-app/games/roulette', {
          headers: authHeaders,
          signal
        });

        const payload = (await response.json().catch(() => ({}))) as RouletteApiResponse & {
          error?: string;
        };

        if (!response.ok || !payload?.config) {
          throw new Error(payload?.error ?? 'Не удалось загрузить рулетку.');
        }

        if (payload.config.sectors?.length) {
          setSectors(payload.config.sectors.map((sector) => ({ ...sector })));
        }

        if (typeof payload.config.spinCost === 'number' && payload.config.spinCost > 0) {
          setSpinCostValue(payload.config.spinCost);
          spinCostValueRef.current = payload.config.spinCost;
        }

        if (payload.config.variant) {
          setVariant(payload.config.variant);
        }

        if (payload.config.slots) {
          const resolvedSlots = {
            stakeOptions: payload.config.slots.stakeOptions ?? [],
            compoundPercent: payload.config.slots.compoundPercent ?? 0,
            nftChance: payload.config.slots.nftChance ?? 0,
            nftGiftIds: payload.config.slots.nftGiftIds ?? []
          };
          setSlotsConfig(resolvedSlots);
          const defaultStake = resolvedSlots.stakeOptions[0] ?? payload.config.spinCost;
          setSlotStake(defaultStake);
          slotStakeRef.current = defaultStake;
        }

        if (payload.balance) {
          setBalance(payload.balance);
        }

        if (Array.isArray(payload.history)) {
          const mapped = mapHistoryEntries(payload.history);
          setHistory(mapped);
          setSpins(payload.history.length);
        } else {
          setHistory([]);
        }

        setIsServerMode(true);
      } catch (error) {
        if (signal?.aborted) {
          return;
        }
        setIsServerMode(false);
        setError(error instanceof Error ? error.message : 'Не удалось загрузить рулетку.');
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [headers, initDataRaw]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadGameData(controller.signal);
    return () => controller.abort();
  }, [loadGameData]);

  const requestServerSpin = useCallback(
    async (desiredVariant: RouletteVariant) => {
      if (!initDataRaw && !isDemoModeEnabled()) {
        throw new Error('Отсутствуют данные авторизации Telegram.');
      }

      const authHeaders = buildTelegramAuthHeaders(initDataRaw);
      console.log('[ROULETTE] Spinning with headers:', Object.keys(authHeaders));
      const response = await fetch('/api/mini-app/games/roulette', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({
          variant: desiredVariant,
          stake: desiredVariant === 'slots' ? slotStakeRef.current : undefined
        })
      });
      
      console.log('[ROULETTE] Response status:', response.status);

      const payload = (await response.json().catch((e) => {
        console.error('[ROULETTE] JSON parse error:', e);
        return {};
      })) as RouletteSpinResponse & {
        error?: string;
      };
      
      console.log('[ROULETTE] Response payload:', payload);

      if (!response.ok || payload.error) {
        const errorMsg = payload.error ?? 'Не удалось выполнить спин.';
        console.error('[ROULETTE] API error:', response.status, errorMsg);
        throw new Error(errorMsg);
      }

      pendingBalanceRef.current = payload.result.balance;
      pendingHistoryRef.current = Array.isArray(payload.history)
        ? mapHistoryEntries(payload.history)
        : null;
      pendingSpinsRef.current = Array.isArray(payload.history) ? payload.history.length : null;
      lastNftRef.current = payload.result.nftGift ?? null;
      setLastNft(payload.result.nftGift ?? null);

      return {
        prize: payload.result.prize,
        prizeIndex: payload.result.prizeIndex
      };
    },
    [headers, initDataRaw]
  );

  const pushHistory = useCallback((entry: HistoryEntry) => {
    setHistory((prev) => {
      const next = [entry, ...prev];
      return next.slice(0, HISTORY_LIMIT);
    });
  }, []);

  const applySpinOutcome = useCallback(
    (entry: HistoryEntry, reward: number) => {
      if (pendingBalanceRef.current) {
        setBalance(pendingBalanceRef.current);
        pendingBalanceRef.current = null;
      } else {
        setBalance((prev) => ({
          available:
            prev.available +
            reward -
            (variantRef.current === 'slots' ? slotStakeRef.current : spinCostValueRef.current),
          reserved: prev.reserved
        }));
      }

      if (pendingHistoryRef.current) {
        setHistory(pendingHistoryRef.current);
        pendingHistoryRef.current = null;
      } else {
        pushHistory(entry);
      }

      if (pendingSpinsRef.current !== null) {
        setSpins(pendingSpinsRef.current);
        pendingSpinsRef.current = null;
      } else {
        setSpins((prev) => prev + 1);
      }
    },
    [pushHistory]
  );

const handleResize = () => {
  const canvas = canvasRef.current;
  if (!canvas) {
    return;
  }
  const parent = canvas.parentElement;
  const width = parent?.clientWidth ?? window.innerWidth;
  const size = width > 0 ? width : window.innerWidth;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
};

  const drawWheel = (ctx: CanvasRenderingContext2D) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const radius = Math.min(width, height) / 2 - 8;
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const background = ctx.createRadialGradient(centerX, centerY, radius * 0.08, centerX, centerY, radius * 1.12);
    background.addColorStop(0, '#07070a');
    background.addColorStop(0.65, '#090a13');
    background.addColorStop(1, '#040408');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    ctx.translate(centerX, centerY);
    ctx.rotate(currentAngleRef.current);

    const wheelSectors = sectorsRef.current;
    const angle = (2 * Math.PI) / Math.max(wheelSectors.length, 1);

    for (let index = 0; index < wheelSectors.length; index += 1) {
      const prize = wheelSectors[index];
      const startAngle = index * angle;
      const endAngle = startAngle + angle;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, startAngle, endAngle);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(0, 0, radius, radius);
      gradient.addColorStop(0, prize.primary);
      gradient.addColorStop(1, prize.secondary);
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.strokeStyle = 'rgba(7,7,12,0.65)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.rotate(startAngle + angle / 2);
      ctx.translate(radius * 0.64, 0);
      ctx.rotate(Math.PI / 2);
      ctx.font = `${Math.max(22, radius * 0.12)}px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText(getPrizeIcon(prize), 0, 0);
      ctx.restore();
    }

    ctx.restore();

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(centerX, centerY);

    const innerRadius = radius * 0.38;
    ctx.beginPath();
    ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
    ctx.closePath();
    const innerGradient = ctx.createRadialGradient(0, 0, innerRadius * 0.1, 0, 0, innerRadius);
    innerGradient.addColorStop(0, 'rgba(10,11,18,1)');
    innerGradient.addColorStop(1, 'rgba(15,16,24,0.85)');
    ctx.fillStyle = innerGradient;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.stroke();

    ctx.restore();

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(centerX, centerY);
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(18, 24);
    ctx.lineTo(-18, 24);
    ctx.closePath();
    const pointerGradient = ctx.createLinearGradient(0, -28, 0, 24);
    pointerGradient.addColorStop(0, '#fef08a');
    pointerGradient.addColorStop(1, '#d4af37');
    ctx.fillStyle = pointerGradient;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(9,9,12,0.85)';
    ctx.stroke();
    ctx.restore();
  };

  const updateFrame = (timestamp: number) => {
    if (variantRef.current !== 'wheel') {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    if (modeRef.current === 'spinning') {
      const elapsed =
        spinElapsedRef.current + (timestamp - spinStartRef.current) / 1000;
      const progress = Math.min(elapsed / SPIN_DURATION, 1);
      const eased = easeOutCubic(progress);
      const startAngle = spinStartAngleRef.current;
      const targetAngle = targetAngleRef.current;
      currentAngleRef.current = startAngle + (targetAngle - startAngle) * eased;

      if (progress >= 1) {
        currentAngleRef.current = targetAngle;
        modeRef.current = 'idle';
        setMode('idle');
        const prize = resultRef.current;
        if (prize) {
          spinElapsedRef.current = 0;
          const reward = prize.rewardType === 'stars' ? prize.value : 0;
          const entry: HistoryEntry = {
            title: prize.name,
            subtitle: prize.description ?? 'Рулетка Star Casino',
            rewardType: prize.rewardType,
            value: prize.value
          };
          applySpinOutcome(entry, reward);
          setLastPrize(prize);
          showToast(
            prize.rewardType === 'stars'
              ? `+${prize.value} ★ к вашему балансу`
              : 'Новый предмет — добавлен в коллекцию',
            2600
          );
        }
      }
    }

    drawWheel(ctx);
    animationRef.current = window.requestAnimationFrame(updateFrame);
  };

  useEffect(() => {
    if (variant !== 'wheel') {
      if (animationRef.current) {
        window.cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      window.removeEventListener('resize', handleResize);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    handleResize();
    drawWheel(canvas.getContext('2d') as CanvasRenderingContext2D);
    animationRef.current = window.requestAnimationFrame(updateFrame);

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) {
        window.cancelAnimationFrame(animationRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  const spinWheel = async () => {
    if (modeRef.current === 'spinning' || awaitingServerResultRef.current) {
      showToast('Колесо уже вращается');
      return;
    }

    setLastNft(null);
    lastNftRef.current = null;
    if (balance.available < spinCostValueRef.current && !isServerMode) {
      showToast('Недостаточно звёзд для вращения');
      return;
    }

    const wheelSectors = sectorsRef.current;
    if (wheelSectors.length === 0) {
      showToast('Рулетка временно недоступна');
      return;
    }

    let prize: Prize;
    let prizeIndex: number;

    if (isServerMode && initDataRaw) {
      awaitingServerResultRef.current = true;
      setIsAwaitingServer(true);
      try {
        const serverResult = await requestServerSpin('wheel');
        prize = { ...serverResult.prize };
        prizeIndex = Math.min(serverResult.prizeIndex, wheelSectors.length - 1);
        setError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось выполнить спин.';
        setError(message);
        showToast(message);
        pendingBalanceRef.current = null;
        pendingHistoryRef.current = null;
        pendingSpinsRef.current = null;
        awaitingServerResultRef.current = false;
        setIsAwaitingServer(false);
        return;
      }
      awaitingServerResultRef.current = false;
      setIsAwaitingServer(false);
    } else {
      const selection = selectPrize();
      prize = selection.prize;
      prizeIndex = selection.index;
      pendingBalanceRef.current = null;
      pendingHistoryRef.current = null;
      pendingSpinsRef.current = null;
      setIsAwaitingServer(false);
    }

    resultRef.current = prize;

    const angle = (2 * Math.PI) / Math.max(wheelSectors.length, 1);
    const segmentAngleValue = prizeIndex * angle + angle / 2;
    const rotations = 4 + Math.random() * 2.5;
    const startAngle = currentAngleRef.current;
    const normalizedCurrent =
      ((startAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const alignment = POINTER_ANGLE - segmentAngleValue;
    const targetAngle =
      startAngle + rotations * (2 * Math.PI) + (alignment - normalizedCurrent);

    spinStartRef.current = window.performance.now();
    spinStartAngleRef.current = startAngle;
    targetAngleRef.current = targetAngle;
    spinElapsedRef.current = 0;

    modeRef.current = 'spinning';
    setMode('spinning');

    showToast('Колесо запущено!');
  };

  const finalizeSlotSpin = (prize: Prize) => {
    const reward = prize.rewardType === 'stars' ? prize.value : 0;
    const entry: HistoryEntry = {
      title: prize.name,
      subtitle: prize.description ?? 'Игровой автомат',
      rewardType: prize.rewardType,
      value: prize.value
    };

    setTimeout(() => {
      applySpinOutcome(entry, reward);
      setLastPrize(prize);
      modeRef.current = 'idle';
      setMode('idle');
      showToast(
        lastNftRef.current
          ? `NFT подарок: ${lastNftRef.current.name}`
          : prize.rewardType === 'stars'
            ? `+${prize.value} ★ к вашему балансу`
            : 'Новый предмет — добавлен в коллекцию',
        2600
      );
    }, 220);
  };

  const spinSlots = async () => {
    if (modeRef.current === 'spinning' || awaitingServerResultRef.current) {
      showToast('Барабаны уже вращаются');
      return;
    }

    setLastNft(null);
    lastNftRef.current = null;
    if (balance.available < slotStakeRef.current && !isServerMode) {
      showToast('Недостаточно звёзд для вращения');
      return;
    }

    const pool = sectorsRef.current.length
      ? sectorsRef.current
      : DEFAULT_SECTORS.map((sector) => ({ ...sector }));

    let prize: Prize;

    if (isServerMode && initDataRaw) {
      awaitingServerResultRef.current = true;
      setIsAwaitingServer(true);
      try {
        const serverResult = await requestServerSpin('slots');
        prize = { ...serverResult.prize };
        setError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось выполнить спин.';
        setError(message);
        showToast(message);
        pendingBalanceRef.current = null;
        pendingHistoryRef.current = null;
        pendingSpinsRef.current = null;
        awaitingServerResultRef.current = false;
        setIsAwaitingServer(false);
        return;
      }
      awaitingServerResultRef.current = false;
      setIsAwaitingServer(false);
    } else {
      const selection = selectPrize();
      prize = selection.prize;
      pendingBalanceRef.current = null;
      pendingHistoryRef.current = null;
      pendingSpinsRef.current = null;
      setIsAwaitingServer(false);
    }

    stopSlotAnimations();
    setSlotWinningLine(null);
    slotWinningLineRef.current = null;

    modeRef.current = 'spinning';
    setMode('spinning');
    setLastPrize(null);
    showToast('Запускаем барабаны!', 2000);

    const durations = [900, 1200, 1500];
    const line = pickSlotLine();

    durations.forEach((duration, index) => {
      const interval = window.setInterval(() => {
        setSlotReels((previous) => {
          const next = [...previous];
          next[index] = buildSlotFrame(pool);
          return next;
        });
      }, 90 + index * 20);
      slotIntervalsRef.current.push(interval);

      const timeout = window.setTimeout(() => {
        window.clearInterval(interval);
        slotIntervalsRef.current = slotIntervalsRef.current.filter((value) => value !== interval);
        setSlotReels((previous) => {
          const next = [...previous];
          const centerPrize = index === 1 ? prize : undefined;
          next[index] = buildSlotFrame(pool, centerPrize ? { middle: centerPrize } : undefined);
          return next;
        });

        if (index === durations.length - 1) {
          setSlotReels(buildSlotFramesWithLine(pool, prize, line));
          setSlotWinningLine(line);
          finalizeSlotSpin(prize);
        }
        slotTimeoutsRef.current = slotTimeoutsRef.current.filter((value) => value !== timeout);
      }, duration);

      slotTimeoutsRef.current.push(timeout);
    });
  };

  const pauseGame = () => {
    if (modeRef.current !== 'spinning') {
      showToast('Колесо не вращается');
      return;
    }
    spinElapsedRef.current += (window.performance.now() - spinStartRef.current) / 1000;
    modeRef.current = 'paused';
    setMode('paused');
    showToast('Пауза');
  };

  const resumeGame = () => {
    if (modeRef.current !== 'paused') {
      return;
    }
    modeRef.current = 'spinning';
    setMode('spinning');
    showToast('Продолжаем вращение');
    spinStartRef.current = window.performance.now();
  };

  const clearHistory = () => {
    setHistory([]);
    showToast('История очищена');
  };

  const renderHistoryItems = (): React.ReactNode => {
    if (history.length === 0) {
      return (
        <p className="text-xs uppercase tracking-[0.16em] text-white/40">
          Начните вращение, чтобы увидеть результаты.
        </p>
      );
    }

    return history.map((entry, index) => (
      <div
        key={`${entry.title}-${index.toString()}`}
        className="rounded-2xl border border-white/10 bg-white/8 p-3 shadow-[0_12px_24px_rgba(6,7,11,0.45)]"
      >
        <p className="text-sm font-semibold text-white">{entry.title}</p>
        <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">
          {entry.subtitle}
        </p>
        {entry.rewardType === 'stars' ? (
          <p className="pt-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#facc15]">
            +{entry.value} ★
          </p>
        ) : (
          <p className="pt-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#c084fc]">
            Добавлено в коллекцию
          </p>
        )}
      </div>
    ));
  };

  const slotRows = useMemo(() => {
    const reelA = slotReels[0];
    const reelB = slotReels[1];
    const reelC = slotReels[2];
    if (!reelA || !reelB || !reelC) {
      return [];
    }
    return [
      [reelA.top, reelB.top, reelC.top],
      [reelA.middle, reelB.middle, reelC.middle],
      [reelA.bottom, reelB.bottom, reelC.bottom]
    ];
  }, [slotReels]);

  const winningCells = useMemo(() => {
    if (!slotWinningLine) {
      return new Set<string>();
    }
    const cells = new Set<string>();
    switch (slotWinningLine) {
      case 'top':
        cells.add('0-0');
        cells.add('0-1');
        cells.add('0-2');
        break;
      case 'middle':
        cells.add('1-0');
        cells.add('1-1');
        cells.add('1-2');
        break;
      case 'bottom':
        cells.add('2-0');
        cells.add('2-1');
        cells.add('2-2');
        break;
      case 'diag-down':
        cells.add('0-0');
        cells.add('1-1');
        cells.add('2-2');
        break;
      case 'diag-up':
        cells.add('2-0');
        cells.add('1-1');
        cells.add('0-2');
        break;
    }
    return cells;
  }, [slotWinningLine]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden text-white">
      {/* Компактный хедер */}
      <div className="flex items-center justify-between px-2 py-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-white/20 bg-black/40 px-2 py-1 backdrop-blur-sm">
            <span className="text-[10px] uppercase tracking-wider text-white/60">Баланс</span>
            <div className="text-sm font-bold text-white">{balance.available} ★</div>
          </div>
          {/* Variant tab switcher */}
          <div className="flex rounded-lg border border-white/20 bg-black/40 overflow-hidden">
            <button
              type="button"
              onClick={() => { if (mode !== 'spinning') setVariant('wheel'); }}
              className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${variant === 'wheel' ? 'bg-yellow-400/20 text-yellow-300' : 'text-white/50 hover:text-white/80'}`}
            >
              🎡 Колесо
            </button>
            <div className="w-px bg-white/15" />
            <button
              type="button"
              onClick={() => { if (mode !== 'spinning') setVariant('slots'); }}
              className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${variant === 'slots' ? 'bg-yellow-400/20 text-yellow-300' : 'text-white/50 hover:text-white/80'}`}
            >
              🎰 Слоты
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="rounded-lg border border-white/20 bg-black/40 px-2 py-1 backdrop-blur-sm">
            <span className="text-[10px] uppercase tracking-wider text-white/60">Спинов</span>
            <div className="text-xs font-bold text-white">{spins}</div>
          </div>
          <button
            aria-label={isInfoOpen ? 'Скрыть меню' : 'Открыть меню'}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-black/40 text-white/80 backdrop-blur-sm transition hover:text-white active:scale-95"
            onClick={() => setIsInfoOpen((prev) => !prev)}
            type="button"
          >
            <span className="text-base leading-none">⋯</span>
          </button>
        </div>
      </div>

      {/* Игровое поле - занимает большую часть экрана */}
      <div className="relative flex-1 overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-b from-[#0a0d1a] to-[#050509] shadow-[0_0_40px_rgba(0,0,0,0.5)]">
        {variant === 'wheel' ? (
          <div className="flex h-full w-full items-center justify-center p-2">
            <canvas ref={canvasRef} className="h-full w-full max-h-[calc(100svh-200px)] max-w-full touch-none select-none" />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-3">
            {/* Slot machine */}
            <div className="relative w-full rounded-2xl overflow-hidden border border-white/15"
              style={{ background: 'linear-gradient(180deg, #0a0e1a 0%, #060810 100%)', boxShadow: 'inset 0 2px 20px rgba(0,0,0,0.5)' }}>
              {/* Fades */}
              <div className="pointer-events-none absolute top-0 inset-x-0 h-10 z-10"
                style={{ background: 'linear-gradient(180deg, #060810 0%, transparent 100%)' }} />
              <div className="pointer-events-none absolute bottom-0 inset-x-0 h-10 z-10"
                style={{ background: 'linear-gradient(0deg, #060810 0%, transparent 100%)' }} />
              {/* Center win line */}
              <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 top-1/2 -translate-y-1/2"
                style={{ background: slotWinningLine === 'middle' ? 'rgba(250,204,21,0.8)' : 'rgba(255,255,255,0.1)' }} />
              {/* Reels */}
              <div className="grid grid-cols-3 gap-0.5 p-1">
                {[0, 1, 2].map((reelIdx) => {
                  const reel = slotReels[reelIdx];
                  const cells = reel ? [reel.top, reel.middle, reel.bottom] : [];
                  return (
                    <div key={reelIdx} className="relative flex flex-col overflow-hidden rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.04)' }}>
                      {cells.map((cell, rowIdx) => {
                        const winKey = `${rowIdx}-${reelIdx}`;
                        const isWin = winningCells.has(winKey);
                        return (
                          <div key={rowIdx}
                            className="flex flex-col items-center justify-center py-3 transition-all"
                            style={{
                              background: isWin
                                ? 'linear-gradient(135deg,rgba(250,204,21,0.25),rgba(250,204,21,0.1))'
                                : buildPrizeGradient(cell),
                              borderBottom: rowIdx < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                              boxShadow: isWin ? '0 0 20px rgba(250,204,21,0.4)' : 'none',
                            }}>
                            <span className={`leading-none drop-shadow text-[1.5rem] ${mode === 'spinning' ? 'blur-[1px] opacity-70' : ''}`}>
                              {getPrizeIcon(cell)}
                            </span>
                            <span className="mt-1 text-[9px] font-bold uppercase tracking-wider text-white/70">
                              {cell.rewardType === 'stars' ? `${cell.value}★` : '🎁'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              {/* Win border flash */}
              {slotWinningLine && mode !== 'spinning' && (
                <div className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-yellow-400/60 animate-pulse"
                  style={{ boxShadow: '0 0 40px rgba(250,204,21,0.3)' }} />
              )}
            </div>
            {/* Win line indicators */}
            <div className="flex gap-1.5 text-[9px] uppercase tracking-wider">
              {(['top','middle','bottom','diag-down','diag-up'] as const).map(line => (
                <span key={line} className="px-1.5 py-0.5 rounded border transition-all"
                  style={{
                    background: slotWinningLine === line ? 'rgba(250,204,21,0.15)' : 'rgba(255,255,255,0.04)',
                    borderColor: slotWinningLine === line ? 'rgba(250,204,21,0.5)' : 'rgba(255,255,255,0.1)',
                    color: slotWinningLine === line ? '#fcd34d' : 'rgba(255,255,255,0.4)',
                  }}>
                  {line === 'top' ? '↑' : line === 'middle' ? '—' : line === 'bottom' ? '↓' : line === 'diag-down' ? '↘' : '↗'}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Overlay для паузы */}
        {mode === 'paused' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="rounded-2xl border border-white/20 bg-black/80 px-6 py-4 backdrop-blur-md animate-pulse">
              <div className="text-center text-lg font-bold text-white">Пауза</div>
            </div>
          </div>
        )}
      </div>

      {/* Компактная панель управления */}
      <div className="flex flex-col gap-2 px-2 py-2">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-white/50">
          <span>Стоимость: {variant === 'slots' ? slotStake : spinCostValue} ★</span>
          {lastPrize && (
            <span className="flex items-center gap-1">
              <span>Последний:</span>
              <span className="text-lg">{getPrizeIcon(lastPrize)}</span>
            </span>
          )}
        </div>

        {/* NFT win popup for slots */}
        {variant === 'slots' && lastNft && (
          <div
            className="mb-1 flex items-center gap-3 overflow-hidden rounded-xl border border-emerald-400/40 px-3 py-2.5"
            style={{
              background: 'linear-gradient(135deg,rgba(52,211,153,0.18),rgba(16,185,129,0.06))',
              boxShadow: '0 0 30px rgba(52,211,153,0.2)',
              animation: 'nftSlotPop 0.5s cubic-bezier(0.16,0.9,0.22,1) forwards',
            }}
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-xl">
              {lastNft.imageUrl ? (
                <img src={lastNft.imageUrl} alt={lastNft.name} className="h-full w-full rounded-lg object-cover" />
              ) : '🎁'}
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-emerald-400">🎉 NFT Подарок!</p>
              <p className="text-sm font-bold text-white truncate">{lastNft.name}</p>
              <p className="text-[9px] uppercase tracking-wider text-emerald-300">{lastNft.rarity}</p>
            </div>
          </div>
        )}
        {variant === 'slots' ? (
          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-white/55">
            <span>Сложный +{slotsConfig.compoundPercent}%</span>
            <span>Шанс NFT {slotsConfig.nftChance}%</span>
            <div className="flex flex-wrap gap-2">
              {slotsConfig.stakeOptions.map((option) => {
                const isActive = option === slotStake;
                return (
                  <button
                    key={option}
                    className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
                      isActive
                        ? 'border-gold-400/70 bg-gold-400/20 text-gold-100'
                        : 'border-white/15 bg-white/5 text-white/70 hover:text-white'
                    }`}
                    type="button"
                    onClick={() => setSlotStake(option)}
                    disabled={mode === 'spinning' || isAwaitingServer || isLoading}
                  >
                    {option} ★
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        
        <div className="flex gap-2">
          <button
            className="flex-1 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-lg transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed hover:shadow-xl hover:from-purple-400 hover:to-pink-400"
            disabled={mode === 'spinning' || isAwaitingServer || isLoading}
            onClick={() => void (variant === 'wheel' ? spinWheel() : spinSlots())}
            type="button"
          >
            {mode === 'spinning' ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Вращаем…
              </span>
            ) : variant === 'wheel' ? (
              '🎡 Запустить'
            ) : (
              '🎰 Крутить'
            )}
          </button>
          {variant === 'wheel' && mode !== 'idle' && (
            <button
              className="rounded-xl border-2 border-white/30 bg-black/40 px-4 py-3 text-sm font-bold uppercase tracking-wider text-white backdrop-blur-sm transition-all active:scale-95 hover:border-white/50"
              onClick={mode === 'paused' ? resumeGame : pauseGame}
              type="button"
            >
              {mode === 'paused' ? '▶️' : '⏸️'}
            </button>
          )}
        </div>
      </div>

      {/* Toast уведомления */}
      {toast && (
        <div className="pointer-events-none absolute inset-x-4 top-20 z-50 flex justify-center animate-bounce">
          <div className="rounded-full border border-white/30 bg-black/90 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white shadow-xl backdrop-blur-md">
            {toast}
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-x-4 top-16 z-50 rounded-xl border border-red-400/50 bg-red-900/40 px-3 py-2 text-xs text-red-100 backdrop-blur-md animate-pulse">
          {error}
        </div>
      )}

      {isInfoOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0b0f1e] p-4 text-white shadow-[0_24px_48px_rgba(5,8,15,0.45)] sm:p-5">
            <header className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Меню рулетки</h3>
              <button
                aria-label="Закрыть меню"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 transition hover:text-white"
                onClick={() => setIsInfoOpen(false)}
                type="button"
              >
                <span className="text-base leading-none">✕</span>
              </button>
            </header>

            <div className="space-y-3 text-sm text-white/75">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-white/12 bg-white/6 px-3 py-2">
                  <span className="block text-[11px] uppercase tracking-[0.16em] text-white/55">Баланс</span>
                  <span className="text-base font-semibold text-white">{balance.available} ★</span>
                </div>
                <div className="rounded-2xl border border-white/12 bg-white/6 px-3 py-2">
                  <span className="block text-[11px] uppercase tracking-[0.16em] text-white/55">В резерве</span>
                  <span className="text-base font-semibold text-white/80">{balance.reserved} ★</span>
                </div>
                <div className="rounded-2xl border border-white/12 bg-white/6 px-3 py-2">
                  <span className="block text-[11px] uppercase tracking-[0.16em] text-white/55">Последний приз</span>
                  <span className="text-base font-semibold text-white/80">{lastPrize ? getPrizeIcon(lastPrize) : '—'}</span>
                </div>
                <div className="rounded-2xl border border-white/12 bg-white/6 px-3 py-2">
                  <span className="block text-[11px] uppercase tracking-[0.16em] text-white/55">Вариант</span>
                  <span className="text-base font-semibold text-white/80">{variant === 'wheel' ? 'Колесо' : 'Слоты'}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-white/55">
                  <span>История</span>
                  <button
                    className="text-[11px] uppercase tracking-[0.18em] text-white/40 transition hover:text-white/70"
                    onClick={clearHistory}
                    type="button"
                  >
                    Очистить
                  </button>
                </div>
                <div className="max-h-48 space-y-2 overflow-y-auto pr-1 text-sm text-white/80">
                  {renderHistoryItems()}
                </div>
              </div>
            </div>

            <button
              className="mt-4 w-full rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-white/80 transition hover:text-white"
              onClick={() => setIsInfoOpen(false)}
              type="button"
            >
              Закрыть
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
