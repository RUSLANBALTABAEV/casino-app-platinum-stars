import { prisma } from '@/lib/prisma';

type SecuritySeverity = 'INFO' | 'WARNING' | 'CRITICAL';

interface LogSecurityEventInput {
  type: string;
  severity?: SecuritySeverity;
  message: string;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logSecurityEvent({
  type,
  severity = 'INFO',
  message,
  userId,
  metadata
}: LogSecurityEventInput) {
  await prisma.securityEvent.create({
    data: {
      type,
      severity,
      message,
      userId: userId ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metadata: (metadata as any) ?? null
    }
  });
}

export function listSecurityEvents(limit = 50) {
  return prisma.securityEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      user: {
        select: {
          username: true,
          firstName: true,
          lastName: true
        }
      }
    }
  });
}
