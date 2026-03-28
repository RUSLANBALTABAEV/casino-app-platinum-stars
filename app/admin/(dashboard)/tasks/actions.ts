'use server';

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { resolveTaskSubmission } from '@/lib/services/tasks';

export async function createTaskAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
  const db = prisma as any;
  const title = formData.get('title');
  const rewardRaw = formData.get('reward');
  const description = formData.get('description');
  const sponsorLink = formData.get('link');
  const proofRequired = formData.get('requiredProof');
  const maxCompletionsRaw = formData.get('maxCompletions');

  if (typeof title !== 'string' || !title.trim()) {
    throw new Error('Название задания обязательно.');
  }

  const reward = Number.parseInt(typeof rewardRaw === 'string' ? rewardRaw : '0', 10);
  if (Number.isNaN(reward) || reward < 0) {
    throw new Error('Неверная награда.');
  }

  const maxCompletions =
    typeof maxCompletionsRaw === 'string' && maxCompletionsRaw.trim().length > 0
      ? Number.parseInt(maxCompletionsRaw, 10)
      : null;

  await db.task.create({
    data: {
      slug: `${title.trim().toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString(36)}`,
      title: title.trim(),
      description: typeof description === 'string' ? description.trim() : null,
      reward,
      sponsorLink: typeof sponsorLink === 'string' ? sponsorLink.trim() || null : null,
      isActive: true,
      requiredProof: proofRequired === 'on',
      maxCompletions: maxCompletions ?? null
    }
  });

  revalidatePath('/admin/tasks');
}

export async function toggleTaskAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
  const db = prisma as any;
  const taskId = formData.get('taskId');
  const command = formData.get('command');

  if (typeof taskId !== 'string' || !taskId) {
    throw new Error('Идентификатор задания обязателен.');
  }

  const isActivate = command === 'activate';

  await db.task.update({
    where: { id: taskId },
    data: {
      isActive: isActivate
    }
  });

  revalidatePath('/admin/tasks');
}

export async function resolveTaskAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }
  const submissionId = formData.get('submissionId');
  const command = formData.get('command');
  const payoutRaw = formData.get('payout');

  if (typeof submissionId !== 'string' || !submissionId) {
    throw new Error('Не выбран отклик задания.');
  }

  const approve = command === 'approve';
  const payout =
    typeof payoutRaw === 'string' && payoutRaw.trim().length > 0
      ? Number.parseInt(payoutRaw, 10)
      : undefined;

  await resolveTaskSubmission({
    submissionId,
    approve,
    reward: payout
  });

  revalidatePath('/admin/tasks');
  revalidatePath('/admin');
}
