'use server';

import { revalidatePath } from 'next/cache';

import { sendBroadcast } from '@/lib/services/broadcast';

export async function sendBroadcastAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  const title = formData.get('title');
  const message = formData.get('message');
  const segment = formData.get('segment');

  if (typeof title !== 'string' || !title.trim()) {
    throw new Error('Введите заголовок рассылки.');
  }

  if (typeof message !== 'string' || !message.trim()) {
    throw new Error('Введите текст сообщения.');
  }

  const segmentValue =
    segment === 'PREMIUM' || segment === 'ACTIVE' || segment === 'ALL' ? segment : 'ALL';

  await sendBroadcast({
    title: title.trim(),
    message: message.trim(),
    segment: segmentValue
  });

  revalidatePath('/admin/broadcasts');
}
