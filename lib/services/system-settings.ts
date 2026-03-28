import { prisma } from '@/lib/prisma';
import { SystemSetting } from '@/types/system-setting';

export type SystemSettingRecord = SystemSetting;

export async function getSystemSetting<T = unknown>(
  key: string,
  defaultValue?: T
): Promise<T | null> {
  try {
    const record = await prisma.systemSetting.findUnique({
      where: { key }
    });

    if (!record) {
      return defaultValue ?? null;
    }

    const storedValue = record.value as unknown;
    if (storedValue === null || storedValue === undefined) {
      return defaultValue ?? null;
    }

    return storedValue as T;
  } catch {
    return defaultValue ?? null;
  }
}

export async function upsertSystemSetting({
  key,
  value,
  description
}: {
  key: string;
  value: unknown;
  description?: string | null;
}): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = (value as any) ?? null;

  await prisma.systemSetting.upsert({
    where: { key },
    create: {
      key,
      value: payload,
      description: description ?? null
    },
    update: {
      value: payload,
      description: description ?? null
    }
  });
}

export async function listSystemSettings(): Promise<SystemSettingRecord[]> {
  const records = await prisma.systemSetting.findMany({
    orderBy: { updatedAt: 'desc' }
  });

  return records.map((record: SystemSettingRecord) => ({
    ...record,
    value: record.value as unknown
  })) as SystemSettingRecord[];
}
