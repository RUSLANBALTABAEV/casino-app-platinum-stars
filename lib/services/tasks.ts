/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */

import crypto from 'crypto';

import { prisma } from '@/lib/prisma';
import { logSecurityEvent } from '@/lib/services/security';

export interface TaskWithStatus {
  id: string;
  title: string;
  description: string | null;
  reward: number;
  sponsorLink: string | null;
  status: 'PENDING' | 'REVIEW' | 'APPROVED' | 'REJECTED';
  userTaskId: string | null;
  proofUrl: string | null;
  awardedAt: Date | null;
  completionsTotal: number;
  requiredProof: boolean;
  slug: string;
}

type TaskQueryResult = {
  id: string;
  title: string;
  description: string | null;
  reward: number;
  sponsorLink: string | null;
  requiredProof: boolean;
  slug: string;
  completions: Array<{
    id: string;
    status: string;
    proofUrl: string | null;
    awardedAt: Date | null;
  }>;
  _count: { completions: number };
};

export async function getTasksForUser(userId: string): Promise<TaskWithStatus[]> {
  const tasks = await prisma.task.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    include: {
      completions: {
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 1
      },
      _count: { select: { completions: true } }
    }
  });

  return tasks.map((task: TaskQueryResult) => {
    const completion = task.completions[0];
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      reward: task.reward,
      sponsorLink: task.sponsorLink,
      status: completion?.status ?? 'PENDING',
      userTaskId: completion?.id ?? null,
      proofUrl: completion?.proofUrl ?? null,
      awardedAt: completion?.awardedAt ?? null,
      completionsTotal: task._count.completions,
      requiredProof: task.requiredProof,
      slug: task.slug
    };
  }) as TaskWithStatus[];
}

async function checkTelegramSubscription(telegramId: bigint, sponsorLink: string | null): Promise<boolean> {
  if (!sponsorLink) {
    return true; // Если ссылки нет, считаем что подписка не требуется
  }

  // Извлекаем username/channel_id из ссылки
  const match = sponsorLink.match(/(?:t\.me\/|@)([a-zA-Z0-9_]+)/);
  if (!match) {
    return true; // Если не удалось извлечь, считаем что подписка не требуется
  }

  const channelUsername = match[1].replace('@', '');
  
  try {
    const { getBotToken } = await import('@/lib/telegram/init-data');
    const botToken = getBotToken();
    // Бот должен быть администратором канала/группы для использования getChatMember
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: `@${channelUsername}`,
        user_id: Number(telegramId)
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`Failed to check subscription for @${channelUsername}: ${errorText}. `
                   + 'Убедитесь, что бот добавлен как администратор в канал/группу.');
      return true; // В случае ошибки считаем что подписка есть
    }

    const data = (await response.json()) as { ok?: boolean; result?: { status?: string } };
    if (!data.ok || !data.result) {
      return true;
    }

    const status = data.result.status;
    return status === 'member' || status === 'administrator' || status === 'creator';
  } catch (error) {
    console.error(`Failed to check subscription for @${channelUsername}:`, error);
    return true; // В случае ошибки считаем что подписка есть
  }
}

