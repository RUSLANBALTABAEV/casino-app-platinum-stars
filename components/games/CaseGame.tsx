'use client';

import clsx from 'clsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useTelegram } from '@/context/TelegramContext';
import {
  type CaseDefinition,
  type CaseGameConfig,
  type CaseItemDefinition,
  getDefaultCaseConfig
} from '@/lib/config/case-default';
import { buildTelegramAuthHeaders } from '@/lib/telegram';
import CaseOpeningModal from '@/components/games/CaseOpeningModal';

type CaseHistoryEntry = {
  id: string;
  caseId: string;
  caseName: string;
  itemId?: string;
  itemName: string;
  rarity: string;
  color?: string;
  stars?: number;
  nftGiftId?: string | null;
  createdAt: string;
};

type CaseApiResponse = {
  config: CaseGameConfig;
  history: CaseHistoryEntry[];
  balance: {
    available: number;
    reserved: number;
    bonusAvailable?: number;
    bonusReserved?: number;
  };
};

type CaseOpenResponse = {
  success: true;
  result: {
    case: CaseDefinition;
    reward: CaseItemDefinition;
    nftGift?: {
      id: string;
      name: string;
      rarity: string;
      imageUrl?: string | null;
    } | null;
    balance: {
      available: number;
      reserved: number;
      bonusAvailable?: number;
      bonusReserved?: number;
    };
  };
  history: CaseHistoryEntry[];
};

const FALLBACK_CONFIG = getDefaultCaseConfig();
const CHEST_ARTWORK_FALLBACK = [
  '/chests/chest_1.png',
  '/chests/chest_2.png',
  '/chests/chest_3.png',
  '/chests/chest_4.png',
  '/chests/chest_5.png',
  '/chests/chest_6.png'
] as const;

function formatStars(value: number): string {
  return `${value.toLocaleString('ru-RU')} ★`;
}

function formatBonus(value: number): string {
  return `${value.toLocaleString('ru-RU')} бонус`;
}

