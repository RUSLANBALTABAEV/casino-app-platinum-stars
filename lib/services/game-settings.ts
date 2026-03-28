/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

import { prisma } from '@/lib/prisma';

export function getGameSetting(
  gameType:
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
  key: string
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
  const db = prisma as any;
  return db.gameSetting.findUnique({
    where: {
      gameType_key: {
        gameType,
        key
      }
    }
  });
}

export function upsertGameSetting({
  gameType,
  key,
  value
}: {
  gameType:
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
    | 'CRAFT';
  key: string;
  value: Record<string, unknown>;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
  const db = prisma as any;
  return db.gameSetting.upsert({
    where: {
      gameType_key: {
        gameType,
        key
      }
    },
    create: {
      gameType,
      key,
      value
    },
    update: {
      value
    }
  });
}

export function listGameSettings(
  gameType:
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
    | 'CRAFT'
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
  const db = prisma as any;
  return db.gameSetting.findMany({
    where: { gameType },
    orderBy: { updatedAt: 'desc' }
  });
}

export type GameAvailability = {
  enabled: boolean;
  message?: string | null;
};

export async function getGameAvailability(
  gameType:
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
    | 'CRAFT'
): Promise<GameAvailability> {
  let setting: unknown = null;
  try {
    setting = await getGameSetting(gameType, 'status');
  } catch {
    setting = null;
  }

  if (!setting || typeof setting !== 'object' || !('value' in setting)) {
    return { enabled: true };
  }

  const value = (setting as { value?: unknown }).value;
  if (!value || typeof value !== 'object') {
    return { enabled: true };
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
}
