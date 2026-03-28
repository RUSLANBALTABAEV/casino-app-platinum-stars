'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useTelegram } from '@/context/TelegramContext';
import { buildTelegramAuthHeaders } from '@/lib/telegram';

const CASES_SRC = '/arcade/star-cases/index.html';

type CaseItem = {
  name: string;
  rarity: string;
  weight: number;
  chance?: number;
  color?: string;
  stars?: number;
  description?: string;
};

type CaseEntry = {
  id: string;
  name: string;
  price: number;
  description?: string;
  items: CaseItem[];
};

type CaseConfig = {
  cases: CaseEntry[];
};

const DEFAULT_CASE_CONFIG: CaseConfig = {
  cases: [
    {
      id: 'astro',
      name: 'Astro Explorer',
      price: 120,
      description: 'Соберите экипировку первооткрывателя и найдите легендарные артефакты галактики.',
      items: [
        { name: 'Шлем пионера', rarity: 'Эпический', weight: 6, chance: 6, color: '#c084fc' },
        { name: 'Плащ кометы', rarity: 'Редкий', weight: 14, chance: 14, color: '#38bdf8' },
        { name: 'Карманный магнитар', rarity: 'Легендарный', weight: 2, chance: 2, color: '#fbbf24' },
        { name: 'Астро-компас', rarity: 'Необычный', weight: 22, chance: 22, color: '#60a5fa' },
        { name: 'Пыль звёзд', rarity: 'Обычный', weight: 56, chance: 56, color: '#f4f4f5' }
      ]
    },
    {
      id: 'nova',
      name: 'Nova Elite',
      price: 220,
      description: 'Премиум-набор для лидеров сезонов. Бонусы и увеличенные шансы на звёзды.',
      items: [
        { name: 'Знак Новы', rarity: 'Легендарный', weight: 4, chance: 4, color: '#f97316' },
        { name: 'Звёздный бустер', rarity: 'Эпический', weight: 10, chance: 10, color: '#c084fc' },
        { name: '500 ★', rarity: 'Редкий', weight: 16, chance: 16, color: '#facc15', stars: 500 },
        { name: '200 ★', rarity: 'Необычный', weight: 28, chance: 28, color: '#fde68a', stars: 200 },
        { name: '95 ★', rarity: 'Обычный', weight: 42, chance: 42, color: '#fff7ed', stars: 95 }
      ]
    },
    {
      id: 'guardian',
      name: 'Guardian Arsenal',
      price: 160,
      description: 'Снаряжение защитника арен. Усилители защиты и редкие жетоны.',
      items: [
        { name: 'Щит света', rarity: 'Эпический', weight: 8, chance: 8, color: '#22d3ee' },
        { name: 'Армейский дрон', rarity: 'Редкий', weight: 18, chance: 18, color: '#38bdf8' },
        { name: 'Жетон арены', rarity: 'Редкий', weight: 20, chance: 20, color: '#a5b4fc' },
        { name: 'Боевой стим', rarity: 'Необычный', weight: 24, chance: 24, color: '#f4f4f5' },
        { name: '75 ★', rarity: 'Обычный', weight: 30, chance: 30, color: '#fde68a', stars: 75 }
      ]
    },
    {
      id: 'starlounge',
      name: 'Star Lounge',
      price: 90,
      description: 'Кейс для быстрого пополнения коллекции. Бонусы для ежедневных миссий.',
      items: [
        { name: 'Аватар премиум', rarity: 'Редкий', weight: 12, chance: 12, color: '#fbbf24' },
        { name: 'Билет лотереи', rarity: 'Необычный', weight: 20, chance: 20, color: '#60a5fa' },
        { name: '45 ★', rarity: 'Обычный', weight: 40, chance: 40, color: '#fde68a', stars: 45 },
        { name: '25 ★', rarity: 'Обычный', weight: 28, chance: 28, color: '#fef3c7', stars: 25 }
      ]
    }
  ]
};

function isCaseConfig(value: unknown): value is CaseConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  const casesValue = record.cases;
  return Array.isArray(casesValue) && casesValue.length > 0;
}

export default function CaseGame(): React.JSX.Element {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const configRef = useRef<CaseConfig>(DEFAULT_CASE_CONFIG);
  const { initDataRaw } = useTelegram();

  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [config, setConfig] = useState<CaseConfig>(DEFAULT_CASE_CONFIG);

  useEffect(() => {
    configRef.current = config;
    if (!isLoaded) {
      return;
    }
    const frameWindow = frameRef.current?.contentWindow;
    if (frameWindow) {
      frameWindow.postMessage({ type: 'STAR_CASES_CONFIG', payload: config }, '*');
    }
  }, [config, isLoaded]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const handleLoad = () => {
      setIsLoaded(true);
      const frameWindow = frame.contentWindow;
      if (frameWindow) {
        frameWindow.postMessage({ type: 'STAR_CASES_CONFIG', payload: configRef.current }, '*');
      }
    };
    frame.addEventListener('load', handleLoad);

    return () => {
      frame.removeEventListener('load', handleLoad);
    };
  }, []);

  useEffect(() => {
    if (!initDataRaw) {
      return;
    }
    const controller = new AbortController();

    const loadConfig = async () => {
      try {
        const response = await fetch('/api/mini-app/games/config?gameType=CASE', {
          headers: buildTelegramAuthHeaders(initDataRaw),
          signal: controller.signal
        });

        if (!response.ok) {
          return;
        }

        const result = (await response.json()) as unknown;
        if (!result || typeof result !== 'object') {
          return;
        }

        const configValue = (result as Record<string, unknown>).config;
        if (isCaseConfig(configValue)) {
          setConfig(configValue);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
      }
    };

    void loadConfig();

    return () => {
      controller.abort();
    };
  }, [initDataRaw]);

  const loadingLabel = useMemo(
    () => (config === DEFAULT_CASE_CONFIG ? 'Загрузка кейсов…' : 'Обновление конфигурации…'),
    [config]
  );

  return (
    <div
      className="relative isolate -mx-4 -mt-4 flex min-h-[calc(100dvh-96px)] flex-1 flex-col overflow-hidden rounded-3xl border border-gold-400/35 bg-black/80 shadow-[0_24px_64px_-24px_rgba(212,175,55,0.35)] sm:-mx-6 sm:-mt-6 lg:-mx-8"
      style={{ minHeight: 'calc(var(--tg-viewport-height, 100dvh) - 96px)' }}
    >
      {!isLoaded && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-black/70 via-black/60 to-black/80 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold-400/70 border-t-transparent" />
          <p className="text-xs uppercase tracking-[0.18em] text-platinum/60">{loadingLabel}</p>
        </div>
      )}

      <iframe
        allow="fullscreen"
        className="h-full w-full flex-1 border-none"
        ref={frameRef}
        src={CASES_SRC}
        title="Star Cases"
      />
    </div>
  );
}