export async function submitTaskCompletion({
  userId,
  taskId,
  proofUrl
}: {
  userId: string;
  taskId: string;
  proofUrl?: string | null;
}) {
  const task = await prisma.task.findUnique({
    where: { id: taskId, isActive: true },
    include: {
      completions: {
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 1
      },
      _count: { select: { completions: true } }
    }
  });

  if (!task) {
    await logSecurityEvent({
      type: 'TASK_NOT_FOUND',
      severity: 'WARNING',
      message: `Попытка выполнить неактивное задание ${taskId}`,
      userId
    });
    throw new Error('Задание недоступно.');
  }

  if (task.maxCompletions && task._count.completions >= task.maxCompletions) {
    await logSecurityEvent({
      type: 'TASK_LIMIT',
      severity: 'INFO',
      message: `Лимит выполнений задания ${taskId}`,
      userId
    });
    throw new Error('Лимит выполнений задания исчерпан.');
  }

  // Проверяем подписку на спонсора, если требуется
  if (task.sponsorLink) {
    // Получаем пользователя для проверки подписки
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true }
    });

    if (user?.telegramId) {
      const isSubscribed = await checkTelegramSubscription(user.telegramId, task.sponsorLink);
      if (!isSubscribed) {
        await logSecurityEvent({
          type: 'TASK_SUBSCRIPTION_REQUIRED',
          severity: 'INFO',
          message: `Пользователь не подписан на спонсора для задания ${taskId}`,
          userId
        });
        throw new Error('Для выполнения задания необходимо подписаться на спонсора. Проверьте ссылку в задании.');
      }
    }
  }

  const existing = task.completions[0];
  if (existing && existing.status === 'APPROVED') {
    await logSecurityEvent({
      type: 'TASK_DUPLICATE',
      severity: 'WARNING',
      message: `Повторная отправка одобренного задания ${taskId}`,
      userId
    });
    throw new Error('Задание уже зачтено.');
  }

  if (task.requiredProof && (!proofUrl || proofUrl.trim().length === 0)) {
    await logSecurityEvent({
      type: 'TASK_PROOF_MISSING',
      severity: 'INFO',
      message: `Не предоставлено подтверждение для задания ${taskId}`,
      userId
    });
    throw new Error('Для этого задания требуется ссылка-подтверждение.');
  }

  const shouldAutoApprove = !task.requiredProof;
  const payout = task.reward ?? 0;

  if (existing) {
    if (shouldAutoApprove) {
      const updatedSubmission = await prisma.$transaction(async (tx) => {
        const userTask = await tx.userTask.update({
          where: { id: existing.id },
          data: {
            status: 'APPROVED',
            awardedAt: existing.awardedAt ?? new Date(),
            proofUrl: proofUrl?.trim() ?? null,
            note: null
          }
        });

        if (!existing.awardedAt && payout > 0) {
          await tx.starBalance.upsert({
            where: { userId },
            create: {
              userId,
              available: 0,
              reserved: 0,
              lifetimeEarn: 0,
              lifetimeSpend: 0,
              bonusAvailable: 0,
              bonusReserved: 0,
              bonusLifetimeEarn: 0,
              bonusLifetimeSpend: 0
            },
            update: {}
          });
          await tx.starBalance.update({
            where: { userId },
            data: {
              available: { increment: payout },
              lifetimeEarn: { increment: payout }
            }
          });

          await tx.transaction.create({
            data: {
              userId,
              type: 'REWARD',
              amount: payout,
              provider: 'MANUAL',
              status: 'COMPLETED',
              currency: 'STARS',
              meta: {
                source: 'TASK',
                taskId
              }
            }
          });
        }

        return userTask;
      });

      await logSecurityEvent({
        type: 'TASK_APPROVED',
        severity: 'INFO',
        message: `Автоматически зачтено задание ${taskId}`,
        userId,
        metadata: {
          reward: payout
        }
      });

      return updatedSubmission;
    }

    const updatedSubmission = await prisma.userTask.update({
      where: { id: existing.id },
      data: {
        status: 'REVIEW',
        proofUrl: proofUrl?.trim() ?? null,
        note: null
      }
    });

    await logSecurityEvent({
      type: 'TASK_RESUBMIT',
      severity: 'INFO',
      message: `Обновлено подтверждение задания ${taskId}`,
      userId
    });

    return updatedSubmission;
  }

  if (shouldAutoApprove) {
    const submission = await prisma.$transaction(async (tx) => {
      const userTask = await tx.userTask.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          taskId,
          status: 'APPROVED',
          awardedAt: new Date(),
          proofUrl: proofUrl?.trim() ?? null
        }
      });

      if (payout > 0) {
        await tx.starBalance.upsert({
          where: { userId },
          create: {
            userId,
            available: 0,
            reserved: 0,
            lifetimeEarn: 0,
            lifetimeSpend: 0,
            bonusAvailable: 0,
            bonusReserved: 0,
            bonusLifetimeEarn: 0,
            bonusLifetimeSpend: 0
          },
          update: {}
        });
        await tx.starBalance.update({
          where: { userId },
          data: {
            available: { increment: payout },
            lifetimeEarn: { increment: payout }
          }
        });

        await tx.transaction.create({
          data: {
            userId,
            type: 'REWARD',
            amount: payout,
            provider: 'MANUAL',
            status: 'COMPLETED',
            currency: 'STARS',
            meta: {
              source: 'TASK',
              taskId
            }
          }
        });
      }

      return userTask;
    });

    await logSecurityEvent({
      type: 'TASK_APPROVED',
      severity: 'INFO',
      message: `Автоматически зачтено задание ${taskId}`,
      userId,
      metadata: {
        reward: payout
      }
    });

    return submission;
  }

  const submission = await prisma.userTask.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      taskId,
      status: 'REVIEW',
      proofUrl: proofUrl?.trim() ?? null
    }
  });

  await logSecurityEvent({
    type: 'TASK_SUBMITTED',
    severity: 'INFO',
    message: `Задание ${taskId} отправлено на проверку`,
    userId
  });

  return submission;
}

export function listTaskSubmissions(status: ('REVIEW' | 'APPROVED' | 'REJECTED')[] = ['REVIEW']) {
  return prisma.userTask.findMany({
    where: {
      status: { in: status }
    },
    orderBy: { createdAt: 'desc' },
    include: {
      task: true,
      user: true
    },
    take: 50
  });
}

export async function resolveTaskSubmission({
  submissionId,
  approve,
  reward
}: {
  submissionId: string;
  approve: boolean;
  reward?: number;
}) {
  const submission = await prisma.userTask.findUnique({
    where: { id: submissionId },
    include: { task: true }
  });

  if (!submission) {
    await logSecurityEvent({
      type: 'TASK_REVIEW_MISSING',
      severity: 'WARNING',
      message: `Отклик ${submissionId} не найден для модерации`,
      userId: null
    });
    throw new Error('Заявка не найдена.');
  }

  const updated = await prisma.$transaction(async (tx: any) => {
    const nextStatus = approve ? 'APPROVED' : 'REJECTED';

    const userTask = await tx.userTask.update({
      where: { id: submissionId },
      data: {
        status: nextStatus,
        awardedAt: approve ? new Date() : null
      }
    });

    if (approve) {
      const payout = reward ?? submission.task?.reward ?? 0;
      if (payout > 0) {
        await tx.starBalance.update({
          where: { userId: submission.userId },
          data: {
            available: { increment: payout },
            lifetimeEarn: { increment: payout }
          }
        });

        await tx.transaction.create({
          data: {
            userId: submission.userId,
            type: 'REWARD',
            amount: payout,
            provider: 'MANUAL',
            status: 'COMPLETED',
            currency: 'STARS',
            meta: {
              source: 'TASK',
              taskId: submission.taskId
            }
          }
        });
      }
    }

    return userTask;
  });

  await logSecurityEvent({
    type: approve ? 'TASK_APPROVED' : 'TASK_REJECTED',
    severity: approve ? 'INFO' : 'WARNING',
    message: `${approve ? 'Одобрено' : 'Отклонено'} выполнение задания ${submission.taskId}`,
    userId: submission.userId,
    metadata: {
      reward: reward ?? submission.task?.reward ?? 0
    }
  });

  return updated;
}
