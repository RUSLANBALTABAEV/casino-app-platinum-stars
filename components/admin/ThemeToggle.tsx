'use client';

import { useEffect, useState } from 'react';

type ThemeValue = 'holiday' | 'regular';

export default function ThemeToggle(): React.JSX.Element {
  const [theme, setTheme] = useState<ThemeValue>('holiday');
  const [isPending, setIsPending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Загружаем текущую тему и синхронизируем с DOM
  useEffect(() => {
    // Сначала читаем из DOM (уже установлено сервером)
    const currentAttr = document.documentElement.dataset.holiday;
    if (currentAttr === '1') {
      setTheme('holiday');
    } else if (currentAttr === '0') {
      setTheme('regular');
    }

    // Затем проверяем актуальное значение из API
    fetch('/api/theme')
      .then((res) => res.json())
      .then((data: { theme: ThemeValue }) => {
        setTheme(data.theme);
        document.documentElement.dataset.holiday = data.theme === 'holiday' ? '1' : '0';
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, []);

  const handleToggle = async () => {
    if (isPending) return;

    const newTheme: ThemeValue = theme === 'holiday' ? 'regular' : 'holiday';

    // Оптимистичное обновление UI
    setTheme(newTheme);
    document.documentElement.dataset.holiday = newTheme === 'holiday' ? '1' : '0';
    setIsPending(true);

    try {
      const res = await fetch('/api/admin/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: newTheme })
      });

      if (!res.ok) {
        // Откатываем при ошибке
        const oldTheme = newTheme === 'holiday' ? 'regular' : 'holiday';
        setTheme(oldTheme);
        document.documentElement.dataset.holiday = oldTheme === 'holiday' ? '1' : '0';
        console.error('Failed to save theme');
      }
    } catch (error) {
      // Откатываем при ошибке
      const oldTheme = newTheme === 'holiday' ? 'regular' : 'holiday';
      setTheme(oldTheme);
      document.documentElement.dataset.holiday = oldTheme === 'holiday' ? '1' : '0';
      console.error('Failed to update theme:', error);
    } finally {
      setIsPending(false);
    }
  };

  const isHoliday = theme === 'holiday';

  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] uppercase tracking-[0.18em] text-platinum/60">
        Тема оформления
      </span>
      <button
        className="group relative flex h-8 w-[120px] items-center rounded-full border border-white/20 bg-white/5 p-1 transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isPending || isLoading}
        onClick={handleToggle}
        type="button"
      >
        {/* Track labels */}
        <span
          className={`absolute left-3 text-[9px] font-semibold uppercase tracking-[0.1em] transition-opacity ${
            isHoliday ? 'opacity-0' : 'text-platinum/70 opacity-100'
          }`}
        >
          Обычная
        </span>
        <span
          className={`absolute right-2 text-[9px] font-semibold uppercase tracking-[0.1em] transition-opacity ${
            isHoliday ? 'text-cyan-300 opacity-100' : 'opacity-0'
          }`}
        >
          Новый год
        </span>

        {/* Slider thumb */}
        <span
          className={`relative z-10 flex h-6 w-[54px] items-center justify-center rounded-full text-xs font-semibold shadow-md transition-all duration-300 ${
            isHoliday
              ? 'translate-x-[58px] bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
              : 'translate-x-0 bg-gradient-to-r from-zinc-600 to-zinc-700 text-white/80'
          }`}
        >
          {isPending || isLoading ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : isHoliday ? (
            '❄️'
          ) : (
            '☀️'
          )}
        </span>
      </button>
    </div>
  );
}
