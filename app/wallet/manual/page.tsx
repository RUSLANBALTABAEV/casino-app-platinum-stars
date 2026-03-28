'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useTelegram } from '@/context/TelegramContext';
import {
  DEFAULT_ECONOMY_CONFIG,
  type EconomyConfig,
} from '@/lib/config/economy-default';
import { buildTelegramAuthHeaders } from '@/lib/telegram';

type EconomyResponsePayload = {
  economy?: EconomyConfig;
  error?: string;
};

export default function ManualDepositPage(): React.JSX.Element {
  const router = useRouter();
  const { initDataRaw } = useTelegram();
  const [starsInput, setStarsInput] = useState<string>('100');
  const [paymentPurpose, setPaymentPurpose] = useState<string>('');
  const [economyConfig, setEconomyConfig] = useState<EconomyConfig>(DEFAULT_ECONOMY_CONFIG);
  const [isLoadingEconomy, setIsLoadingEconomy] = useState<boolean>(false);
  const [economyError, setEconomyError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
          const errorMsg = payload?.error || 'Не удалось загрузить экономику.';
          throw new Error(errorMsg);
        }
        const rawEconomy = (payloadRaw && typeof payloadRaw === 'object' && payloadRaw !== null && 'economy' in payloadRaw) 
          ? (payloadRaw as any).economy 
          : null;
        const economyData = payload.economy || rawEconomy;
        
        if (economyData && typeof economyData === 'object') {
          setEconomyConfig(economyData);
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

  const starsAmount = useMemo(() => {
    const parsed = Number.parseInt(starsInput, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }, [starsInput]);

  const customPurchase = economyConfig.customPurchase;
  const rubAmount = useMemo(() => {
    if (!starsAmount) {
      return null;
    }
    return Math.ceil(starsAmount * customPurchase.rubPerStar);
  }, [starsAmount, customPurchase.rubPerStar]);

  const isValidAmount = useMemo(() => {
    if (!starsAmount) {
      return false;
    }
    return (
      starsAmount >= customPurchase.minStars &&
      starsAmount <= customPurchase.maxStars
    );
  }, [starsAmount, customPurchase.minStars, customPurchase.maxStars]);

  const handleCreateRequest = useCallback(async () => {
    if (!isValidAmount || !starsAmount || !rubAmount || isCreating || !initDataRaw || !paymentPurpose) {
      setErrorMessage('Выберите назначение платежа');
      return;
    }

    setIsCreating(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/mini-app/deposits/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initDataRaw
        },
        body: JSON.stringify({
          stars: starsAmount,
          rubAmount,
          paymentPurpose
        })
      });

      const payload = (await response.json()) as { depositRequestId?: string; error?: string };

      if (!response.ok || !payload.depositRequestId) {
        throw new Error(payload?.error ?? 'Не удалось создать запрос на пополнение');
      }

      // Перенаправляем на страницу с реквизитами
      router.push(`/wallet/manual/${payload.depositRequestId}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Ошибка при создании запроса');
    } finally {
      setIsCreating(false);
    }
  }, [isValidAmount, starsAmount, rubAmount, paymentPurpose, isCreating, initDataRaw, router]);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.12em] text-platinum/70">Ручное пополнение</p>
        <h1 className="text-3xl font-semibold tracking-tight text-platinum">
          Пополнение через банковский перевод
        </h1>
        <p className="max-w-[48ch] text-sm text-platinum/60">
          Укажите количество звёзд для пополнения. После создания запроса вы получите реквизиты для перевода.
        </p>
      </header>

      {economyError && (
        <p className="rounded-3xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-xs text-red-200">
          {economyError}
        </p>
      )}

      {!economyError && isLoadingEconomy && (
        <p className="text-xs uppercase tracking-[0.16em] text-platinum/50">
          Загружаем курсы…
        </p>
      )}

      <div className="space-y-4 rounded-3xl border border-gold-400/40 bg-black/40 p-6">
        <label className="flex flex-col gap-2 text-sm text-platinum/70">
          Количество звёзд
          <input
            className="rounded-2xl border border-gold-400/40 bg-black/60 px-4 py-3 text-lg text-platinum outline-none transition focus:border-gold-400"
            min={customPurchase.minStars}
            max={customPurchase.maxStars}
            placeholder={`${customPurchase.minStars} — ${customPurchase.maxStars}`}
            type="number"
            value={starsInput}
            onChange={(event) => {
              const value = event.target.value.replace(/\D/g, '');
              setStarsInput(value);
            }}
          />
        </label>

        {starsAmount && rubAmount && (
          <div className="space-y-2 rounded-2xl border border-gold-400/20 bg-black/60 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-platinum/50">Стоимость</p>
            <p className="text-2xl font-bold text-gold-400">
              {rubAmount.toLocaleString('ru-RU')} ₽
            </p>
            <p className="text-xs text-platinum/60">
              По {customPurchase.rubPerStar.toFixed(2).replace('.', ',')} ₽ за 1 ★
            </p>
          </div>
        )}

        {!isValidAmount && starsAmount && (
          <p className="text-xs text-red-300/80">
            Количество должно быть от {customPurchase.minStars.toLocaleString('ru-RU')} до{' '}
            {customPurchase.maxStars.toLocaleString('ru-RU')} звёзд
          </p>
        )}

        <label className="flex flex-col gap-2 text-sm text-platinum/70">
          Назначение платежа <span className="text-red-400">*</span>
          <select
            className="rounded-2xl border border-gold-400/40 bg-black/60 px-4 py-3 text-platinum outline-none transition focus:border-gold-400"
            value={paymentPurpose}
            onChange={(event) => {
              setPaymentPurpose(event.target.value);
              setErrorMessage(null);
            }}
            required
          >
            <option value="">-- Выберите назначение --</option>
            <option value="долг">долг</option>
            <option value="подарок">подарок</option>
            <option value="занимаю">занимаю</option>
          </select>
          {!paymentPurpose && (
            <p className="text-xs text-red-300/80">
              Назначение платежа обязательно для указания при переводе
            </p>
          )}
        </label>

        <button
          className="w-full rounded-full bg-gradient-to-r from-gold-400 to-gold-500 px-8 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-night shadow-[0_20px_30px_-12px_rgba(212,175,55,0.55)] transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!isValidAmount || isCreating || !initDataRaw || !paymentPurpose}
          onClick={() => {
            void handleCreateRequest();
          }}
          type="button"
        >
          {isCreating ? 'Создаём запрос…' : 'Создать запрос на пополнение'}
        </button>

        {errorMessage && (
          <p className="text-xs uppercase tracking-[0.16em] text-red-300/80">{errorMessage}</p>
        )}
      </div>
    </section>
  );
}

