'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { useTelegram } from '@/context/TelegramContext';
import { buildTelegramAuthHeaders } from '@/lib/telegram';

type DepositRequest = {
  id: string;
  stars: number;
  rubAmount: number;
  paymentPurpose: string | null;
  status: string;
  createdAt: string;
};

const BANK_ACCOUNT = '2200701947458813';
const BANK_RECEIVER = 'Платон Б';

export default function ManualDepositDetailsPage(): React.JSX.Element {
  const params = useParams();
  const router = useRouter();
  const { initDataRaw, webApp } = useTelegram();
  const depositRequestId = typeof params.id === 'string' ? params.id : null;

  const [depositRequest, setDepositRequest] = useState<DepositRequest | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const handleReceiptClick = () => {
    const url = `https://t.me/${process.env.NEXT_PUBLIC_BOT_USERNAME || 'casinoapptest2026_bot'}`;
    if (webApp?.openTelegramLink) {
      webApp.openTelegramLink(url);
      return;
    }
    if (webApp?.openLink) {
      webApp.openLink(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    if (!depositRequestId || !initDataRaw) {
      setError('Неверный запрос');
      setIsLoading(false);
      return;
    }

    const loadRequest = async () => {
      try {
        const response = await fetch(`/api/mini-app/deposits/manual/${depositRequestId}`, {
          headers: buildTelegramAuthHeaders(initDataRaw)
        });

        const payload = (await response.json()) as { depositRequest?: DepositRequest; error?: string };

        if (!response.ok || !payload.depositRequest) {
          throw new Error(payload?.error ?? 'Не удалось загрузить запрос');
        }

        setDepositRequest(payload.depositRequest);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка загрузки');
      } finally {
        setIsLoading(false);
      }
    };

    void loadRequest();
  }, [depositRequestId, initDataRaw]);

  if (isLoading) {
    return (
      <section className="space-y-6">
        <p className="text-xs uppercase tracking-[0.16em] text-platinum/50">Загрузка…</p>
      </section>
    );
  }

  if (error || !depositRequest) {
    return (
      <section className="space-y-6">
        <p className="text-xs uppercase tracking-[0.16em] text-red-300/80">
          {error ?? 'Запрос не найден'}
        </p>
        <button
          className="rounded-full border border-gold-400/45 px-6 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold-200 transition hover:border-gold-200"
          onClick={() => router.push('/wallet')}
          type="button"
        >
          Вернуться в кошелёк
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.12em] text-platinum/70">Реквизиты для перевода</p>
        <h1 className="text-3xl font-semibold tracking-tight text-platinum">
          Переведите {depositRequest.rubAmount.toLocaleString('ru-RU')} ₽
        </h1>
        <p className="max-w-[48ch] text-sm text-platinum/60">
          После перевода нажмите кнопку "Предоставить чек" в боте для подтверждения пополнения.
        </p>
      </header>

      <div className="space-y-4 rounded-3xl border border-gold-400/40 bg-black/40 p-6">
        <div className="space-y-3">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-platinum/50 mb-1">Номер счёта</p>
            <p className="text-xl font-mono font-semibold text-gold-400">{BANK_ACCOUNT}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-platinum/50 mb-1">Получатель</p>
            <p className="text-lg font-semibold text-platinum">{BANK_RECEIVER}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-platinum/50 mb-1">Сумма</p>
            <p className="text-2xl font-bold text-gold-400">
              {depositRequest.rubAmount.toLocaleString('ru-RU')} ₽
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-platinum/50 mb-1">Назначение платежа</p>
            <p className="text-lg font-semibold text-platinum">
              {depositRequest.paymentPurpose ?? 'долг'}
            </p>
            <p className="text-xs text-platinum/60 mt-1">
              Укажите это назначение при переводе: "{depositRequest.paymentPurpose ?? 'долг'}"
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-platinum/50 mb-1">Вы получите</p>
            <p className="text-2xl font-bold text-gold-400">
              {depositRequest.stars.toLocaleString('ru-RU')} ★
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-4">
          <p className="text-xs text-yellow-300">
            ⚠️ После перевода обязательно нажмите кнопку "Предоставить чек" в боте для подтверждения пополнения.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-4">
            <p className="text-xs text-yellow-300 mb-3">
              ⚠️ После перевода отправьте фото или документ с чеком боту в Telegram.
            </p>
            <p className="text-xs text-platinum/60 mb-3">
              Чек будет автоматически привязан к вашему запросу. Администратор проверит перевод и зачислит звёзды.
            </p>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-full border border-yellow-400/45 bg-yellow-400/20 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-yellow-200 transition hover:border-yellow-300 hover:bg-yellow-400/30"
              onClick={handleReceiptClick}
              type="button"
            >
              📸 Предоставить чек
            </button>
          </div>

          <button
            className="rounded-full border border-gold-400/45 px-6 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold-200 transition hover:border-gold-200"
            onClick={() => router.push('/wallet')}
            type="button"
          >
            Вернуться в кошелёк
          </button>
        </div>
      </div>

      {depositRequest.status !== 'PENDING' && (
        <div className="rounded-3xl border border-platinum/20 bg-black/40 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-platinum/70">
            Статус: {depositRequest.status === 'APPROVED' ? 'Одобрено' : depositRequest.status === 'REJECTED' ? 'Отклонено' : depositRequest.status === 'COMPLETED' ? 'Завершено' : 'В обработке'}
          </p>
        </div>
      )}
    </section>
  );
}
