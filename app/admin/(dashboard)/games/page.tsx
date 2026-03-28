/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

import React from 'react';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { CaseEditor } from '@/components/admin/games/CaseEditor';
import { RouletteEditor } from '@/components/admin/games/RouletteEditor';
import { RunnerEditor } from '@/components/admin/games/RunnerEditor';
import { LotteryEditor } from '@/components/admin/games/LotteryEditor';
import { SimpleJsonEditor } from '@/components/admin/games/SimpleJsonEditor';
import { GameOddsEditor } from '@/components/admin/games/GameOddsEditor';
import { getDefaultCaseConfig } from '@/lib/config/case-default';
import { prisma } from '@/lib/prisma';
import { getGameSetting } from '@/lib/services/game-settings';
import {
  saveCaseConfigAction,
  saveGameAvailabilityAction,
  saveGenericGameConfigAction,
  saveLotteryConfigAction,
  saveNftGiftsAction,
  saveRouletteConfigAction,
  saveRunnerConfigAction
} from './actions';

const CARD_CLASS =
  'space-y-4 py-4';

const DEFAULT_ROULETTE_CONFIG = {
  spinCost: 12,
  slots: {
    stakeOptions: [10, 25, 50, 100],
    compoundPercent: 8,
    nftChance: 2,
    nftGiftIds: ['gift-snowflake', 'gift-comet']
  },
  sectors: [
    {
      name: '25 ★',
      rewardType: 'stars',
      value: 25,
      weight: 1.1,
      description: 'Базовый выигрыш',
      primary: 'rgba(212,175,55,0.95)',
      secondary: 'rgba(212,175,55,0.45)'
    },
    {
      name: 'x2',
      rewardType: 'multiplier',
      value: 2,
      weight: 0.8,
      description: 'Двойной множитель',
      primary: 'rgba(104,220,255,0.95)',
      secondary: 'rgba(104,220,255,0.45)'
    },
    {
      name: 'x5',
      rewardType: 'multiplier',
      value: 5,
      weight: 0.34,
      description: 'Редкий буст на один спин',
      primary: 'rgba(146,111,255,0.95)',
      secondary: 'rgba(146,111,255,0.45)'
    },
    {
      name: 'Jackpot 150 ★',
      rewardType: 'stars',
      value: 150,
      weight: 0.12,
      description: 'Главный приз сезона',
      primary: 'rgba(255,179,71,0.95)',
      secondary: 'rgba(255,179,71,0.4)'
    }
  ]
};

const DEFAULT_CASES_CONFIG = getDefaultCaseConfig();

const DEFAULT_LOTTERY_CONFIG = {
  pools: [
    {
      id: 'nova-10',
      name: 'Nova 10',
      participantLimit: 10,
      ticketCost: 5,
      prizePercent: 0.82,
      distribution: [
        { place: 1, share: 0.7 },
        { place: 2, share: 0.3 }
      ]
    },
    {
      id: 'quantum-15',
      name: 'Quantum 15',
      participantLimit: 15,
      ticketCost: 9,
      prizePercent: 0.88,
      distribution: [
        { place: 1, share: 0.6 },
        { place: 2, share: 0.25 },
        { place: 3, share: 0.15 }
      ]
    },
    {
      id: 'apex-25',
      name: 'Apex 25',
      participantLimit: 25,
      ticketCost: 12,
      prizePercent: 0.9,
      distribution: [
        { place: 1, share: 0.5 },
        { place: 2, share: 0.25 },
        { place: 3, share: 0.15 },
        { place: 4, share: 0.1 }
      ]
    }
  ]
};

const DEFAULT_RUNNER_CONFIG = {
  attemptCost: 6,
  freeAttemptsPerDay: 1,
  cooldownSeconds: 45,
  payouts: [
    { threshold: 900, reward: 6, label: 'Разогрев' },
    { threshold: 1400, reward: 14, label: 'Гиперразгон' },
    { threshold: 2000, reward: 30, label: 'Луч сезона' },
    { threshold: 2600, reward: 55, label: 'Сверхновая' }
  ]
};

const DEFAULT_NFT_CONFIG = [
  {
    id: 'gift-snowflake',
    name: 'Снежная искра',
    rarity: 'Эпический',
    imageUrl: '/gifts/snowflake.svg',
    telegramGiftId: 'snowflake',
    priceStars: 0,
    priceBonus: 0,
    isActive: true
  },
  {
    id: 'gift-comet',
    name: 'Комета',
    rarity: 'Легендарный',
    imageUrl: '/gifts/comet.svg',
    telegramGiftId: 'comet',
    priceStars: 0,
    priceBonus: 0,
    isActive: true
  }
];

