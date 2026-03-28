'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { upsertGameSetting } from '@/lib/services/game-settings';

type PlainObject = Record<string, unknown>;

type RouletteVariant = 'wheel' | 'slots';

type CaseItem = PlainObject & {
  name: string;
  weight: number;
  chance?: number;
  stars?: number;
  nftGiftId?: string;
};

type CaseDefinition = PlainObject & {
  id: string;
  name: string;
  price: number;
  currency?: 'STARS' | 'BONUS';
  items: CaseItem[];
  description?: string;
};

type CaseConfig = {
  cases: CaseDefinition[];
};

type LotteryDistribution = PlainObject & {
  place: number;
  share: number;
};

type LotteryPool = PlainObject & {
  id: string;
  name: string;
  participantLimit: number;
  ticketCost: number;
  prizePercent: number;
  distribution?: LotteryDistribution[];
};

type LotteryConfig = {
  pools: LotteryPool[];
};

type RunnerPayout = PlainObject & {
  threshold: number;
  reward: number;
};

type RunnerConfig = {
  attemptCost: number;
  payouts: RunnerPayout[];
  freeAttemptsPerDay?: number;
  cooldownSeconds?: number;
};

type NftGiftConfig = PlainObject & {
  id: string;
  name: string;
  rarity: string;
};

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ensureString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} должен быть непустой строкой.`);
  }
  return value.trim();
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value.trim().replace(',', '.'));
    return parsed;
  }
  return Number.NaN;
}

function toPositiveNumber(value: unknown, label: string): number {
  const parsed = toNumber(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} должен быть положительным числом.`);
  }
  return parsed;
}

function toNonNegativeInteger(value: unknown, label: string): number {
  const parsed = toNumber(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} должен быть неотрицательным числом.`);
  }
  return Math.floor(parsed);
}

function normalizeRouletteSectors(value: unknown): PlainObject[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Добавьте хотя бы один сектор.');
  }

  return value.map((sector, index) => {
    if (!isPlainObject(sector)) {
      throw new Error(`Сектор #${index + 1} должен быть объектом.`);
    }
    const name = ensureString(sector.name ?? `Сектор ${index + 1}`, `Сектор #${index + 1}: название`);
    const weight = toPositiveNumber(
      'weight' in sector ? sector.weight : ('chance' in sector ? sector.chance : undefined),
      `Сектор ${name}: вес`
    );

    const record: PlainObject = {
      ...sector,
      name,
      weight
    };

    if ('chance' in sector) {
      const chanceValue = toNumber(sector.chance);
      if (Number.isFinite(chanceValue) && chanceValue > 0) {
        record.chance = chanceValue;
      } else {
        delete record.chance;
      }
    }

    return record;
  });
}

function normalizeRouletteVariant(value: unknown): RouletteVariant {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'slots') {
      return 'slots';
    }
  }
  return 'wheel';
}

function isRouletteContainer(value: unknown): value is PlainObject & { sectors: unknown; variant?: unknown } {
  if (!isPlainObject(value)) {
    return false;
  }
  return Array.isArray((value as { sectors?: unknown }).sectors);
}

function normalizeCaseConfig(value: unknown): CaseConfig {
  if (!isPlainObject(value)) {
    throw new Error('Конфигурация кейсов должна быть объектом с полем cases.');
  }

  const casesRaw = value.cases;
  if (!Array.isArray(casesRaw) || casesRaw.length === 0) {
    throw new Error('Добавьте хотя бы один кейс.');
  }

  const normalizedCases = casesRaw.map((entry, index) => {
    if (!isPlainObject(entry)) {
      throw new Error(`Кейс #${index + 1} должен быть объектом.`);
    }

    const id = ensureString(entry.id, `Кейс #${index + 1}: id`);
    const name = ensureString(entry.name, `Кейс ${id}: название`);
    const price = toPositiveNumber(entry.price, `Кейс ${id}: стоимость`);
    const itemsRaw = entry.items;

    if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
      throw new Error(`Кейс ${id}: добавьте хотя бы один приз.`);
    }

    const items = itemsRaw.map((item, itemIndex) => {
      if (!isPlainObject(item)) {
        throw new Error(`Кейс ${id}: предмет #${itemIndex + 1} должен быть объектом.`);
      }

      const itemName = ensureString(item.name, `Кейс ${id}: предмет #${itemIndex + 1} — название`);
      const weightSource =
        'weight' in item ? item.weight : 'chance' in item ? item.chance : undefined;
      const weight = toPositiveNumber(weightSource, `Кейс ${id}: ${itemName} — шанс/вес`);

      const record: CaseItem = {
        ...item,
        name: itemName,
        weight
      };

      if ('chance' in item) {
        const chanceValue = toNumber(item.chance);
        if (Number.isFinite(chanceValue) && chanceValue > 0) {
          record.chance = chanceValue;
        } else {
          delete record.chance;
        }
      }

      if ('stars' in item) {
        const starsValue = toNumber(item.stars);
        if (Number.isFinite(starsValue) && starsValue >= 0) {
          record.stars = Math.floor(starsValue);
        } else {
          delete record.stars;
        }
      }

      if ('nftGiftId' in item && typeof item.nftGiftId === 'string' && item.nftGiftId.trim()) {
        record.nftGiftId = item.nftGiftId.trim();
      }

      return record;
    });

    const description =
      typeof entry.description === 'string' && entry.description.trim()
        ? entry.description.trim()
        : undefined;

    const record: CaseDefinition = {
      ...entry,
      id,
      name,
      price,
      description,
      items
    };

    if (typeof entry.currency === 'string' && entry.currency.trim().toUpperCase() === 'BONUS') {
      record.currency = 'BONUS';
    } else {
      record.currency = 'STARS';
    }

    return record;
  });

  return { cases: normalizedCases };
}

