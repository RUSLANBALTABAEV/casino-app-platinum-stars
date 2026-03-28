'use server';

import { revalidatePath } from 'next/cache';

import { upsertStatusPlan, type UserStatus } from '@/lib/services/status';

function parseJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* noop */
  }
  throw new Error('Некорректный JSON в поле преимуществ.');
}

export async function saveStatusPlanAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  const slugRaw = formData.get('slug');
  const nameRaw = formData.get('name');
  const descriptionRaw = formData.get('description');
  const tierRaw = formData.get('tier');
  const priceRaw = formData.get('price');
  const currencyRaw = formData.get('currency');
  const durationRaw = formData.get('durationDays');
  const benefitsRaw = formData.get('benefits');
  const isActiveRaw = formData.get('isActive');

  if (typeof slugRaw !== 'string' || !slugRaw.trim()) {
    throw new Error('Укажите идентификатор статуса (slug).');
  }
  if (typeof nameRaw !== 'string' || !nameRaw.trim()) {
    throw new Error('Название статуса обязательно.');
  }
  if (typeof tierRaw !== 'string' || !tierRaw.trim()) {
    throw new Error('Укажите тип статуса.');
  }

  const tierNormalized = tierRaw.trim().toUpperCase();
  if (tierNormalized !== 'STANDARD' && tierNormalized !== 'PREMIUM') {
    throw new Error('Статус может быть только STANDARD или PREMIUM.');
  }
  const tier: UserStatus = tierNormalized === 'PREMIUM' ? 'PREMIUM' : 'STANDARD';

  const price = Number.parseInt(typeof priceRaw === 'string' ? priceRaw : '0', 10);
  if (Number.isNaN(price) || price < 0) {
    throw new Error('Цена должна быть неотрицательным числом.');
  }

  const duration =
    typeof durationRaw === 'string' && durationRaw.trim()
      ? Number.parseInt(durationRaw, 10)
      : null;
  if (duration !== null && (Number.isNaN(duration) || duration <= 0)) {
    throw new Error('Длительность статуса должна быть положительным числом.');
  }

  let benefits: Record<string, unknown> | null = null;
  if (typeof benefitsRaw === 'string' && benefitsRaw.trim()) {
    benefits = parseJson(benefitsRaw.trim());
  }

  const currency =
    typeof currencyRaw === 'string' && currencyRaw.trim()
      ? currencyRaw.trim().toUpperCase()
      : 'RUB';

  await upsertStatusPlan({
    slug: slugRaw.trim(),
    name: nameRaw.trim(),
    description: typeof descriptionRaw === 'string' ? descriptionRaw.trim() : null,
    tier,
    price,
    currency,
    durationDays: duration,
    benefits,
    isActive: isActiveRaw === 'on' || isActiveRaw === 'true' || isActiveRaw === '1'
  });

  revalidatePath('/admin/statuses');
}
