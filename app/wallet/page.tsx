'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useTelegram } from '@/context/TelegramContext';
import {
  DEFAULT_ECONOMY_CONFIG,
  type EconomyConfig,
  type EconomyPaymentOption
} from '@/lib/config/economy-default';
import { useStarBalance } from '@/lib/hooks/useStarBalance';
import { buildTelegramAuthHeaders } from '@/lib/telegram';

type CurrencyCode = EconomyPaymentOption['currency'];

type PaymentOption = EconomyPaymentOption;

const CUSTOM_OPTION_ID = 'custom';

type EconomyResponsePayload = {
  economy?: EconomyConfig;
  error?: string;
};

type WithdrawalRecord = {
  id: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SENT';
  type: 'STARS' | 'NFT_GIFT';
  destination: string;
  comment: string | null;
  createdAt: string;
  processedAt?: string | null;
};


const CURRENCY_SYMBOLS: Record<string, string> = {
  RUB: '₽',
  USD: '$',
  EUR: '€'
};

function formatCurrency(value: number, currency: CurrencyCode): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  const integer = Math.round(value).toString();
  const withSpaces = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${withSpaces} ${symbol}`;
}


type Provider = 'manual' | 'telegram-stars';

export default function WalletPage(): React.JSX.Element {
  const { initDataRaw } = useTelegram();
  const { state: balanceState } = useStarBalance();

  const [economyConfig, setEconomyConfig] = useState<EconomyConfig>(DEFAULT_ECONOMY_CONFIG);
  const [isLoadingEconomy, setIsLoadingEconomy] = useState<boolean>(false);
  const [economyError, setEconomyError] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>('manual');
  const defaultOptionId =
    DEFAULT_ECONOMY_CONFIG.paymentOptions.length > 0
      ? DEFAULT_ECONOMY_CONFIG.paymentOptions[0].id
      : CUSTOM_OPTION_ID;
  const [selectedOptionId, setSelectedOptionId] = useState<string>(defaultOptionId);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [customStarsInput, setCustomStarsInput] = useState<string>('');
  const [telegramStarsInput, setTelegramStarsInput] = useState<string>(
    () => DEFAULT_ECONOMY_CONFIG.telegramPurchase.presets[0]?.toString() ?? '100'
  );
  const [telegramPromoCodeInput, setTelegramPromoCodeInput] = useState<string>('');
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [isLoadingWithdrawals, setIsLoadingWithdrawals] = useState<boolean>(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccessMessage, setWithdrawSuccessMessage] = useState<string | null>(null);
  const [isSubmittingWithdrawal, setIsSubmittingWithdrawal] = useState<boolean>(false);
  const [withdrawAmountInput, setWithdrawAmountInput] = useState<string>('100');
  const [withdrawDestinationInput, setWithdrawDestinationInput] = useState<string>('');
  const [withdrawTypeInput, setWithdrawTypeInput] = useState<'STARS' | 'NFT_GIFT'>('STARS');
  const [withdrawNoteInput, setWithdrawNoteInput] = useState<string>('');
  const [withdrawCommentInput, setWithdrawCommentInput] = useState<string>('');
  const [customWithdrawAmount, setCustomWithdrawAmount] = useState<string>('');

  useEffect(() => {
    if (!initDataRaw) {
      return;
    }

    const controller = new AbortController();
    setIsLoadingEconomy(true);
    setEconomyError(null);

    const loadEconomy = async () => {
      try {
        const response = await fetch('/api/mini-app/economy', {
          headers: buildTelegramAuthHeaders(initDataRaw),
          signal: controller.signal
        });
        const payloadRaw: unknown = await response.json().catch(() => null);
        const payload: EconomyResponsePayload =
          payloadRaw && typeof payloadRaw === 'object'
            ? (payloadRaw as EconomyResponsePayload)
            : {};
        if (!response.ok) {
          const errorMsg = payload?.error || (typeof payloadRaw === 'object' && payloadRaw !== null && 'error' in payloadRaw && typeof payloadRaw.error === 'string' ? payloadRaw.error : 'Не удалось загрузить экономику.');
          throw new Error(errorMsg);
        }
        // API возвращает { economy, activityCosts }
        const rawEconomy = (payloadRaw && typeof payloadRaw === 'object' && payloadRaw !== null && 'economy' in payloadRaw) 
          ? (payloadRaw as any).economy 
          : null;
        const economyData = payload.economy || rawEconomy;
        
        if (economyData && typeof economyData === 'object') {
          setEconomyConfig(economyData);
          setSelectedOptionId((prev) => {
            if (prev === CUSTOM_OPTION_ID) {
              return prev;
            }
            const options = economyData?.paymentOptions;
            if (Array.isArray(options)) {
              const exists = options.some((option: any) => option?.id === prev);
              if (exists) {
                return prev;
              }
              return options[0]?.id ?? CUSTOM_OPTION_ID;
            }
            return CUSTOM_OPTION_ID;
          });
        } else {
          throw new Error('Экономика не найдена в ответе сервера');
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setEconomyError(
          error instanceof Error ? error.message : 'Не удалось загрузить экономику.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingEconomy(false);
        }
      }
    };

    void loadEconomy();

    return () => {
      controller.abort();
    };
  }, [initDataRaw]);

  const loadUserWithdrawals = useCallback(
    async (signal?: AbortSignal) => {
      if (!initDataRaw) {
        setWithdrawals([]);
        setIsLoadingWithdrawals(false);
        return;
      }

      if (!signal || !signal.aborted) {
        setIsLoadingWithdrawals(true);
      }
      setWithdrawError(null);

      try {
        const response = await fetch('/api/mini-app/withdrawals', {
          headers: buildTelegramAuthHeaders(initDataRaw),
          signal
        });
        const payload = (await response.json().catch(() => null)) as {
          withdrawals?: WithdrawalRecord[];
          error?: string;
        } | null;
        if (!response.ok) {
          throw new Error(payload?.error ?? 'Не удалось загрузить историю выводов.');
        }
        setWithdrawals(Array.isArray(payload?.withdrawals) ? payload.withdrawals : []);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setWithdrawError(
          error instanceof Error ? error.message : 'Не удалось загрузить историю выводов.'
        );
        setWithdrawSuccessMessage(null);
      } finally {
        if (!signal || !signal.aborted) {
          setIsLoadingWithdrawals(false);
        }
      }
    },
    [initDataRaw]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadUserWithdrawals(controller.signal);
    return () => {
      controller.abort();
    };
  }, [loadUserWithdrawals]);

  const formattedOptions = useMemo(
    () =>
      economyConfig.paymentOptions.map((option) => ({
        ...option,
        amountLabel: formatCurrency(option.amount, option.currency)
      })),
    [economyConfig.paymentOptions]
  );

  const customPurchase = economyConfig.customPurchase;
  const telegramPurchase = economyConfig.telegramPurchase;
  const externalLinks =
    economyConfig.externalLinks ?? {
      miniAppUrl: null,
      topupUrl: null,
      withdrawUrl: null
    };
  const externalTopupUrl = externalLinks.topupUrl ?? null;
  const externalWithdrawUrl = externalLinks.withdrawUrl ?? null;

  const customStars = useMemo(() => {
    const parsed = Number.parseInt(customStarsInput, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }, [customStarsInput]);

  const customAmountRub = useMemo(() => {
    if (!customStars) {
      return null;
    }
    return Math.ceil(customStars * customPurchase.rubPerStar);
  }, [customPurchase.rubPerStar, customStars]);

  const telegramStarsAmount = useMemo(() => {
    const parsed = Number.parseInt(telegramStarsInput, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }, [telegramStarsInput]);

  const isTelegramAmountValid = useMemo(() => {
    if (!telegramStarsAmount) {
      return false;
    }
    return (
      telegramStarsAmount >= telegramPurchase.minStars &&
      telegramStarsAmount <= telegramPurchase.maxStars
    );
  }, [telegramPurchase.maxStars, telegramPurchase.minStars, telegramStarsAmount]);

  const selectedPresetOption = useMemo(() => {
    if (selectedOptionId === CUSTOM_OPTION_ID) {
      return null;
    }
    return formattedOptions.find((option) => option.id === selectedOptionId) ?? null;
  }, [formattedOptions, selectedOptionId]);

  const customOption = useMemo<PaymentOption | null>(() => {
    if (selectedOptionId !== CUSTOM_OPTION_ID || !customStars || !customAmountRub) {
      return null;
    }
    if (customStars < customPurchase.minStars || customStars > customPurchase.maxStars) {
      return null;
    }
    return {
      id: CUSTOM_OPTION_ID,
      stars: customStars,
      amount: customAmountRub,
      currency: 'RUB',
      label: `${customStars.toLocaleString('ru-RU')} ★`,
      caption: 'Произвольная сумма'
    };
  }, [customAmountRub, customPurchase.maxStars, customPurchase.minStars, customStars, selectedOptionId]);

  const selectedOption: PaymentOption | null =
    selectedOptionId === CUSTOM_OPTION_ID ? customOption : selectedPresetOption;


  useEffect(() => {
    setTelegramStarsInput((prev) => {
      const parsed = Number.parseInt(prev, 10);
      if (
        Number.isNaN(parsed) ||
        parsed < telegramPurchase.minStars ||
        parsed > telegramPurchase.maxStars
      ) {
        return telegramPurchase.presets[0]?.toString() ?? String(telegramPurchase.minStars);
      }
      return prev;
    });
  }, [telegramPurchase.maxStars, telegramPurchase.minStars, telegramPurchase.presets]);


  const handleTelegramTopUp = useCallback(async () => {
    if (isProcessing || !isTelegramAmountValid) {
      return;
    }

    if (!initDataRaw) {
      setErrorMessage('Пополнение звёздами доступно только в мини-приложении Telegram.');
      return;
    }

    const starsAmount = telegramStarsAmount ?? 0;
    setStatusMessage('Готовим пополнение через Telegram…');
    setErrorMessage(null);
    setIsProcessing(true);

    try {
      const response = await fetch('/api/payments/stars', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initDataRaw
        },
        body: JSON.stringify({
          stars: starsAmount,
          promoCode: telegramPromoCodeInput.trim().toUpperCase() || undefined
        })
      });

      const payload = (await response.json()) as { invoiceUrl?: string; payload?: string; error?: string };

      if (!response.ok || !payload.invoiceUrl) {
        throw new Error(payload?.error ?? 'Не удалось создать счёт в Telegram.');
      }

      const invoiceUrl = payload.invoiceUrl;
      const paymentPayload = payload.payload;
      // Сохраняем initDataRaw в локальную переменную для использования в callback
      const currentInitDataRaw = initDataRaw;
      const webApp = window.Telegram?.WebApp;
      let opened = false;
      if (webApp?.openInvoice) {
        opened = true;
        // Важно: callback должен быть синхронным, асинхронные операции выполняем через setTimeout
        webApp.openInvoice(invoiceUrl, (status?: string) => {
          console.log('[PAYMENT] Invoice callback received, status:', status);
          
          if (status === 'paid') {
            console.log('[PAYMENT] Payment successful, processing...');
            setStatusMessage('Оплата подтверждена. Зачисляем звёзды...');
            
            // Вызываем API для зачисления баланса асинхронно
            if (paymentPayload && currentInitDataRaw) {
              // Используем setTimeout для асинхронной операции, так как callback должен быть синхронным
              setTimeout(async () => {
                try {
                  console.log('[PAYMENT] Calling complete endpoint with payload:', paymentPayload);
                  const completeResponse = await fetch('/api/payments/stars/complete', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'x-telegram-init-data': currentInitDataRaw
                    },
                    body: JSON.stringify({ payload: paymentPayload })
                  });

                  console.log('[PAYMENT] Complete response status:', completeResponse.status);
                  const completeData = (await completeResponse.json()) as {
                    success?: boolean;
                    stars?: number;
                    bonusStars?: number;
                    bonusCoins?: number;
                    totalCredited?: number;
                    promoApplied?: boolean;
                    promoCode?: string | null;
                    promoError?: string | null;
                    error?: string;
                  };
                  console.log('[PAYMENT] Complete response data:', completeData);

                  if (completeResponse.ok && completeData.success) {
                    const base = completeData.stars ?? 0;
                    const bonus = completeData.bonusStars ?? 0;
                    const bonusCoins = completeData.bonusCoins ?? 0;
                    setStatusMessage(
                      bonus > 0 || bonusCoins > 0
                        ? `✅ Зачислено ${base} ★ + бонус ${bonus} ★ + ${bonusCoins} бонус`
                        : `✅ Успешно зачислено ${base} ★`
                    );
                    // Перезагружаем страницу через 2 секунды для обновления баланса
                    setTimeout(() => {
                      window.location.reload();
                    }, 2000);
                  } else {
                    setStatusMessage('Оплата подтверждена, но возникла ошибка при зачислении. Обратитесь в поддержку.');
                    console.error('[PAYMENT] Payment completion error:', completeData.error);
                  }
                } catch (error) {
                  setStatusMessage('Оплата подтверждена, но возникла ошибка при зачислении. Обратитесь в поддержку.');
                  console.error('[PAYMENT] Payment completion exception:', error);
                }
              }, 100);
            } else {
              console.warn('[PAYMENT] Missing paymentPayload or currentInitDataRaw');
              setStatusMessage('Оплата подтверждена. Звёзды будут зачислены автоматически.');
            }
          } else if (status === 'pending') {
            console.log('[PAYMENT] Payment pending');
            setStatusMessage('Ожидаем подтверждения оплаты.');
          } else if (status === 'cancelled') {
            console.log('[PAYMENT] Payment cancelled');
            setStatusMessage('Оплата отменена.');
            setIsProcessing(false);
          } else if (status === 'failed') {
            console.log('[PAYMENT] Payment failed');
            setErrorMessage('Оплата не прошла. Попробуйте снова.');
            setStatusMessage(null);
            setIsProcessing(false);
          } else {
            console.log('[PAYMENT] Unknown status:', status);
            setIsProcessing(false);
          }
        });
      } else if (webApp?.openTelegramLink) {
        opened = true;
        webApp.openTelegramLink(invoiceUrl);
      }

      if (!opened) {
        window.open(invoiceUrl, '_blank', 'noopener');
      }

      setStatusMessage('Подтвердите покупку в окне Telegram.');
    } catch (caught: unknown) {
      const message =
        caught instanceof Error ? caught.message : 'Не удалось инициировать пополнение звёздами.';
      setErrorMessage(message);
      setStatusMessage(null);
    } finally {
      setIsProcessing(false);
    }
  }, [initDataRaw, isProcessing, isTelegramAmountValid, telegramPromoCodeInput, telegramStarsAmount]);

  const handleWithdrawalSubmit = useCallback(async () => {
    if (isSubmittingWithdrawal) {
      return;
    }

    setWithdrawSuccessMessage(null);
    const rawAmount = Number.parseInt(withdrawAmountInput, 10);
    const normalizedAmount =
      withdrawTypeInput === 'NFT_GIFT'
        ? Number.isNaN(rawAmount) || rawAmount <= 0
          ? 1
          : rawAmount
        : rawAmount;

    if (
      withdrawTypeInput === 'STARS' &&
      (Number.isNaN(normalizedAmount) || normalizedAmount <= 0)
    ) {
      setWithdrawError('Введите корректную сумму вывода.');
      setWithdrawSuccessMessage(null);
      return;
    }

    const destination = withdrawDestinationInput.trim();
    if (!destination) {
      setWithdrawError('Укажите реквизиты для вывода.');
      setWithdrawSuccessMessage(null);
      return;
    }

    if (!initDataRaw) {
      setWithdrawError('Вывод доступен только внутри Telegram.');
      setWithdrawSuccessMessage(null);
      return;
    }

    const note = withdrawNoteInput.trim();
    const amountToSend =
      withdrawTypeInput === 'NFT_GIFT'
        ? Math.max(1, Math.floor(Number.isNaN(normalizedAmount) ? 1 : normalizedAmount))
        : Math.max(1, Math.floor(normalizedAmount));

    setIsSubmittingWithdrawal(true);
    setWithdrawError(null);

    try {
      const response = await fetch('/api/mini-app/withdrawals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initDataRaw
        },
        body: JSON.stringify({
          amount: amountToSend,
          destination,
          type: withdrawTypeInput,
          currency: withdrawTypeInput === 'STARS' ? 'XTR' : 'STARS',
          comment: withdrawTypeInput === 'STARS' && Number.parseInt(withdrawAmountInput, 10) > 100
            ? withdrawCommentInput.trim() || null
            : withdrawTypeInput === 'NFT_GIFT'
              ? withdrawNoteInput.trim() || null
              : null,
          meta: note ? { note } : undefined
        })
      });
      const payload = (await response.json()) as { withdrawal?: WithdrawalRecord; error?: string };

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Не удалось создать заявку.');
      }

      setWithdrawSuccessMessage('Заявка создана. Команда свяжется после проверки.');
      void loadUserWithdrawals();
      setWithdrawDestinationInput('');
      setWithdrawNoteInput('');
      setWithdrawCommentInput('');
      setWithdrawAmountInput(withdrawTypeInput === 'NFT_GIFT' ? '1' : '100');
                  setCustomWithdrawAmount('');
    } catch (error) {
      setWithdrawError(error instanceof Error ? error.message : 'Ошибка при создании заявки.');
      setWithdrawSuccessMessage(null);
    } finally {
      setIsSubmittingWithdrawal(false);
    }
  }, [
    initDataRaw,
    isSubmittingWithdrawal,
    loadUserWithdrawals,
    withdrawAmountInput,
    withdrawDestinationInput,
    withdrawNoteInput,
    withdrawCommentInput,
    withdrawTypeInput
  ]);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="ui-kicker">Кошелёк</p>
        <h1 className="ui-title">Управляйте пополнениями и выводами</h1>
        <p className="ui-lead max-w-[56ch]">
          Пополняйте баланс звёзд через банковский перевод или напрямую внутри Telegram при помощи Stars.
        </p>
        <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-platinum/70">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            Баланс: {balanceState.available.toLocaleString('ru-RU')} ★
          </span>
          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-emerald-100">
            Бонус: {balanceState.bonusAvailable.toLocaleString('ru-RU')} монет
          </span>
        </div>
      </header>

      {economyError && (
        <p className="ui-card ui-card-glass ui-card-pad border border-red-400/35 bg-red-500/10 text-xs text-red-200 shadow-none">
          {economyError}
        </p>
      )}
      {!economyError && isLoadingEconomy && (
        <p className="ui-chip border-white/10 bg-white/5 text-platinum/60">Обновляем курсы и тарифы…</p>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-gold-400">Пополнение</h2>
        <div className="relative">
          <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.16em] text-platinum/70 relative z-10">
            <button
              className={`ui-card ui-card-glass flex min-w-[160px] flex-col gap-1 px-5 py-3 text-left transition ${
                provider === 'manual'
                  ? 'border-gold-400/80 bg-black/70 text-platinum shadow-glow'
                  : 'border-white/12 bg-black/25 text-platinum/70 hover:border-gold-400/40 hover:bg-black/40 hover:text-platinum'
              }`}
              data-garland="1"
              onClick={() => setProvider('manual')}
              type="button"
            >
              <span>Банковский перевод</span>
              <span className="text-[10px] text-platinum/50">Ручное пополнение</span>
            </button>
            <button
              className={`ui-card ui-card-glass flex min-w-[160px] flex-col gap-1 px-5 py-3 text-left transition ${
                provider === 'telegram-stars'
                  ? 'border-indigo-400/80 bg-black/70 text-platinum shadow-[0_12px_36px_rgba(79,70,229,0.45)]'
                  : 'border-indigo-400/35 bg-black/25 text-platinum/70 hover:border-indigo-400/55 hover:bg-black/40 hover:text-platinum'
              }`}
              data-garland="1"
              onClick={() => setProvider('telegram-stars')}
              type="button"
            >
              <span>Telegram Stars</span>
              <span className="text-[10px] text-platinum/50">Встроенные покупки</span>
            </button>
          </div>
        </div>

        <div className="space-y-3 text-sm text-platinum/75">
          {provider === 'manual' ? (
            <>
              <p>Укажите количество звёзд для пополнения. После создания запроса вы получите реквизиты для банковского перевода.</p>
              <div className="ui-card ui-card-glass ui-card-gold space-y-4 p-6" data-garland="1">
                <label className="flex flex-col gap-2 text-sm text-platinum/70">
                  Количество звёзд
                  <input
                    className="ui-input text-lg"
                    min={customPurchase.minStars}
                    max={customPurchase.maxStars}
                    placeholder={`${customPurchase.minStars} — ${customPurchase.maxStars}`}
                    type="number"
                    value={customStarsInput}
                    onChange={(event) => {
                      const value = event.target.value.replace(/\D/g, '');
                      setCustomStarsInput(value);
                    }}
                  />
                </label>

                {customStars && customAmountRub && (
                  <div className="space-y-2 rounded-2xl border border-gold-400/20 bg-black/60 p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-platinum/50">Стоимость</p>
                    <p className="text-2xl font-bold text-gold-400">
                      {customAmountRub.toLocaleString('ru-RU')} ₽
                    </p>
                    <p className="text-xs text-platinum/60">
                      По {customPurchase.rubPerStar.toFixed(2).replace('.', ',')} ₽ за 1 ★
                    </p>
                  </div>
                )}

                {customStars && (customStars < customPurchase.minStars || customStars > customPurchase.maxStars) && (
                  <p className="text-xs text-red-300/80">
                    Количество должно быть от {customPurchase.minStars.toLocaleString('ru-RU')} до{' '}
                    {customPurchase.maxStars.toLocaleString('ru-RU')} звёзд
                  </p>
                )}

                <a
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-gold-400 to-gold-500 px-8 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-night shadow-[0_20px_30px_-12px_rgba(212,175,55,0.55)] transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                  href="/wallet/manual"
                >
                  Создать запрос на пополнение
                </a>
              </div>
            </>
          ) : (
            <>
              <p>
                Пополнение происходит через встроенные покупки Telegram Stars. После нажатия кнопки
                откроется нативное окно с подтверждением операции.
              </p>
              <div className="space-y-4 rounded-3xl border border-indigo-400/40 bg-[#0b0f1c]/85 p-4 text-sm text-platinum/80 shadow-[0_20px_32px_rgba(7,9,14,0.45)]">
                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/65">
                  Количество звёзд
                  <input
                    className="rounded-2xl border border-indigo-400/40 bg-black/40 px-4 py-3 text-base text-platinum outline-none transition focus:border-indigo-300"
                    min={telegramPurchase.minStars}
                    max={telegramPurchase.maxStars}
                    placeholder={`${telegramPurchase.minStars} — ${telegramPurchase.maxStars}`}
                    type="number"
                    value={telegramStarsInput}
                    onChange={(event) => {
                      const value = event.target.value.replace(/\D/g, '');
                      setTelegramStarsInput(value);
                    }}
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/65">
                  Промокод на бонус (опционально)
                  <input
                    className="rounded-2xl border border-indigo-400/30 bg-black/35 px-4 py-3 text-base text-platinum outline-none transition focus:border-indigo-300"
                    inputMode="text"
                    placeholder="Например: ASTRO-STAR-2025"
                    type="text"
                    value={telegramPromoCodeInput}
                    onChange={(event) => setTelegramPromoCodeInput(event.target.value.toUpperCase())}
                  />
                </label>
                <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-platinum/60">
                  {telegramPurchase.presets.map((preset) => (
                    <button
                      key={preset}
                      className="rounded-full border border-indigo-400/45 px-3 py-1 transition hover:border-indigo-300 hover:text-platinum"
                      onClick={() => setTelegramStarsInput(String(preset))}
                      type="button"
                    >
                      {preset.toLocaleString('ru-RU')} ★
                    </button>
                  ))}
                </div>
                <p className="text-xs text-platinum/55">
                  Минимум {telegramPurchase.minStars.toLocaleString('ru-RU')} ★, максимум{' '}
                  {telegramPurchase.maxStars.toLocaleString('ru-RU')} ★. Комиссия отсутствует, пополнение происходит
                  мгновенно.
                </p>
              </div>
              {!initDataRaw && (
                <p className="text-xs text-red-300/80">
                  Откройте мини-приложение внутри Telegram, чтобы оплатить звёздами.
                </p>
              )}
              <button
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 px-8 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-night shadow-[0_20px_30px_-12px_rgba(79,70,229,0.55)] transition active:scale-[0.97]"
                disabled={!isTelegramAmountValid || isProcessing || !initDataRaw}
                onClick={() => {
                  void handleTelegramTopUp();
                }}
                type="button"
              >
                {isProcessing ? 'Ожидайте…' : 'Пополнить через Telegram'}
              </button>
              {externalTopupUrl ? (
                <a
                  className="inline-flex items-center justify-center rounded-full border border-indigo-400/45 px-8 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-indigo-200 transition hover:border-indigo-200 hover:text-white"
                  href={externalTopupUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Оплатить на сайте
                </a>
              ) : null}
            </>
          )}
          {statusMessage && (
            <p className="text-xs uppercase tracking-[0.16em] text-platinum/55">{statusMessage}</p>
          )}
          {errorMessage && (
            <p className="text-xs uppercase tracking-[0.16em] text-red-300/80">{errorMessage}</p>
          )}
        </div>
      </section>

      <section className="space-y-4 pt-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-gold-400">
          Вывод средств
        </h2>
        <div className="relative">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] relative z-10">
          <div className="space-y-4 rounded-3xl border border-white/12 bg-black/40 p-5 text-sm text-platinum/80 shadow-[0_20px_40px_rgba(10,12,19,0.35)]">
            <p>
              Создайте заявку на вывод звёзд или NFT-подарок. После проверки команда свяжется с вами
              через указанный контакт.
            </p>
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/60">
              Тип вывода
              <select
                className="rounded-2xl border border-white/15 bg-black/60 px-4 py-2 text-sm text-platinum outline-none transition focus:border-gold-400"
                value={withdrawTypeInput}
                onChange={(event) => {
                  const nextType = event.target.value === 'NFT_GIFT' ? 'NFT_GIFT' : 'STARS';
                  setWithdrawTypeInput(nextType);
                  setWithdrawError(null);
                  setWithdrawAmountInput((previous) => {
                    if (nextType === 'NFT_GIFT') {
                      return '1';
                    }
                    if (!previous || previous === '0' || previous === '1') {
                      return '100';
                    }
                    return previous;
                  });
                }}
              >
                <option value="STARS">Звёзды (XTR)</option>
                <option value="NFT_GIFT">NFT-подарок</option>
              </select>
            </label>
            {withdrawTypeInput === 'STARS' ? (
              <>
                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/60">
                  Выберите сумму (подарок)
                  <div className="grid grid-cols-2 gap-2">
                    {[15, 25, 50, 100].map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        className={`rounded-xl border px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] transition ${
                          withdrawAmountInput === amount.toString()
                            ? 'border-gold-400 bg-gold-500/20 text-gold-200'
                            : 'border-white/15 bg-black/60 text-platinum hover:border-gold-400/50'
                        }`}
                        onClick={() => {
                          setWithdrawAmountInput(amount.toString());
                          setCustomWithdrawAmount('');
                          setWithdrawError(null);
                        }}
                      >
                        {amount} ★
                      </button>
                    ))}
                  </div>
                </label>
                {(Number.parseInt(withdrawAmountInput, 10) > 100 || Number.parseInt(customWithdrawAmount, 10) > 100) && (
                  <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/60">
                    Укажите NFT, подходящий к вашему балансу (±)
                    <textarea
                      className="min-h-[80px] rounded-2xl border border-white/15 bg-black/60 px-4 py-2 text-sm text-platinum outline-none transition focus:border-gold-400"
                      placeholder="Например: NFT название или ссылка на NFT"
                      value={withdrawCommentInput}
                      onChange={(event) => setWithdrawCommentInput(event.target.value)}
                      required={Number.parseInt(withdrawAmountInput, 10) > 100 || Number.parseInt(customWithdrawAmount, 10) > 100}
                    />
                    <p className="text-[10px] uppercase tracking-[0.12em] text-platinum/35">
                      Для сумм больше 100 звёзд обязательно укажите NFT в комментарии
                    </p>
                  </label>
                )}
                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/60">
                  Или введите другую сумму
                  <input
                    className="rounded-2xl border border-white/15 bg-black/60 px-4 py-2 text-sm text-platinum outline-none transition focus:border-gold-400"
                    type="number"
                    min={101}
                    step={1}
                    placeholder="Больше 100"
                    value={customWithdrawAmount}
                    onChange={(event) => {
                      const value = event.target.value.replace(/[^0-9]/g, '');
                      setCustomWithdrawAmount(value);
                      if (value && Number.parseInt(value, 10) > 100) {
                        setWithdrawAmountInput(value);
                        setWithdrawError(null);
                      }
                    }}
                    onBlur={() => {
                      const parsed = Number.parseInt(customWithdrawAmount, 10);
                      if (!customWithdrawAmount || parsed <= 100) {
                        setCustomWithdrawAmount('');
                        if (withdrawAmountInput !== '100' && Number.parseInt(withdrawAmountInput, 10) <= 100) {
                          setWithdrawAmountInput('100');
                        }
                      }
                    }}
                  />
                </label>
              </>
            ) : (
              <>
                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/60">
                  Количество подарков
                  <input
                    className="rounded-2xl border border-white/15 bg-black/60 px-4 py-2 text-sm text-platinum outline-none transition focus:border-gold-400"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="Фиксированно: 1"
                    value={withdrawAmountInput}
                    onChange={(event) => setWithdrawAmountInput(event.target.value.replace(/[^0-9]/g, ''))}
                    disabled
                  />
                </label>
                <p className="text-[11px] uppercase tracking-[0.14em] text-platinum/35">
                  Укажите тип NFT и контакт в примечании — команда подтвердит детали вручную.
                </p>
                <p className="text-[11px] uppercase tracking-[0.14em] text-platinum/35">
                  Комиссия за выдачу: 25 ★
                </p>
              </>
            )}
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/60">
              Реквизиты / контакт
              <textarea
                className="min-h-[80px] rounded-2xl border border-white/15 bg-black/60 px-4 py-2 text-sm text-platinum outline-none transition focus:border-gold-400"
                placeholder="Например: @username или адрес кошелька"
                value={withdrawDestinationInput}
                onChange={(event) => setWithdrawDestinationInput(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/60">
              Примечание для модератора
              <textarea
                className="min-h-[60px] rounded-2xl border border-white/15 bg-black/60 px-4 py-2 text-sm text-platinum outline-none transition focus:border-gold-400"
                placeholder="Дополнительная информация"
                value={withdrawNoteInput}
                onChange={(event) => setWithdrawNoteInput(event.target.value)}
              />
            </label>
            {externalWithdrawUrl ? (
              <a
                className="inline-flex items-center justify-center rounded-full border border-gold-400/45 px-6 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold-200 transition hover:border-gold-200 hover:text-white"
                href={externalWithdrawUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Как оформить вывод на сайте
              </a>
            ) : null}
            {!initDataRaw && (
              <p className="text-xs text-red-300/80">
                Авторизуйтесь в мини-приложении Telegram, чтобы отправить запрос на вывод.
              </p>
            )}
            <button
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-gold-400 to-gold-500 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-night shadow-[0_18px_36px_-18px_rgba(212,175,55,0.55)] transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              disabled={isSubmittingWithdrawal || !initDataRaw}
              onClick={() => {
                void handleWithdrawalSubmit();
              }}
            >
              {isSubmittingWithdrawal ? 'Отправляем…' : 'Создать заявку'}
            </button>
            {withdrawSuccessMessage && (
              <p className="text-xs uppercase tracking-[0.14em] text-emerald-300/80">
                {withdrawSuccessMessage}
              </p>
            )}
            {withdrawError && (
              <p className="text-xs uppercase tracking-[0.14em] text-red-300/80">{withdrawError}</p>
            )}
            {isLoadingWithdrawals && !withdrawError && (
              <p className="text-xs uppercase tracking-[0.14em] text-platinum/50">
                Загружаем предыдущие заявки…
              </p>
            )}
          </div>
          <div className="space-y-3 rounded-3xl border border-white/12 bg-black/40 p-5 shadow-[0_20px_40px_rgba(10,12,19,0.35)]">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-platinum/70">История выводов</h3>
            {withdrawals.length === 0 ? (
              <p className="text-xs text-platinum/50">Заявки пока не создавались.</p>
            ) : (
              <div className="space-y-3">
                {withdrawals.map((withdrawal) => (
                  <div
                    key={withdrawal.id}
                    className="rounded-2xl border border-white/15 bg-black/55 p-4 text-xs text-platinum/70"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-platinum">
                        {withdrawal.amount.toLocaleString('ru-RU')} {withdrawal.currency}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-3 py-1 font-semibold uppercase tracking-[0.14em] ${
                          withdrawal.status === 'SENT'
                            ? 'bg-emerald-500/20 text-emerald-200'
                            : withdrawal.status === 'REJECTED'
                              ? 'bg-red-500/20 text-red-200'
                              : withdrawal.status === 'APPROVED'
                                ? 'bg-indigo-500/20 text-indigo-200'
                                : 'bg-yellow-500/20 text-yellow-100'
                        }`}
                      >
                        {withdrawal.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-platinum/45">
                      {withdrawal.type === 'NFT_GIFT' ? 'NFT-подарок' : 'Звёзды'} ·{' '}
                      {new Date(withdrawal.createdAt).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                    <p className="mt-2 break-words text-[11px] uppercase tracking-[0.14em] text-platinum/45">
                      {withdrawal.destination}
                    </p>
                    {withdrawal.processedAt ? (
                      <p className="text-[11px] uppercase tracking-[0.14em] text-platinum/35">
                        Обработано: {new Date(withdrawal.processedAt).toLocaleString('ru-RU')}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      </section>
    </section>
  );
}