function normalizeLotteryConfig(value: unknown): LotteryConfig {
  if (!isPlainObject(value)) {
    throw new Error('Конфигурация лотерей должна быть объектом с полем pools.');
  }

  const poolsRaw = value.pools;
  if (!Array.isArray(poolsRaw) || poolsRaw.length === 0) {
    throw new Error('Добавьте хотя бы одну лотерею.');
  }

  const normalizedPools = poolsRaw.map((pool, index) => {
    if (!isPlainObject(pool)) {
      throw new Error(`Лотерея #${index + 1} должна быть объектом.`);
    }

    const id = ensureString(pool.id, `Лотерея #${index + 1}: id`);
    const name = ensureString(pool.name ?? id, `Лотерея ${id}: название`);
    const participantLimit = Math.max(
      2,
      Math.round(toPositiveNumber(pool.participantLimit, `Лотерея ${id}: количество участников`))
    );
    const ticketCost = toPositiveNumber(pool.ticketCost, `Лотерея ${id}: стоимость билета`);

    let prizePercent = toPositiveNumber(
      'prizePercent' in pool ? pool.prizePercent : pool.winnerShare ?? pool.payoutPercent,
      `Лотерея ${id}: процент призового фонда`
    );
    if (prizePercent > 1 && prizePercent <= 100) {
      prizePercent /= 100;
    }
    if (prizePercent > 1) {
      throw new Error(`Лотерея ${id}: процент призового фонда не может превышать 100%.`);
    }

    let distribution: LotteryDistribution[] | undefined;
    if (Array.isArray(pool.distribution) && pool.distribution.length > 0) {
      distribution = pool.distribution.map((entry, distIndex) => {
        if (!isPlainObject(entry)) {
          throw new Error(`Лотерея ${id}: распределение #${distIndex + 1} должно быть объектом.`);
        }
        const place = Math.max(
          1,
          Math.round(toPositiveNumber(entry.place ?? distIndex + 1, `Лотерея ${id}: место #${distIndex + 1}`))
        );
        let share = toPositiveNumber(
          entry.share ?? entry.percent,
          `Лотерея ${id}: доля для места #${place}`
        );
        if (share > 1 && share <= 100) {
          share /= 100;
        }
        if (share > 1) {
          throw new Error(`Лотерея ${id}: доля для места #${place} не может превышать 100%.`);
        }
        return {
          ...entry,
          place,
          share
        };
      });

      const totalShare = distribution.reduce((acc, item) => acc + item.share, 0);
      if (totalShare > 1 + 1e-6) {
        throw new Error(`Лотерея ${id}: суммарное распределение превышает 100%.`);
      }
    }

    const record: LotteryPool = {
      ...pool,
      id,
      name,
      participantLimit,
      ticketCost,
      prizePercent
    };

    if (distribution) {
      record.distribution = distribution;
    }

    if ('fixedPrize' in pool) {
      const fixed = toNonNegativeInteger(pool.fixedPrize, `Лотерея ${id}: фиксированный приз`);
      record.fixedPrize = fixed;
    }

    return record;
  });

  return { pools: normalizedPools };
}

