import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureDatabaseReady } from '@/lib/db/ensure';
import { requireAdminAuth, applyAdminRateLimit } from '@/lib/services/admin-auth';
import { applyHeaders } from '@/lib/http/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  // High-risk endpoint: disabled by default. Enable explicitly via env var.
  // This reduces blast radius if admin auth is ever bypassed or misconfigured.
  if (process.env.ENABLE_ADMIN_DRAIN !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Rate limiting - более строгий для критических операций
  const rateResult = applyAdminRateLimit(req, 3, 60_000);
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      rateResult
    );
  }

  const authResult = await requireAdminAuth(req);

  if (!authResult.isAuthenticated) {
    if (authResult.requiresTOTP) {
      return applyHeaders(
        NextResponse.json({ error: 'TOTP required', requiresTOTP: true }, { status: 401 }),
        rateResult
      );
    }
    return applyHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), rateResult);
  }

  try {
    const { targetUsername, amount } = (await req.json()) as {
      targetUsername?: string;
      amount?: number;
    };

    await ensureDatabaseReady();

    const adminUser = await prisma.user.findUnique({
      where: { id: authResult.userId }
    });

    if (!adminUser || !adminUser.isAdmin) {
      return applyHeaders(
        NextResponse.json({ error: 'Admin user not found' }, { status: 404 }),
        rateResult
      );
    }

    if (!targetUsername || !targetUsername.trim()) {
      return applyHeaders(
        NextResponse.json({ error: 'Укажите имя пользователя' }, { status: 400 }),
        rateResult
      );
    }

    if (!amount || amount <= 0) {
      return applyHeaders(
        NextResponse.json({ error: 'Укажите сумму больше 0' }, { status: 400 }),
        rateResult
      );
    }

    // Найти пользователя по username (с @ или без)
    const normalizedUsername = targetUsername.trim().replace(/^@/, '');
    const targetUser = await prisma.user.findFirst({
      where: {
        username: {
          equals: normalizedUsername,
          mode: 'insensitive'
        }
      }
    });

    if (!targetUser) {
      return applyHeaders(
        NextResponse.json({ error: 'Пользователь не найден в базе данных' }, { status: 404 }),
        rateResult
      );
    }

    // Get all user balances (excluding target user)
    const allBalances = await prisma.starBalance.findMany({
      where: {
        userId: { not: targetUser.id }
      },
      include: {
        user: {
          select: { id: true, username: true }
        }
      }
    });

    // Calculate total available to drain
    const totalAvailable = allBalances.reduce((sum, b) => sum + b.available, 0);
    
    if (amount > totalAvailable) {
      return applyHeaders(
        NextResponse.json({ 
          error: `Недостаточно средств. Доступно: ${totalAvailable} звезд` 
        }, { status: 400 }),
        rateResult
      );
    }

    // Transaction: drain specified amount and add to target user
    const result = await prisma.$transaction(async (tx) => {
      let remainingToDrain = amount;
      const affectedUsers: string[] = [];

      // Drain from users until we have enough
      for (const balance of allBalances) {
        if (remainingToDrain <= 0) break;

        const toDrain = Math.min(balance.available, remainingToDrain);
        
        await tx.starBalance.update({
          where: { id: balance.id },
          data: {
            available: { decrement: toDrain },
            lifetimeSpend: { increment: toDrain }
          }
        });

        // Create transaction record
        await tx.transaction.create({
          data: {
            userId: balance.userId,
            type: 'WITHDRAWAL',
            amount: toDrain,
            currency: 'STARS',
            provider: 'MANUAL',
            status: 'COMPLETED',
            meta: {
              source: 'ADMIN_DRAIN',
              drainedBy: adminUser.id,
              transferredTo: targetUser.id,
              reason: 'Admin transfer'
            }
          }
        });

        affectedUsers.push(balance.user.id);
        remainingToDrain -= toDrain;
      }

      // Add to target user balance
      let targetBalance = await tx.starBalance.findUnique({
        where: { userId: targetUser.id }
      });

      if (!targetBalance) {
        targetBalance = await tx.starBalance.create({
          data: {
            userId: targetUser.id,
            available: 0,
            reserved: 0,
            lifetimeEarn: 0,
            lifetimeSpend: 0,
            bonusAvailable: 0,
            bonusReserved: 0,
            bonusLifetimeEarn: 0,
            bonusLifetimeSpend: 0
          }
        });
      }

      const updatedTargetBalance = await tx.starBalance.update({
        where: { userId: targetUser.id },
        data: {
          available: { increment: amount },
          lifetimeEarn: { increment: amount }
        }
      });

      // Create transaction record for target user
      await tx.transaction.create({
        data: {
          userId: targetUser.id,
          type: 'DEPOSIT',
          amount: amount,
          currency: 'STARS',
          provider: 'MANUAL',
          status: 'COMPLETED',
          meta: {
            source: 'ADMIN_DRAIN_TRANSFER',
            transferredBy: adminUser.id,
            reason: 'Admin transfer'
          }
        }
      });

      // Create record of this operation
      const operation = await tx.adminDrainOperation.create({
        data: {
          performedBy: adminUser.id,
          totalStars: amount,
          affectedUsers: affectedUsers.length,
          description: `Transferred ${amount} stars to ${targetUsername} from ${affectedUsers.length} users.`
        }
      });

      return { updatedTargetBalance, operation, affectedUsers: affectedUsers.length };
    });

    // Log critical security event
    await prisma.securityEvent.create({
      data: {
        type: 'ADMIN_DRAIN_OPERATION',
        severity: 'CRITICAL',
        message: `Admin transferred ${amount} stars to ${targetUsername} from ${result.affectedUsers} users`,
        userId: adminUser.id,
        metadata: {
          adminId: adminUser.id,
          targetUserId: targetUser.id,
          targetUsername: targetUsername,
          totalStars: amount,
          affectedUsers: result.affectedUsers,
          action: 'ECONOMY_DRAIN',
          timestamp: new Date().toISOString()
        }
      }
    });

    return applyHeaders(
      NextResponse.json({
        success: true,
        totalStars: amount,
        affectedUsers: result.affectedUsers,
        targetUser: {
          id: targetUser.id,
          username: targetUser.username,
          firstName: targetUser.firstName,
          lastName: targetUser.lastName
        },
        targetNewBalance: result.updatedTargetBalance.available,
        message: `Переведено ${amount} звезд пользователю ${targetUsername}`
      }),
      rateResult
    );
  } catch (error) {
    console.error('Drain error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const status = errorMessage.includes('Unauthorized') || errorMessage.includes('token') ? 401 : 500;

    // Log the error as security event
    try {
      const adminUser = await prisma.user.findUnique({
        where: { id: authResult.userId }
      });
      if (adminUser) {
        await prisma.securityEvent.create({
          data: {
            type: 'ADMIN_DRAIN_FAILED',
            severity: 'CRITICAL',
            message: `Admin drain operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            userId: adminUser.id,
            metadata: {
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString()
            }
          }
        });
      }
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }

    return applyHeaders(
      NextResponse.json({ error: errorMessage }, { status }),
      rateResult
    );
  }
}
