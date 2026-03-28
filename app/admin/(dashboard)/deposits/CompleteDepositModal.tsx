'use client';

import React, { useState } from 'react';
import { completeDepositAction } from './actions';

type CompleteDepositModalProps = {
  depositId: string;
  defaultStars: number;
  userName: string;
  isOpen: boolean;
  onClose: () => void;
};

export default function CompleteDepositModal({
  depositId,
  defaultStars,
  userName,
  isOpen,
  onClose
}: CompleteDepositModalProps): React.JSX.Element | null {
  const [stars, setStars] = useState<string>(defaultStars.toString());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('depositId', depositId);
      formData.append('stars', stars);

      await completeDepositAction(formData);
      onClose();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при зачислении звёзд');
    } finally {
      setIsSubmitting(false);
    }
  };

  const parsedStars = Number.parseInt(stars, 10);
  const isValidStars = !Number.isNaN(parsedStars) && parsedStars > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-blue-400/30 bg-blue-900/40 backdrop-blur-md p-6 shadow-xl">
        <h2 className="mb-4 text-xl font-bold text-white">Зачисление звёзд</h2>
        
        <div className="mb-4 space-y-2">
          <p className="text-sm text-blue-200">
            Пользователь: <span className="font-semibold text-white">{userName}</span>
          </p>
          <p className="text-sm text-blue-200">
            Запрошено: <span className="font-semibold text-gold-300">{defaultStars} ★</span>
          </p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <label className="flex flex-col gap-2 text-sm text-blue-200">
            Количество звёзд для зачисления
            <input
              className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30"
              type="number"
              min={1}
              value={stars}
              onChange={(e) => {
                setStars(e.target.value);
                setError(null);
              }}
              placeholder={defaultStars.toString()}
              required
            />
            <p className="text-xs text-blue-300/70">
              Оставьте значение по умолчанию или укажите другое количество
            </p>
          </label>

          {error && (
            <div className="rounded-lg border border-red-400/50 bg-red-500/20 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              className="flex-1 rounded-lg border border-blue-400/50 bg-blue-500/20 px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-blue-100 transition hover:bg-blue-500/30 hover:border-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Отмена
            </button>
            <button
              className="flex-1 rounded-lg border border-gold-400/50 bg-gold-500/20 px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-gold-100 transition hover:bg-gold-500/30 hover:border-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
              type="submit"
              disabled={isSubmitting || !isValidStars}
            >
              {isSubmitting ? 'Зачисление...' : 'Подтвердить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