function normalizeRunnerConfig(value: unknown): RunnerConfig {
  if (!isPlainObject(value)) {
    throw new Error('Конфигурация раннера должна быть объектом.');
  }

  const attemptCost = toPositiveNumber(
    'attemptCost' in value ? value.attemptCost : value.entryCost,
    'Стоимость попытки'
  );

  const payoutsRaw = Array.isArray(value.payouts)
    ? value.payouts
    : Array.isArray(value.rewards)
      ? value.rewards
      : Array.isArray(value.thresholds)
        ? value.thresholds
        : null;

  if (!payoutsRaw || payoutsRaw.length === 0) {
    throw new Error('Добавьте хотя бы один порог начисления награды.');
  }

  const payouts = payoutsRaw.map((entry, index) => {
    if (!isPlainObject(entry)) {
      throw new Error(`Порог #${index + 1} должен быть объектом.`);
    }

    const threshold = Math.max(
      1,
      Math.round(
        toPositiveNumber(
          entry.threshold ?? entry.score ?? entry.minScore,
          `Порог #${index + 1}: порог очков`
        )
      )
    );
    const reward = toPositiveNumber(
      entry.reward ?? entry.payout ?? entry.prize,
      `Порог #${index + 1}: награда`
    );

    const record: RunnerPayout = {
      ...entry,
      threshold,
      reward
    };

    if ('label' in entry && typeof entry.label === 'string') {
      record.label = entry.label.trim();
    }

    return record;
  });

  const config: RunnerConfig = {
    attemptCost,
    payouts
  };

  if ('freeAttemptsPerDay' in value) {
    config.freeAttemptsPerDay = toNonNegativeInteger(
      value.freeAttemptsPerDay,
      'Количество бесплатных попыток'
    );
  }

  if ('cooldownSeconds' in value) {
    config.cooldownSeconds = toNonNegativeInteger(
      value.cooldownSeconds,
      'Кулдаун между попытками'
    );
  }

  return config;
}

function normalizeNftGifts(value: unknown): NftGiftConfig[] {
  if (!Array.isArray(value)) {
    throw new Error('NFT каталог должен быть массивом объектов.');
  }

  return value.map((entry, index) => {
    if (!isPlainObject(entry)) {
      throw new Error(`NFT #${index + 1} должен быть объектом.`);
    }
    const id = ensureString(entry.id, `NFT #${index + 1}: id`);
    const name = ensureString(entry.name, `NFT ${id}: название`);
    const rarity = ensureString(entry.rarity ?? 'Обычный', `NFT ${id}: редкость`);
    return {
      ...entry,
      id,
      name,
      rarity
    };
  });
}

export async function saveRouletteConfigAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  const rawConfig = formData.get('rouletteConfig');
  let cost = 0;
  let variant = 'wheel' as RouletteVariant;
  let sectorsInput: unknown;
  let slotsConfig: PlainObject | undefined;

  if (typeof rawConfig === 'string' && rawConfig.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawConfig);
    } catch {
      throw new Error('Неверный формат JSON для рулетки.');
    }
    if (!isPlainObject(parsed)) {
      throw new Error('Конфигурация рулетки должна быть объектом.');
    }
    cost = toPositiveNumber(parsed.spinCost, 'Стоимость вращения');
    variant = normalizeRouletteVariant(parsed.variant);
    sectorsInput = parsed.sectors;
    if (isPlainObject(parsed.slots)) {
      slotsConfig = parsed.slots as PlainObject;
    }
  } else {
    const costRaw = formData.get('spinCost');
    const sectorsRaw = formData.get('sectors');
    variant = normalizeRouletteVariant(formData.get('variant'));

    cost = toPositiveNumber(costRaw, 'Стоимость вращения');

    if (typeof sectorsRaw !== 'string' || !sectorsRaw.trim()) {
      throw new Error('Укажите конфигурацию секторов.');
    }

    try {
      sectorsInput = JSON.parse(sectorsRaw);
    } catch {
      throw new Error('Неверный формат JSON для секторов.');
    }
    if (isRouletteContainer(sectorsInput)) {
      if ('variant' in sectorsInput) {
        variant = normalizeRouletteVariant(sectorsInput.variant);
      }
      sectorsInput = sectorsInput.sectors;
    }
  }

  const sectors = normalizeRouletteSectors(sectorsInput);

  await upsertGameSetting({
    gameType: 'ROULETTE',
    key: 'config',
    value: {
      spinCost: cost,
      variant,
      sectors,
      ...(slotsConfig ? { slots: slotsConfig } : {})
    }
  });

  revalidatePath('/admin/games');
}

export async function saveCaseConfigAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  const raw = formData.get('caseConfig');
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('Укажите конфигурацию кейсов.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Неверный формат JSON для кейсов.');
  }

  const config = normalizeCaseConfig(parsed);

  await upsertGameSetting({
    gameType: 'CASE',
    key: 'config',
    value: config
  });

  revalidatePath('/admin/games');
}