const DEFAULT_EXTRA_GAME_CONFIGS = {
  MINES: {
    baseBet: 10,
    winChance: 0.55,
    maxMultiplier: 6,
    nftChance: 1.5
  },
  COINFLIP: {
    winChance: 0.49,
    multiplier: 2,
    nftChance: 1
  },
  TICTACTOE: {
    winChance: 0.46,
    drawChance: 0.08,
    multiplier: 2.2
  },
  UPGRADE: {
    winChance: 0.42,
    multiplier: 2.6,
    nftChance: 1
  },
  BATTLE: {
    minPlayers: 2,
    maxPlayers: 2,
    winnerTakesAll: true
  },
  CRAFT: {
    requiredCount: 3,
    rarityOrder: ['Обычный', 'Необычный', 'Редкий', 'Эпический', 'Легендарный', 'Мифический']
  },
  CRASH: {
    baseBet: 10,
    maxMultiplier: 12,
    autoCashout: 1.6,
    roundDelay: 4
  }
};

type RouletteConfigValue = {
  spinCost?: number;
  sectors?: unknown;
  variant?: string;
  slots?: unknown;
};

type CaseConfigValue = {
  cases?: unknown;
};

type LotteryConfigValue = {
  pools?: unknown;
};

type RunnerConfigValue = {
  attemptCost?: number;
  payouts?: unknown;
  freeAttemptsPerDay?: unknown;
  cooldownSeconds?: unknown;
};

function isRouletteConfigValue(value: unknown): value is RouletteConfigValue {
  return typeof value === 'object' && value !== null;
}

function isCaseConfigValue(value: unknown): value is CaseConfigValue {
  return typeof value === 'object' && value !== null && Array.isArray((value as { cases?: unknown }).cases);
}

function isLotteryConfigValue(value: unknown): value is LotteryConfigValue {
  return typeof value === 'object' && value !== null && Array.isArray((value as { pools?: unknown }).pools);
}

function isRunnerConfigValue(value: unknown): value is RunnerConfigValue {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as RunnerConfigValue;
  return (
    (typeof record.attemptCost === 'number' && Array.isArray(record.payouts)) ||
    (typeof record.attemptCost === 'number' && Array.isArray(record.payouts))
  );
}

function stringifyConfig(value: unknown, fallback: unknown): string {
  try {
    const target = value ?? fallback;
    return JSON.stringify(target, null, 2);
  } catch {
    return JSON.stringify(fallback, null, 2);
  }
}