function formatCasePrice(casePrice: number, currency?: CaseDefinition['currency']): string {
  return (currency ?? 'STARS') === 'BONUS' ? formatBonus(casePrice) : formatStars(casePrice);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function CaseBadge({ text }: { text?: string }): React.JSX.Element | null {
  if (!text) {
    return null;
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gold-400/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-200">
      {text}
    </span>
  );
}

export default function CaseGame(): React.JSX.Element {
  const { initDataRaw } = useTelegram();
  const [config, setConfig] = useState<CaseGameConfig>(FALLBACK_CONFIG);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [history, setHistory] = useState<CaseHistoryEntry[]>([]);
  const [balance, setBalance] = useState<{
    available: number;
    reserved: number;
    bonusAvailable: number;
    bonusReserved: number;
  }>({
    available: 0,
    reserved: 0,
    bonusAvailable: 0,
    bonusReserved: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
  const [openingCase, setOpeningCase] = useState<CaseDefinition | null>(null);
  const [openingReward, setOpeningReward] = useState<CaseItemDefinition | null>(null);
  const [openingNft, setOpeningNft] = useState<CaseOpenResponse['result']['nftGift'] | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewCase, setPreviewCase] = useState<CaseDefinition | null>(null);

  // FIX §5: Блокируем скролл body когда открыто любое модальное окно,
  // чтобы фон страницы не прокручивался под оверлеем.
  useEffect(() => {
    const anyModalOpen = isPreviewOpen || isMenuOpen || isOpeningModalOpen;
    if (anyModalOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.overscrollBehavior = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.overscrollBehavior = '';
    };
  }, [isPreviewOpen, isMenuOpen, isOpeningModalOpen]);

  const toastTimerRef = useRef<number | null>(null);

  const cases = config.cases;
  const selectedCase = cases[selectedIndex] ?? cases[0];

  const getArtwork = useCallback((lootCase: CaseDefinition, index: number) => {
    const raw = lootCase.artwork?.trim();
    if (raw) {
      return raw;
    }
    return CHEST_ARTWORK_FALLBACK[index % CHEST_ARTWORK_FALLBACK.length];
  }, []);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 2200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const authHeaders = initDataRaw ? buildTelegramAuthHeaders(initDataRaw) : undefined;
      const response = await fetch('/api/mini-app/games/case', {
        method: 'GET',
        headers: authHeaders,
        cache: 'no-store'
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setError('Авторизация через Telegram Mini App недоступна в браузере. Запустите игру из Telegram.');
        } else {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? 'Не удалось загрузить данные кейсов.');
        }
        setConfig(FALLBACK_CONFIG);
        setHistory([]);
        return;
      }

      const payload = (await response.json()) as CaseApiResponse;
      if (payload.config?.cases?.length) {
        setConfig(payload.config);
        setSelectedIndex(0);
      } else {
        setConfig(FALLBACK_CONFIG);
      }
      if (Array.isArray(payload.history)) {
        setHistory(payload.history);
      }
      if (payload.balance) {
        setBalance({
          available: payload.balance.available ?? 0,
          reserved: payload.balance.reserved ?? 0,
          bonusAvailable: payload.balance.bonusAvailable ?? 0,
          bonusReserved: payload.balance.bonusReserved ?? 0
        });
      }
    } catch (fetchError) {
      console.error('Failed to load case data', fetchError);
      setConfig(FALLBACK_CONFIG);
      setHistory([]);
      setError('Ошибка сети. Проверьте подключение и повторите попытку.');
    } finally {
      setIsLoading(false);
    }
  }, [initDataRaw]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSelect = (index: number) => {
    setSelectedIndex(index);
  };

  const openCase = useCallback(async (caseToOpen?: CaseDefinition) => {
    const selected = caseToOpen ?? selectedCase;
    if (!selected || isOpening) {
      return;
    }

    setIsPreviewOpen(false);
    setPreviewCase(null);
    setIsOpening(true);
    setIsOpeningModalOpen(true);
    setOpeningCase(selected);
    setOpeningReward(null);
    setOpeningNft(null);
    setError(null);

    try {
      const authHeaders = buildTelegramAuthHeaders(initDataRaw);
      const postHeaders = new Headers(authHeaders);
      postHeaders.set('Content-Type', 'application/json');

      const response = await fetch('/api/mini-app/games/case', {
        method: 'POST',
        headers: postHeaders,
        body: JSON.stringify({ caseId: selected.id })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Не удалось открыть кейс.');
      }

      const payload = (await response.json()) as CaseOpenResponse;
      const reward = payload.result.reward;
      setBalance({
        available: payload.result.balance.available ?? 0,
        reserved: payload.result.balance.reserved ?? 0,
        bonusAvailable: payload.result.balance.bonusAvailable ?? 0,
        bonusReserved: payload.result.balance.bonusReserved ?? 0
      });
      setHistory(payload.history);
      setOpeningReward(reward);
      setOpeningNft(payload.result.nftGift ?? null);
    } catch (openError) {
      if (openError instanceof Error) {
        setError(openError.message);
      } else {
        setError('Ошибка открытия кейса.');
      }
      setIsOpeningModalOpen(false);
    } finally {
      setIsOpening(false);
    }
  }, [initDataRaw, isOpening, selectedCase]);

  const closeOpeningModal = useCallback(() => {
    if (openingReward) {
      showToast(
        openingReward.stars && openingReward.stars > 0
          ? `Вы получили ${formatStars(openingReward.stars)}!`
          : openingNft
            ? `NFT добавлен: ${openingNft.name}`
            : `Вы получили: ${openingReward.name}`
      );
    }
    setIsOpeningModalOpen(false);
    setOpeningCase(null);
    setOpeningReward(null);
    setOpeningNft(null);
  }, [openingReward, showToast]);

  const openAnother = useCallback(() => {
    if (isOpening || !openingCase) {
      return;
    }
    setIsOpeningModalOpen(false);
    setOpeningReward(null);
    setOpeningNft(null);
    // Даем модалке закрыться визуально, затем открываем снова
    window.setTimeout(() => {
      const index = cases.findIndex((c) => c.id === openingCase.id);
      if (index >= 0) {
        setSelectedIndex(index);
      }
      void openCase(openingCase);
    }, 180);
  }, [cases, isOpening, openCase, openingCase]);

  const CaseCard = ({
    lootCase,
    index
  }: {
    lootCase: CaseDefinition;
    index: number;
  }) => {
    const isActive = index === selectedIndex;
    return (
      <button
        key={lootCase.id}
        className={clsx(
          'group relative overflow-hidden rounded-2xl border p-3 text-left transition active:scale-[0.985]',
          isActive
            ? 'border-gold-400/60 bg-gradient-to-b from-gold-400/18 via-white/6 to-white/4 shadow-[0_18px_40px_-18px_rgba(212,175,55,0.55)]'
            : 'border-white/12 bg-white/5 hover:border-white/18 hover:bg-white/8'
        )}
        onClick={() => {
          handleSelect(index);
          setPreviewCase(lootCase);
          setIsPreviewOpen(true);
        }}
        type="button"
      >
        <div
          aria-hidden
          className={clsx(
            'pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full blur-2xl transition-opacity',
            isActive ? 'opacity-100' : 'opacity-0'
          )}
          style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.25), transparent 70%)' }}
        />

        <div className="relative z-10 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            {lootCase.badge ? (
              <span className="rounded-full border border-gold-400/30 bg-gold-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-100">
                {lootCase.badge}
              </span>
            ) : (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
                Кейс
              </span>
            )}
            <span className="text-[11px] font-semibold text-white/75">
              {formatCasePrice(lootCase.price, lootCase.currency)}
            </span>
          </div>

          <div className="relative mx-auto flex h-28 w-full items-center justify-center">
            <img
              src={getArtwork(lootCase, index)}
              alt=""
              className={clsx(
                'h-24 w-24 object-contain drop-shadow-[0_22px_44px_rgba(0,0,0,0.45)] transition',
                isActive ? 'scale-[1.03]' : 'group-hover:scale-[1.02]'
              )}
              loading="lazy"
            />
          </div>

          <div className="text-center">
            <p className="text-sm font-semibold text-white line-clamp-1">{lootCase.name}</p>
            {lootCase.description ? (
              <p className="mt-1 text-xs text-white/55 line-clamp-2">{lootCase.description}</p>
            ) : null}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="relative flex h-full w-full flex-col text-white">
      <CaseOpeningModal
        open={isOpeningModalOpen}
        loading={isOpening}
        lootCase={openingCase}
        reward={openingReward}
        nftGift={openingNft ?? undefined}
        onClose={closeOpeningModal}
        onOpenAnother={openingReward ? openAnother : undefined}
        animationMode="gif"
      />

      {isPreviewOpen && previewCase ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/12 bg-[#0b0f1e] p-4 text-white shadow-[0_24px_48px_rgba(5,8,15,0.45)] sm:p-5">
            <header className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-white/55">Кейс</p>
                <h3 className="mt-1 text-lg font-semibold text-white">{previewCase.name}</h3>
              </div>
              <button
                aria-label="Закрыть"
                className={clsx(
                  'inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/8 text-white/80 transition active:scale-[0.97]',
                  isOpening ? 'cursor-not-allowed opacity-50' : 'hover:text-white'
                )}
                disabled={isOpening}
                onClick={() => {
                  setIsPreviewOpen(false);
                  setPreviewCase(null);
                }}
                type="button"
              >
                ✕
              </button>
            </header>

            <div className="mt-5 flex flex-col items-center gap-4">
              <div className="relative flex h-44 w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                <div
                  aria-hidden
                  className="absolute -top-16 left-1/2 h-44 w-44 -translate-x-1/2 rounded-full blur-2xl"
                  style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.22), transparent 70%)' }}
                />
                <img
                  src={getArtwork(previewCase, selectedIndex)}
                  alt=""
                  className="relative z-10 h-36 w-36 object-contain drop-shadow-[0_22px_44px_rgba(0,0,0,0.5)]"
                  loading="eager"
                />
              </div>

              <div className="w-full space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <CaseBadge text={previewCase.badge} />
                  <span className="text-sm font-semibold text-gold-200">
                    {formatCasePrice(previewCase.price, previewCase.currency)}
                  </span>
                </div>
                {previewCase.description ? (
                  <p className="text-sm text-white/60">{previewCase.description}</p>
                ) : null}
              </div>

              <button
                className="w-full rounded-full bg-white px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#080b14] transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isOpening}
                onClick={() => void openCase(previewCase)}
                type="button"
              >
                {isOpening ? 'Открываем…' : `Открыть за ${formatCasePrice(previewCase.price, previewCase.currency)}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {/* Компактный хедер — прилипает к верху */}
      <div className="sticky top-0 z-20 flex items-center justify-between bg-black/80 px-2 py-2 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-white/20 bg-black/40 px-2 py-1 backdrop-blur-sm">
            <span className="text-[10px] uppercase tracking-wider text-white/60">Баланс</span>
            <div className="text-sm font-bold text-white">{balance.available} ★</div>
          </div>
          <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 backdrop-blur-sm">
            <span className="text-[10px] uppercase tracking-wider text-emerald-100/70">Бонус</span>
            <div className="text-xs font-bold text-emerald-100">{formatBonus(balance.bonusAvailable)}</div>
          </div>
          {selectedCase && (
            <div className="rounded-lg border border-white/20 bg-black/40 px-2 py-1 backdrop-blur-sm">
              <span className="text-[10px] uppercase tracking-wider text-white/60">Стоимость</span>
              <div className="text-xs font-bold text-white">
                {formatCasePrice(selectedCase.price, selectedCase.currency)}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            aria-label="Обновить баланс"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-black/40 text-white/80 backdrop-blur-sm transition hover:text-white active:scale-95"
            disabled={isLoading || isOpening}
            onClick={() => void loadData()}
            type="button"
          >
            <svg
              aria-hidden
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path d="M3 12a9 9 0 0 1 15.5-6.5" />
              <path d="M21 12a9 9 0 0 1-15.5 6.5" />
              <path d="M21 4v6h-6" />
              <path d="M3 20v-6h6" />
            </svg>
          </button>
          <button
            aria-label={isMenuOpen ? 'Скрыть меню' : 'Открыть меню'}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-black/40 text-white/80 backdrop-blur-sm transition hover:text-white active:scale-95"
            onClick={() => setIsMenuOpen(true)}
            type="button"
          >
            <span className="text-base leading-none">⋯</span>
          </button>
        </div>
      </div>

      {/* Прокручиваемая область: кейсы + игровое поле */}
      <div className="flex-1 overflow-y-auto scrollbar-hide overscroll-y-contain">
      {/* Выбор кейса - 2 в ряд */}
      <div className="px-3 pt-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/55">Кейсы</p>
          <p className="text-[11px] text-white/45">Выберите и откройте</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {cases.map((lootCase, index) => (
            <CaseCard key={lootCase.id} lootCase={lootCase} index={index} />
          ))}
        </div>
      </div>

      {/* Игровое поле - содержимое кейса */}
      <div className="mx-3 mt-3 rounded-2xl border border-white/20 bg-gradient-to-b from-[#0a0d1a] to-[#050509] shadow-[0_0_40px_rgba(0,0,0,0.5)]">
        <div className="p-3 overscroll-y-contain">
          {selectedCase ? (
            <div className="space-y-2">
              <div className="text-center">
                <div className="text-lg font-bold text-white mb-1">{selectedCase.name}</div>
                {selectedCase.description && (
                  <p className="text-xs text-white/60">{selectedCase.description}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {selectedCase.items.slice(0, 6).map((item) => (
                  <div
                    key={`${selectedCase.id}-${item.id}`}
                    className="rounded-lg border border-white/20 bg-gradient-to-br from-white/10 to-white/5 p-2 backdrop-blur-sm"
                    style={{
                      borderColor: item.color ? `${item.color}60` : undefined,
                      background: item.color ? `${item.color}15` : undefined
                    }}
                  >
                    <div className="text-xs font-semibold text-white truncate">{item.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-white/50 mt-0.5">{item.rarity}</div>
                    {item.stars && (
                      <div className="text-xs font-bold text-yellow-300 mt-1">{formatStars(item.stars)}</div>
                    )}
                    {item.nftGiftId ? (
                      <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-emerald-200">NFT</div>
                    ) : null}
                  </div>
                ))}
              </div>
              {selectedCase.items.length > 6 && (
                <div className="text-center text-[10px] text-white/50">
                  +{selectedCase.items.length - 6} ещё предметов
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-white/50">Выберите кейс</p>
            </div>
          )}
        </div>
      </div>

      {/* Компактная панель управления */}
      <div className="flex flex-col gap-2 px-2 py-2">
        <p className="text-[11px] text-center text-white/55">
          Нажмите на кейс, чтобы посмотреть и открыть.
        </p>
      </div>
      </div> {/* end scrollable area */}

      {isLoading ? (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-[#080b14]/70">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/40 border-t-transparent" />
        </div>
      ) : null}

      {toast ? (
        <div className="pointer-events-none absolute inset-x-0 top-6 z-40 flex justify-center">
          <span className="rounded-full border border-white/12 bg-black/85 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
            {toast}
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="absolute inset-x-4 bottom-4 z-40 rounded-3xl border border-red-400/30 bg-red-500/15 px-4 py-3 text-sm text-red-100 sm:inset-x-auto sm:right-6 sm:left-auto sm:bottom-6">
          {error}
        </div>
      ) : null}

      {isMenuOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-3xl border border-white/12 bg-[#0b0f1e] p-4 text-white shadow-[0_24px_48px_rgba(5,8,15,0.45)] sm:p-5">
            <header className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Меню кейсов</h3>
              <button
                aria-label="Закрыть меню"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 transition hover:text-white"
                onClick={() => setIsMenuOpen(false)}
                type="button"
              >
                <span className="text-base leading-none">✕</span>
              </button>
            </header>

            <div className="space-y-3 text-sm text-white/75">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-white/12 bg-white/6 px-3 py-2">
                  <span className="block text-[11px] uppercase tracking-[0.16em] text-white/55">Баланс</span>
                  <span className="text-base font-semibold text-white">{formatStars(balance.available)}</span>
                </div>
                <div className="rounded-2xl border border-white/12 bg-white/6 px-3 py-2">
                  <span className="block text-[11px] uppercase tracking-[0.16em] text-white/55">В резерве</span>
                  <span className="text-base font-semibold text-white/80">{formatStars(balance.reserved)}</span>
                </div>
                <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2">
                  <span className="block text-[11px] uppercase tracking-[0.16em] text-emerald-100/70">Бонус</span>
                  <span className="text-base font-semibold text-emerald-100">
                    {formatBonus(balance.bonusAvailable)}
                  </span>
                </div>
              </div>

              {selectedCase ? (
                <div className="space-y-2 rounded-2xl border border-white/12 bg-white/6 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CaseBadge text={selectedCase.badge} />
                      <span className="text-sm font-semibold text-white">{selectedCase.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-white/80">
                      {formatCasePrice(selectedCase.price, selectedCase.currency)}
                    </span>
                  </div>
                  {selectedCase.description ? (
                    <p className="text-xs text-white/55">{selectedCase.description}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.16em] text-white/55">История</p>
                <div className="max-h-44 space-y-2 overflow-y-auto pr-1 overscroll-y-contain">
                  {history.length ? (
                    history.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-2xl border border-white/12 bg-white/6 px-3 py-2 text-sm text-white/80"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white">{entry.itemName}</span>
                          {entry.stars ? (
                            <span className="text-sm font-semibold text-gold-100">{formatStars(entry.stars)}</span>
                          ) : null}
                        </div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">
                          {entry.caseName} • {entry.rarity}
                        </p>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">{formatDate(entry.createdAt)}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-white/50">История пока пуста.</p>
                  )}
                </div>
              </div>
            </div>

            <button
              className="mt-4 w-full rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-white/80 transition hover:text-white"
              onClick={() => setIsMenuOpen(false)}
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
