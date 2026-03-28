// lib/hooks/useStarBalance.ts

"use client";

import { useEffect, useState, useCallback } from "react";
import { useTelegram } from "@/context/TelegramContext";
import { getDemoBalance, isDemoModeEnabled } from "@/lib/demo-mode";

export type UseStarBalanceState = {
  available: number;
  reserved: number;
  lifetimeEarn: number;
  lifetimeSpend: number;
  bonusAvailable: number;
  bonusReserved: number;
  isLoading: boolean;
  status: string | null;
  error: string | null;
};

export type UseStarBalanceResult = {
  state: UseStarBalanceState;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  change: (delta: number) => Promise<void>;
};

export function useStarBalance(): UseStarBalanceResult {
  const { initDataRaw, isReady } = useTelegram();
  const [available, setAvailable] = useState<number>(0);
  const [reserved, setReserved] = useState<number>(0);
  const [lifetimeEarn, setLifetimeEarn] = useState<number>(0);
  const [lifetimeSpend, setLifetimeSpend] = useState<number>(0);
  const [bonusAvailable, setBonusAvailable] = useState<number>(0);
  const [bonusReserved, setBonusReserved] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    const demoMode = isDemoModeEnabled();
    if (!initDataRaw || !isReady) {
      if (!demoMode) {
        setError("Telegram данные не загружены");
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/mini-app/balance", {
        method: "GET",
        headers: {
          ...(initDataRaw ? { "x-telegram-init-data": initDataRaw } : {}),
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const message = data && typeof data.error === "string" ? data.error : "Ошибка загрузки баланса";
        setError(message);
        setIsLoading(false);
        return;
      }

      const data = await response.json();
      if (data.success && typeof data.available === "number") {
        setAvailable(data.available);
        setReserved(data.reserved || 0);
        setLifetimeEarn(data.lifetimeEarn || 0);
        setLifetimeSpend(data.lifetimeSpend || 0);
        setBonusAvailable(data.bonusAvailable || 0);
        setBonusReserved(data.bonusReserved || 0);
      } else {
        setError("Некорректный формат ответа сервера");
      }
    } catch (err) {
      console.error("Ошибка запроса баланса:", err);
      const demoFallback = getDemoBalance();
      setAvailable(demoFallback.available);
      setReserved(demoFallback.reserved);
      setLifetimeEarn(demoFallback.lifetimeEarn);
      setLifetimeSpend(demoFallback.lifetimeSpend);
      setBonusAvailable(demoFallback.bonusAvailable);
      setBonusReserved(demoFallback.bonusReserved);
      setError(isDemoModeEnabled() ? null : "Сетевая ошибка при запросе баланса");
    } finally {
      setIsLoading(false);
    }
  }, [initDataRaw, isReady]);

  const changeBalance = useCallback(
    async (delta: number) => {
      const demoMode = isDemoModeEnabled();
      if (!initDataRaw || !isReady) {
        if (!demoMode) {
          setError("Telegram данные не загружены");
          return;
        }
      }

      try {
        const response = await fetch("/api/mini-app/balance", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-telegram-init-data": initDataRaw,
          },
          body: JSON.stringify({
            delta: delta,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          const message = data && typeof data.error === "string" ? data.error : "Ошибка изменения баланса";
          setError(message);
          return;
        }

        const data = await response.json();
        if (data.success && typeof data.available === "number") {
          setAvailable(data.available);
          setReserved(data.reserved || 0);
          setLifetimeEarn(data.lifetimeEarn || 0);
          setLifetimeSpend(data.lifetimeSpend || 0);
          setBonusAvailable(data.bonusAvailable || 0);
          setBonusReserved(data.bonusReserved || 0);
        } else {
          setError("Некорректный формат ответа сервера при изменении баланса");
        }
      } catch (err) {
        console.error("Ошибка изменения баланса:", err);
        setError(isDemoModeEnabled() ? null : "Сетевая ошибка при изменении баланса");
      }
    },
    [initDataRaw, isReady]
  );

  useEffect(() => {
    if (isReady && (initDataRaw || isDemoModeEnabled())) {
      fetchBalance();
    } else if (isReady && !initDataRaw) {
      setIsLoading(false);
      setError(isDemoModeEnabled() ? null : "Откройте мини-приложение в Telegram");
    }
  }, [isReady, initDataRaw, fetchBalance]);

  return {
    state: {
      available,
      reserved,
      lifetimeEarn,
      lifetimeSpend,
      bonusAvailable,
      bonusReserved,
      isLoading,
      status: isLoading ? 'loading' : error ? 'error' : 'ready',
      error,
    },
    reload: fetchBalance,
    refresh: fetchBalance,
    change: changeBalance,
  };
}
