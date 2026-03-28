import { startOfDay, differenceInDays } from 'date-fns';
import { prisma } from '@/lib/prisma';

/**
 * Вычисляет ежедневную серию (streak) пользователя на основе игровой активности
 * Streak считается по завершенным игровым сессиям (GameSession с finishedAt)
 */
export async function calculateStreakDays(userId: string): Promise<number> {
  try {
    // Получаем все завершенные игровые сессии пользователя, отсортированные по дате
    const sessions = await prisma.gameSession.findMany({
      where: {
        userId,
        finishedAt: { not: null }
      },
      select: {
        finishedAt: true
      },
      orderBy: {
        finishedAt: 'desc'
      }
    });

    if (sessions.length === 0) {
      return 0;
    }

    // Получаем уникальные даты активности (без времени)
    const activityDates = new Set<string>();
    sessions.forEach(session => {
      if (session.finishedAt) {
        const dateKey = startOfDay(session.finishedAt).toISOString();
        activityDates.add(dateKey);
      }
    });

    const sortedDates = Array.from(activityDates)
      .map(d => new Date(d))
      .sort((a, b) => b.getTime() - a.getTime()); // От новых к старым

    if (sortedDates.length === 0) {
      return 0;
    }

    const today = startOfDay(new Date());
    const mostRecentDate = startOfDay(sortedDates[0]);

    // Если последняя активность была не сегодня и не вчера - streak прерван
    const daysSinceLastActivity = differenceInDays(today, mostRecentDate);
    if (daysSinceLastActivity > 1) {
      return 0;
    }

    // Подсчитываем последовательные дни активности
    let streak = 0;

    // Если последняя активность была вчера, начинаем с вчерашнего дня
    if (daysSinceLastActivity === 1) {
      streak = 1;
    } else {
      // Последняя активность сегодня
      streak = 1;
    }

    // Проверяем последовательность дней
    for (let i = 1; i < sortedDates.length; i++) {
      const currentDate = startOfDay(sortedDates[i]);
      const prevDate = startOfDay(sortedDates[i - 1]);
      const daysDiff = differenceInDays(prevDate, currentDate);

      if (daysDiff === 1) {
        // Последовательный день
        streak++;
      } else {
        // Разрыв в последовательности
        break;
      }
    }

    return streak;
  } catch (error) {
    console.error('Error calculating streak days:', error);
    return 0;
  }
}