export default async function AdminGamesPage(): Promise<React.JSX.Element> {
  const isMockMode = !process.env.DATABASE_URL;

  let loadError: string | null = null;
  let rouletteSetting = null;
  let caseSetting = null;
  let lotterySetting = null;
  let runnerSetting = null;
  let extraSettings: Array<{ value?: unknown } | null> = [];
  let availabilitySettings: Array<{ value?: unknown } | null> = [];
  let nftGifts: Array<Record<string, unknown>> = [];

  if (!isMockMode) {
    try {
      [rouletteSetting, caseSetting, lotterySetting, runnerSetting, extraSettings, availabilitySettings, nftGifts] =
        await Promise.all([
          getGameSetting('ROULETTE', 'config'),
          getGameSetting('CASE', 'config'),
          getGameSetting('LOTTERY', 'config'),
          getGameSetting('RUNNER', 'config'),
          Promise.all([
            getGameSetting('MINES', 'config'),
            getGameSetting('COINFLIP', 'config'),
            getGameSetting('TICTACTOE', 'config'),
            getGameSetting('UPGRADE', 'config'),
            getGameSetting('BATTLE', 'config'),
            getGameSetting('CRAFT', 'config'),
            getGameSetting('CRASH', 'config')
          ]),
          Promise.all([
            getGameSetting('ROULETTE', 'status'),
            getGameSetting('CASE', 'status'),
            getGameSetting('LOTTERY', 'status'),
            getGameSetting('RUNNER', 'status'),
            getGameSetting('CRASH', 'status'),
            getGameSetting('MINES', 'status'),
            getGameSetting('COINFLIP', 'status'),
            getGameSetting('TICTACTOE', 'status'),
            getGameSetting('UPGRADE', 'status'),
            getGameSetting('BATTLE', 'status'),
            getGameSetting('CRAFT', 'status')
          ]),
          prisma.nftGift.findMany({ orderBy: { updatedAt: 'desc' } })
        ]);
    } catch (error) {
      loadError = error instanceof Error ? error.message : 'Ошибка загрузки настроек игр.';
      rouletteSetting = null;
      caseSetting = null;
      lotterySetting = null;
      runnerSetting = null;
      extraSettings = [];
      availabilitySettings = [];
      nftGifts = [];
    }
  }

  const rouletteConfig = isRouletteConfigValue(rouletteSetting?.value)
    ? (rouletteSetting?.value as RouletteConfigValue)
    : undefined;
  const resolvedSpinCost =
    typeof rouletteConfig?.spinCost === 'number' ? rouletteConfig.spinCost : DEFAULT_ROULETTE_CONFIG.spinCost;
  const resolvedVariant =
    typeof rouletteConfig?.variant === 'string' && rouletteConfig.variant.toLowerCase() === 'slots'
      ? 'slots'
      : 'wheel';
  const rouletteFormValue = stringifyConfig(
    rouletteConfig
      ? {
          spinCost: resolvedSpinCost,
          variant: resolvedVariant,
          sectors: Array.isArray(rouletteConfig.sectors)
            ? rouletteConfig.sectors
            : DEFAULT_ROULETTE_CONFIG.sectors,
          slots:
            typeof rouletteConfig.slots === 'object' && rouletteConfig.slots
              ? rouletteConfig.slots
              : DEFAULT_ROULETTE_CONFIG.slots
        }
      : DEFAULT_ROULETTE_CONFIG,
    DEFAULT_ROULETTE_CONFIG
  );

  const casesConfig = isCaseConfigValue(caseSetting?.value) ? (caseSetting?.value as CaseConfigValue) : undefined;
  const casesTextareaValue = stringifyConfig(casesConfig, DEFAULT_CASES_CONFIG);

  const lotteryConfig = isLotteryConfigValue(lotterySetting?.value)
    ? (lotterySetting?.value as LotteryConfigValue)
    : undefined;
  const lotteryTextareaValue = stringifyConfig(lotteryConfig, DEFAULT_LOTTERY_CONFIG);

  const runnerConfig = isRunnerConfigValue(runnerSetting?.value)
    ? (runnerSetting?.value as RunnerConfigValue)
    : undefined;
  const runnerTextareaValue = stringifyConfig(runnerConfig, DEFAULT_RUNNER_CONFIG);

  const extraConfigMap = isMockMode
    ? {}
    : {
        MINES: extraSettings[0]?.value,
        COINFLIP: extraSettings[1]?.value,
        TICTACTOE: extraSettings[2]?.value,
        UPGRADE: extraSettings[3]?.value,
        BATTLE: extraSettings[4]?.value,
        CRAFT: extraSettings[5]?.value,
        CRASH: extraSettings[6]?.value
      };

  const nftTextareaValue = stringifyConfig(
    nftGifts?.length ? nftGifts : DEFAULT_NFT_CONFIG,
    DEFAULT_NFT_CONFIG
  );

  const resolveAvailability = (value: unknown) => {
    if (!value || typeof value !== 'object') {
      return { enabled: true, message: 'Игра временно недоступна.' };
    }
    const record = value as Record<string, unknown>;
    const enabled =
      typeof record.enabled === 'boolean'
        ? record.enabled
        : typeof record.disabled === 'boolean'
          ? !record.disabled
          : true;
    const message = typeof record.message === 'string' ? record.message : 'Игра временно недоступна.';
    return { enabled, message };
  };

  const availabilityMap = {
    ROULETTE: resolveAvailability(availabilitySettings[0]?.value),
    CASE: resolveAvailability(availabilitySettings[1]?.value),
    LOTTERY: resolveAvailability(availabilitySettings[2]?.value),
    RUNNER: resolveAvailability(availabilitySettings[3]?.value),
    CRASH: resolveAvailability(availabilitySettings[4]?.value),
    MINES: resolveAvailability(availabilitySettings[5]?.value),
    COINFLIP: resolveAvailability(availabilitySettings[6]?.value),
    TICTACTOE: resolveAvailability(availabilitySettings[7]?.value),
    UPGRADE: resolveAvailability(availabilitySettings[8]?.value),
    BATTLE: resolveAvailability(availabilitySettings[9]?.value),
    CRAFT: resolveAvailability(availabilitySettings[10]?.value)
  };

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-400/70">Игровой баланс</p>
        <h1 className="text-3xl font-semibold text-platinum">Настройки игровых режимов</h1>
        <p className="text-sm text-platinum/60">
          Управляйте рулеткой, настраиваемыми кейсами, лотереями и раннером. Изменения применяются
          мгновенно после сохранения и доступны игрокам в мини-приложении.
        </p>
        {(isMockMode || loadError) && (
          <p className="py-2 text-xs text-yellow-300">
            {isMockMode
              ? 'Подключение к базе данных не настроено. Отображены демонстрационные данные.'
              : `Не удалось загрузить часть данных из базы: ${loadError}`}
          </p>
        )}
      </header>

      <section className="flex flex-col gap-6">
        <div className="space-y-6">
          <div className={CARD_CLASS} id="roulette">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-platinum">Рулетка</h2>
              <p className="text-sm text-platinum/60">
                Настройте формат (колесо или слот), стоимость вращения и набор призов с весами и
                цветами. Сохранение мгновенно синхронизирует конфигурацию с мини-игрой.
              </p>
            </div>

            <RouletteEditor
              initialConfig={rouletteFormValue}
              action={saveRouletteConfigAction}
              isDisabled={isMockMode}
            />
            <p className="text-xs text-platinum/45">
              Вес определяет вероятность сектора. Для множителей используйте тип
              <code className="mx-1 rounded bg-white/10 px-1">multiplier</code> и укажите значение в
              поле «Значение».
            </p>
          </div>


          <div className={CARD_CLASS} id="cases">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-platinum">Кейсы</h2>
              <p className="text-sm text-platinum/60">
                Конструируйте контейнеры через визуальный редактор: добавляйте призы, настраивайте
                редкость, шанс и стоимость открытия без ручного редактирования JSON.
              </p>
            </div>

            <CaseEditor
              initialConfig={casesTextareaValue}
              action={saveCaseConfigAction}
              isDisabled={isMockMode}
            />
            <p className="text-xs text-platinum/45">
              Следите за суммой шансов и весов внутри каждого кейса. Поле «Звёзды» задаёт моментальную
              награду, остальные предметы могут использоваться в событиях и персонализации.
            </p>
          </div>


          <div className={CARD_CLASS} id="lottery">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-platinum">Лотереи</h2>
              <p className="text-sm text-platinum/60">
                Настройте лотерейные пулы с фиксированным числом участников, стоимостью билетов и распределением призового фонда. 
                Используйте визуальный редактор для удобной настройки всех параметров.
              </p>
            </div>

            <LotteryEditor
              initialConfig={lotteryTextareaValue}
              action={saveLotteryConfigAction}
              isDisabled={isMockMode}
            />
            <p className="text-xs text-platinum/50">
              Призовой фонд рассчитывается автоматически: стоимость билета × количество участников × процент призового фонда. 
              Распределение призов указывается в долях (от 0 до 1), сумма всех долей не должна превышать 100%.
            </p>
          </div>

          <div className={CARD_CLASS} id="runner">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-platinum">Раннер</h2>
              <p className="text-sm text-platinum/60">
                Игрок оплачивает попытку и получает награды за достижение заданных порогов очков.
                Настройте стоимость входа, бесплатные попытки и таблицу вознаграждений с гибкими
                метками прямо в форме ниже.
              </p>
            </div>

            <RunnerEditor
              initialConfig={runnerTextareaValue}
              action={saveRunnerConfigAction}
              isDisabled={isMockMode}
            />
          </div>

          <div className={CARD_CLASS} id="nft-gifts">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-platinum">NFT подарки (каталог)</h2>
              <p className="text-sm text-platinum/60">
                Настройте список Telegram gifts, которые могут выпадать из кейсов и использоваться в играх.
              </p>
            </div>
            <SimpleJsonEditor
              name="nftConfig"
              initialValue={nftTextareaValue}
              action={saveNftGiftsAction}
              submitLabel="Сохранить NFT каталог"
              isDisabled={isMockMode}
            />
          </div>

          <div className={CARD_CLASS} id="availability">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-platinum">Доступность игр</h2>
              <p className="text-sm text-platinum/60">
                Временно отключайте игры. При запуске игрок увидит сообщение о недоступности.
              </p>
            </div>
            <div className="grid gap-3">
              {(
                [
                  ['ROULETTE', 'Рулетка'],
                  ['CASE', 'Кейсы'],
                  ['LOTTERY', 'Лотерея'],
                  ['RUNNER', 'Раннер'],
                  ['CRASH', 'Crash'],
                  ['MINES', 'Mines'],
                  ['COINFLIP', 'Орел и решка'],
                  ['TICTACTOE', 'Крестики-нолики'],
                  ['UPGRADE', 'Апгрейд'],
                  ['BATTLE', 'Батл'],
                  ['CRAFT', 'Крафт']
                ] as const
              ).map(([gameKey, label]) => {
                const status = availabilityMap[gameKey as keyof typeof availabilityMap];
                return (
                  <form
                    key={gameKey}
                    action={saveGameAvailabilityAction}
                    className="rounded-3xl border border-white/10 bg-white/5 p-4"
                  >
                    <input type="hidden" name="gameType" value={gameKey} />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-platinum/60">{label}</p>
                        <p className="text-sm text-platinum/70">
                          {status.enabled ? 'Игра доступна' : 'Игра выключена'}
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-platinum/60">
                        <input
                          type="checkbox"
                          name="enabled"
                          defaultChecked={status.enabled}
                          disabled={isMockMode}
                          className="h-4 w-4 rounded border border-white/20 bg-black/40"
                        />
                        Доступна
                      </label>
                    </div>
                    <div className="mt-3">
                      <label className="text-[11px] uppercase tracking-[0.2em] text-platinum/50">
                        Сообщение при блокировке
                      </label>
                      <input
                        name="message"
                        defaultValue={status.message ?? 'Игра временно недоступна.'}
                        className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white"
                        disabled={isMockMode}
                      />
                    </div>
                    <button
                      type="submit"
                      className="mt-3 rounded-full border border-gold-400/30 bg-gold-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-200"
                      disabled={isMockMode}
                    >
                      Сохранить
                    </button>
                  </form>
                );
              })}
            </div>
          </div>

          <div className={CARD_CLASS} id="new-games">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-platinum">Настройка шансов игр</h2>
              <p className="text-sm text-platinum/60">
                Визуальная настройка вероятностей и множителей для всех мини-игр. Изменения применяются мгновенно после сохранения.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ['COINFLIP', 'Орел и решка', DEFAULT_EXTRA_GAME_CONFIGS.COINFLIP],
                  ['UPGRADE', 'Апгрейд', DEFAULT_EXTRA_GAME_CONFIGS.UPGRADE],
                  ['TICTACTOE', 'Крестики-нолики', DEFAULT_EXTRA_GAME_CONFIGS.TICTACTOE],
                  ['MINES', 'Mines', DEFAULT_EXTRA_GAME_CONFIGS.MINES],
                  ['CRASH', 'Crash', DEFAULT_EXTRA_GAME_CONFIGS.CRASH],
                  ['BATTLE', 'Батл', DEFAULT_EXTRA_GAME_CONFIGS.BATTLE],
                  ['CRAFT', 'Крафт', DEFAULT_EXTRA_GAME_CONFIGS.CRAFT]
                ] as const
              ).map(([gameKey, label, fallback]) => {
                const value = stringifyConfig(
                  (extraConfigMap as Record<string, unknown>)[gameKey] ?? fallback,
                  fallback
                );
                return (
                  <GameOddsEditor
                    key={gameKey}
                    gameType={gameKey}
                    gameLabel={label}
                    initialConfig={value}
                    action={saveGenericGameConfigAction}
                    isDisabled={isMockMode}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <aside className={CARD_CLASS}>
          <h3 className="text-lg font-semibold text-platinum">Рекомендации по балансировке</h3>
          <div className="space-y-4 text-sm text-platinum/60">
            <div>
              <p className="font-semibold text-platinum">Рулетка</p>
              <p>Следите за математикой: ожидаемая выплата не должна превышать стоимость спина.</p>
            </div>
            <div>
              <p className="font-semibold text-platinum">Кейсы</p>
              <p>
                Вес каждого предмета масштабируется относительно суммы всех весов. Используйте вес
                0.1–0.3 для ультра-редких предметов и 1.0+ для частых.
              </p>
            </div>
            <div>
              <p className="font-semibold text-platinum">Лотереи</p>
              <p>
                PrizePercent задаёт долю банка, которую получают победители. Остальные средства можно
                направлять в джекпоты, маркетинг или бонусный фонд.
              </p>
            </div>
            <div>
              <p className="font-semibold text-platinum">Раннер</p>
              <p>
                Располагайте пороги по возрастанию и проверяйте прогрессию наград, чтобы средний
                игрок окупал попытку не чаще, чем планируется экономикой.
              </p>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
