import React from 'react';

export const runtime = 'nodejs';

import { prisma } from '@/lib/prisma';
import { generateReferralLink, getReferralReward } from '@/lib/services/referral';
import { saveReferralSettingsAction } from './actions';

async function getReferralStats() {
  if (!process.env.DATABASE_URL) {
    return {
      totalUsers: 0,
      totalReferrals: 0,
      completedReferrals: 0,
      pendingReferrals: 0,
      totalRewardsIssued: 0,
      topReferrers: [],
      recentReferrals: []
    };
  }

  try {
    const [totalUsers, totalReferrals, completedReferrals, pendingReferrals, totalRewards, topReferrers, recentReferrals] = await Promise.all([
      prisma.user.count(),
      prisma.referral.count(),
      prisma.referral.count({ where: { rewardIssued: true } }),
      prisma.referral.count({ where: { rewardIssued: false } }),
      prisma.referral.aggregate({
        where: { rewardIssued: true },
        _sum: { rewardAmount: true }
      }),
      prisma.user.findMany({
        where: {
          referralsSent: {
            some: {}
          }
        },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          referralCode: true,
          referralsSent: {
            select: {
              id: true,
              rewardIssued: true,
              rewardAmount: true,
              createdAt: true,
              invitee: {
                select: {
                  username: true,
                  firstName: true,
                  lastName: true
                }
              }
            },
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        },
        orderBy: {
          referralsSent: {
            _count: 'desc'
          }
        },
        take: 10
      }),
      prisma.referral.findMany({
        include: {
          inviter: {
            select: {
              username: true,
              firstName: true,
              lastName: true,
              referralCode: true
            }
          },
          invitee: {
            select: {
              username: true,
              firstName: true,
              lastName: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      })
    ]);

    return {
      totalUsers,
      totalReferrals,
      completedReferrals,
      pendingReferrals,
      totalRewardsIssued: totalRewards._sum.rewardAmount || 0,
      topReferrers: topReferrers.map(user => ({
        ...user,
        totalInvited: user.referralsSent.length,
        completed: user.referralsSent.filter(r => r.rewardIssued).length,
        pending: user.referralsSent.filter(r => !r.rewardIssued).length
      })),
      recentReferrals
    };
  } catch (error) {
    console.error('Error loading referral stats:', error);
    return {
      totalUsers: 0,
      totalReferrals: 0,
      completedReferrals: 0,
      pendingReferrals: 0,
      totalRewardsIssued: 0,
      topReferrers: [],
      recentReferrals: []
    };
  }
}

export default async function AdminReferralsPage(): Promise<React.JSX.Element> {
  const [stats, referralReward, isMock] = await Promise.all([
    getReferralStats(),
    getReferralReward().catch(() => 0),
    Promise.resolve(!process.env.DATABASE_URL)
  ]);

  // Получаем username бота из токена или используем дефолтное значение
  // Формат токена: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
  // Можно извлечь username через Bot API, но для простоты используем переменную окружения
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || process.env.BOT_USERNAME || 'platinumstarsgamebot';

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-400/70">Реферальная система</p>
        <h1 className="text-3xl font-semibold text-platinum">Управление рефералами</h1>
        <p className="max-w-[70ch] text-sm text-platinum/60">
          Настройте бонусы за приглашение друзей, просматривайте статистику и управляйте реферальной программой.
        </p>
        {isMock && (
          <p className="py-2 text-xs text-yellow-300">
            Подключение к базе данных не настроено. Отображены значения по умолчанию, сохранение отключено.
          </p>
        )}
      </header>

      {/* Статистика */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/40 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-platinum/50">Всего пользователей</p>
          <p className="mt-2 text-2xl font-bold text-platinum">{stats.totalUsers}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/40 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-platinum/50">Всего рефералов</p>
          <p className="mt-2 text-2xl font-bold text-platinum">{stats.totalReferrals}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/40 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-platinum/50">Завершено</p>
          <p className="mt-2 text-2xl font-bold text-emerald-400">{stats.completedReferrals}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/40 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-platinum/50">Ожидают</p>
          <p className="mt-2 text-2xl font-bold text-yellow-400">{stats.pendingReferrals}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/40 p-4 sm:col-span-2 lg:col-span-4">
          <p className="text-xs uppercase tracking-[0.16em] text-platinum/50">Всего выдано наград</p>
          <p className="mt-2 text-2xl font-bold text-gold-400">{stats.totalRewardsIssued} ★</p>
        </div>
      </section>

      {/* Настройки */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-platinum">Настройки бонусов</h2>
        <form action={saveReferralSettingsAction} className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/65">
              Награда за друга (★)
              <input
                className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-4 py-3 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                defaultValue={referralReward}
                disabled={isMock}
                min={0}
                name="referralReward"
                type="number"
              />
            </label>
            <p className="mt-2 text-xs text-platinum/55">
              Количество звёзд, которое получает пригласивший за успешно завершённое целевое действие приглашённого игрока.
            </p>
          </div>
          <button
            className="inline-flex items-center justify-center rounded-xl border border-gold-400/50 bg-gold-500/20 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-gold-200 transition hover:bg-gold-500/30 hover:border-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={isMock}
            type="submit"
          >
            Сохранить настройки
          </button>
        </form>
      </section>

      {/* Топ рефереров */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-platinum">Топ рефереров</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.16em] text-platinum/50">Пользователь</th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.16em] text-platinum/50">Реферальный код</th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.16em] text-platinum/50">Ссылка</th>
                <th className="px-4 py-3 text-center text-xs uppercase tracking-[0.16em] text-platinum/50">Приглашено</th>
                <th className="px-4 py-3 text-center text-xs uppercase tracking-[0.16em] text-platinum/50">Завершено</th>
                <th className="px-4 py-3 text-center text-xs uppercase tracking-[0.16em] text-platinum/50">Ожидают</th>
              </tr>
            </thead>
            <tbody>
              {stats.topReferrers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-platinum/50">
                    Нет данных о реферерах
                  </td>
                </tr>
              ) : (
                stats.topReferrers.map((user) => {
                  const displayName = user.username
                    ? `@${user.username}`
                    : [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Без имени';
                  const referralLink = generateReferralLink(botUsername, user.referralCode);

                  return (
                    <tr key={user.id} className="border-b border-white/5">
                      <td className="px-4 py-3 text-sm text-platinum">{displayName}</td>
                      <td className="px-4 py-3">
                        <code className="rounded bg-white/5 px-2 py-1 text-xs text-gold-400">{user.referralCode}</code>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={referralLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 underline break-all"
                        >
                          {referralLink}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-platinum">{user.totalInvited}</td>
                      <td className="px-4 py-3 text-center text-sm text-emerald-400">{user.completed}</td>
                      <td className="px-4 py-3 text-center text-sm text-yellow-400">{user.pending}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Недавние рефералы */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-platinum">Недавние рефералы</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.16em] text-platinum/50">Дата</th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.16em] text-platinum/50">Пригласивший</th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.16em] text-platinum/50">Приглашённый</th>
                <th className="px-4 py-3 text-center text-xs uppercase tracking-[0.16em] text-platinum/50">Награда</th>
                <th className="px-4 py-3 text-center text-xs uppercase tracking-[0.16em] text-platinum/50">Статус</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentReferrals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-platinum/50">
                    Нет данных о рефералах
                  </td>
                </tr>
              ) : (
                stats.recentReferrals.map((referral) => {
                  const inviterName = referral.inviter.username
                    ? `@${referral.inviter.username}`
                    : [referral.inviter.firstName, referral.inviter.lastName].filter(Boolean).join(' ') || 'Без имени';
                  const inviteeName = referral.invitee.username
                    ? `@${referral.invitee.username}`
                    : [referral.invitee.firstName, referral.invitee.lastName].filter(Boolean).join(' ') || 'Без имени';

                  return (
                    <tr key={referral.id} className="border-b border-white/5">
                      <td className="px-4 py-3 text-xs text-platinum/70">
                        {referral.createdAt instanceof Date
                          ? referral.createdAt.toLocaleString('ru-RU')
                          : new Date(referral.createdAt).toLocaleString('ru-RU')}
                      </td>
                      <td className="px-4 py-3 text-sm text-platinum">{inviterName}</td>
                      <td className="px-4 py-3 text-sm text-platinum">{inviteeName}</td>
                      <td className="px-4 py-3 text-center text-sm text-gold-400">{referral.rewardAmount} ★</td>
                      <td className="px-4 py-3 text-center">
                        {referral.rewardIssued ? (
                          <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs text-emerald-400">Завершено</span>
                        ) : (
                          <span className="rounded-full bg-yellow-500/20 px-2 py-1 text-xs text-yellow-400">Ожидает</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

