'use client';

import React, { FormEvent, useMemo, useState } from 'react';

import { useTelegram } from '@/context/TelegramContext';
import { useTelegramApi } from '@/hooks/useTelegramApi';

export default function PromoCodesPage(): React.JSX.Element {
  const api = useTelegramApi();
  const { initDataRaw } = useTelegram();
  const [code, setCode] = useState<string>('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const placeholder = useMemo(
    () => (status ? 'Введите новый промокод' : 'Введите код, например ASTRO-STAR-2025'),
    [status]
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code.trim() || !initDataRaw) {
      setError('Отсутствует подключение к Telegram WebApp.');
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    setError(null);

    try {
      const response = await fetch('/api/mini-app/promocodes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initDataRaw,
        },
        body: JSON.stringify({ code: code.trim() }),
      });

      const data = await response.json().catch(() => null) as { success?: boolean; reward?: number; error?: string } | null;

      if (!response.ok) {
        // Обрабатываем ошибки и выдаем понятные сообщения
        let errorMsg = 'Промокод не найден';
        
        if (data?.error) {
          const errorText = data.error.toLowerCase();
          // Проверяем тип ошибки
          if (errorText.includes('не найден') || errorText.includes('not found')) {
            errorMsg = 'Промокод не найден';
          } else if (errorText.includes('истёк') || errorText.includes('expired')) {
            errorMsg = 'Срок действия промокода истёк';
          } else if (errorText.includes('лимит') || errorText.includes('limit')) {
            errorMsg = 'Лимит активаций промокода исчерпан';
          } else if (errorText.includes('уже активировал') || errorText.includes('duplicate')) {
            errorMsg = 'Вы уже активировали этот промокод';
          } else if (errorText.includes('ещё не активирован')) {
            errorMsg = 'Промокод ещё не активирован';
          } else if (errorText.includes('prisma') || errorText.includes('database') || errorText.includes('db') || errorText.includes('error')) {
            // Скрываем технические ошибки
            errorMsg = 'Промокод не найден';
          } else {
            // Используем оригинальное сообщение, если оно понятное
            errorMsg = data.error;
          }
        }
        
        setError(errorMsg);
        return;
      }

      if (data?.success) {
        const reward = data.reward ?? 0;
        setStatus(
          reward > 0
            ? `Промокод активирован! +${reward} ★ добавлено на баланс.`
            : 'Промокод активирован.'
        );
        setCode('');
      } else if (data?.error) {
        setError(data.error);
      } else {
        setError('Не удалось активировать промокод.');
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Ошибка при активации промокода.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="space-y-6">
      <header className="relative space-y-2">
        <div className="relative z-10 space-y-2">
          <p className="ui-kicker">Промокоды</p>
          <h1 className="ui-title">Активируйте промокоды и получайте бусты</h1>
          <p className="ui-lead max-w-[48ch]">
            Вводите персональные и глобальные промокоды, чтобы получать ускорители
            опыта, дополнительные звёзды и эксклюзивные скины.
          </p>
        </div>
      </header>

      <form
        className="ui-card ui-card-glass ui-card-gold ui-card-pad space-y-4"
        data-garland="1"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <label className="flex flex-col gap-2 text-sm text-platinum/80">
          <span className="ui-kicker">Промокод</span>
          <input
            className="ui-input font-semibold tracking-[0.12em]"
            inputMode="text"
            name="promo"
            placeholder={placeholder}
            required
            type="text"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </label>
        <button
          className="ui-btn ui-btn-primary w-full"
          disabled={isSubmitting || !code.trim()}
          type="submit"
        >
          {isSubmitting ? 'Отправка…' : 'Активировать'}
        </button>
        {(status || error) && (
          <p
            className={`ui-chip ${status ? 'ui-chip-gold' : ''} ${
              status ? 'text-emerald-200' : 'text-red-200'
            }`}
          >
            {status ?? error}
          </p>
        )}
      </form>

      <div className="space-y-3 text-sm">
        <p className="ui-kicker">Доступные бонусы</p>
        <ul className="space-y-2 text-platinum/70">
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-gold-400" />
            <span>«STELLAR-BOOST» — +15% к выигрышам в раннере (24 часа).</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-gold-400" />
            <span>«NOVA-KEY» — бесплатное открытие кейса уровня Epic.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-gold-400" />
            <span>«GOLDEN-SPIN» — дополнительная попытка в рулетке.</span>
          </li>
        </ul>
      </div>
    </section>
  );
}