export async function saveLotteryConfigAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  const raw = formData.get('lotteryConfig');
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('Укажите конфигурацию лотерей.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Неверный формат JSON для лотерей.');
  }

  const config = normalizeLotteryConfig(parsed);

  await upsertGameSetting({
    gameType: 'LOTTERY',
    key: 'config',
    value: config
  });

  revalidatePath('/admin/games');
}

export async function saveRunnerConfigAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  const raw = formData.get('runnerConfig');
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('Укажите конфигурацию раннера.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Неверный формат JSON для раннера.');
  }

  const config = normalizeRunnerConfig(parsed);

  await upsertGameSetting({
    gameType: 'RUNNER',
    key: 'config',
    value: config
  });

  revalidatePath('/admin/games');
}

export async function saveGenericGameConfigAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  const gameType = formData.get('gameType');
  const rawConfig = formData.get('gameConfig');
  if (typeof gameType !== 'string' || !gameType.trim()) {
    throw new Error('Не указан тип игры.');
  }
  if (typeof rawConfig !== 'string' || !rawConfig.trim()) {
    throw new Error('Укажите конфигурацию игры.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawConfig);
  } catch {
    throw new Error('Неверный формат JSON.');
  }

  await upsertGameSetting({
    gameType: gameType as
      | 'CRASH'
      | 'MINES'
      | 'COINFLIP'
      | 'TICTACTOE'
      | 'UPGRADE'
      | 'BATTLE'
      | 'CRAFT',
    key: 'config',
    value: isPlainObject(parsed) ? parsed : { value: parsed }
  });

  revalidatePath('/admin/games');
}

export async function saveNftGiftsAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  const rawConfig = formData.get('nftConfig');
  if (typeof rawConfig !== 'string' || !rawConfig.trim()) {
    throw new Error('Укажите JSON-каталог NFT.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawConfig);
  } catch {
    throw new Error('Неверный формат JSON для NFT.');
  }

  const gifts = normalizeNftGifts(parsed);
  const incomingIds = new Set(gifts.map((gift) => gift.id));

  await prisma.$transaction(async (tx) => {
    for (const gift of gifts) {
      await tx.nftGift.upsert({
        where: { id: gift.id },
        create: {
          id: gift.id,
          name: gift.name,
          rarity: gift.rarity,
          description: typeof gift.description === 'string' ? gift.description : null,
          imageUrl: typeof gift.imageUrl === 'string' ? gift.imageUrl : null,
          telegramGiftId: typeof gift.telegramGiftId === 'string' ? gift.telegramGiftId : null,
          priceStars: typeof gift.priceStars === 'number' ? Math.round(gift.priceStars) : null,
          priceBonus: typeof gift.priceBonus === 'number' ? Math.round(gift.priceBonus) : null,
          isActive: typeof gift.isActive === 'boolean' ? gift.isActive : true
        },
        update: {
          name: gift.name,
          rarity: gift.rarity,
          description: typeof gift.description === 'string' ? gift.description : null,
          imageUrl: typeof gift.imageUrl === 'string' ? gift.imageUrl : null,
          telegramGiftId: typeof gift.telegramGiftId === 'string' ? gift.telegramGiftId : null,
          priceStars: typeof gift.priceStars === 'number' ? Math.round(gift.priceStars) : null,
          priceBonus: typeof gift.priceBonus === 'number' ? Math.round(gift.priceBonus) : null,
          isActive: typeof gift.isActive === 'boolean' ? gift.isActive : true
        }
      });
    }

    await tx.nftGift.updateMany({
      where: {
        id: { notIn: Array.from(incomingIds) }
      },
      data: { isActive: false }
    });
  });

  revalidatePath('/admin/games');
}

export async function saveGameAvailabilityAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  const gameType = ensureString(formData.get('gameType'), 'Тип игры');
  const enabled = formData.get('enabled') === 'on';
  const messageRaw = formData.get('message');
  const message = typeof messageRaw === 'string' ? messageRaw.trim() : '';

  await upsertGameSetting({
    gameType: gameType as
      | 'ROULETTE'
      | 'RUNNER'
      | 'LOTTERY'
      | 'CASE'
      | 'BONUS'
      | 'CRASH'
      | 'MINES'
      | 'COINFLIP'
      | 'TICTACTOE'
      | 'UPGRADE'
      | 'BATTLE'
      | 'CRAFT',
    key: 'status',
    value: {
      enabled,
      message: message || 'Игра временно недоступна.'
    }
  });

  revalidatePath('/admin/games');
}
