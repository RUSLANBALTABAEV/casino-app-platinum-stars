import { prisma } from '@/lib/prisma';

const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || '0';

/**
 * Check if user is admin and has boost enabled
 */
export async function isAdminWithBoostEnabled(userId: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    return false;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        isAdmin: true,
        adminBoostEnabled: true,
        telegramId: true
      }
    });

    if (!user) {
      return false;
    }

    // Check if this is the admin with boost enabled
    return (
      user.isAdmin &&
      user.adminBoostEnabled &&
      user.telegramId === BigInt(ADMIN_TELEGRAM_ID)
    );
  } catch (error) {
    console.error('Error checking admin boost:', error);
    return false;
  }
}

/**
 * Get best prize from array of prizes
 * Used for admin boost (90% win rate)
 */
export function getBestPrizeForAdmin<T extends { value: number; weight?: number }>(
  prizes: T[]
): { prize: T; index: number } | null {
  if (!prizes || prizes.length === 0) {
    return null;
  }

  let bestIndex = 0;
  let bestValue = prizes[0]?.value ?? 0;

  for (let i = 1; i < prizes.length; i++) {
    const currentValue = prizes[i]?.value ?? 0;
    if (currentValue > bestValue) {
      bestValue = currentValue;
      bestIndex = i;
    }
  }

  return {
    prize: prizes[bestIndex],
    index: bestIndex
  };
}

/**
 * Get random high-value prize (top 25% by value)
 * Used for admin boost to avoid being too obvious
 */
export function getHighValuePrizeForAdmin<T extends { value: number }>(
  prizes: T[]
): { prize: T; index: number } | null {
  if (!prizes || prizes.length === 0) {
    return null;
  }

  const sortedWithIndices = prizes
    .map((prize, index) => ({ prize, index, value: prize.value }))
    .sort((a, b) => b.value - a.value);

  // Get top 25%
  const topCount = Math.max(1, Math.ceil(sortedWithIndices.length * 0.25));
  const topPrizes = sortedWithIndices.slice(0, topCount);

  // Pick random from top 25%
  const randomIndex = Math.floor(Math.random() * topPrizes.length);
  const selected = topPrizes[randomIndex];

  if (!selected) {
    return null;
  }

  return {
    prize: selected.prize,
    index: selected.index
  };
}

/**
 * Log admin action for audit
 */
export async function logAdminAction(
  userId: string,
  action: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  try {
    await prisma.securityEvent.create({
      data: {
        type: `ADMIN_${action}`,
        severity: 'INFO',
        message: `Admin action: ${action}`,
        userId,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    console.error('Error logging admin action:', error);
  }
}







