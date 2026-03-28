/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import React from 'react';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';
import { listTaskSubmissions } from '@/lib/services/tasks';

type AdminTask = {
  id: string;
  title: string;
  description: string | null;
  reward: number;
  sponsorLink: string | null;
  isActive: boolean;
  requiredProof: boolean;
  completionsTotal: number;
};

type TaskRecord = {
  id: string;
  title: string;
  description: string | null;
  reward: number;
  sponsorLink: string | null;
  isActive: boolean;
  requiredProof: boolean;
  _count?: {
    completions: number;
  };
};
import { createTaskAction, toggleTaskAction, resolveTaskAction } from './actions';

async function getTasks(): Promise<AdminTask[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;

  const tasks = (await db.task.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      _count: {
        select: { completions: true }
      }
    }
  })) as unknown as TaskRecord[];

  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description ?? null,
    reward: task.reward,
    sponsorLink: task.sponsorLink ?? null,
    isActive: task.isActive,
    requiredProof: task.requiredProof,
    completionsTotal: task._count?.completions ?? 0
  }));
}

async function getSubmissions() {
  return await listTaskSubmissions(['REVIEW', 'APPROVED', 'REJECTED']);
}

export default async function AdminTasksPage(): Promise<React.JSX.Element> {
  const isMockMode = !process.env.DATABASE_URL;

  const tasks: AdminTask[] = isMockMode
    ? Array.from({ length: 5 }).map((_, index) => ({
        id: `task-mock-${index}`,
        title: `Демо задание ${index + 1}`,
        description: 'Пример задания для демонстрации админ-панели.',
        reward: 150 + index * 25,
        sponsorLink: 'https://t.me/platinum_stars',
        isActive: index % 2 === 0,
        requiredProof: index % 2 === 0,
        completionsTotal: 30 + index * 5
      }))
    : await getTasks().catch(() => []);

  const submissions: TaskSubmission[] = isMockMode
    ? (Array.from({ length: 3 }).map((_, index) => ({
        id: `submission-mock-${index}`,
        status: index === 0 ? 'REVIEW' : index === 1 ? 'APPROVED' : 'REJECTED',
        createdAt: new Date(),
        proofUrl: 'https://t.me/example',
        awardedAt: index === 1 ? new Date() : null,
        taskId: tasks[index % tasks.length]?.id ?? 'task-mock',
        userId: `user-${index}`,
        task: tasks[index % tasks.length],
        user: {
          firstName: 'Demo',
          lastName: `User ${index}`,
          username: `demo_user_${index}`
        }
      })) as unknown as TaskSubmission[])
    : await getSubmissions().catch(() => []);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-400/70">Задания</p>
        <h1 className="text-3xl font-semibold text-platinum">Спонсорские задания</h1>
        <p className="text-sm text-platinum/60">
          Управляйте заданиями: включайте, выключайте и создавайте новые активности для игроков.
        </p>
        {isMockMode && (
          <p className="py-2 text-xs text-yellow-300">
            Подключение к базе данных не настроено. Отображены демонстрационные задания, формы
            отключены.
          </p>
        )}
      </header>

      <section className="flex flex-col gap-6">
        <div className="space-y-4">
          {tasks.map((task) => (
            <article
              key={task.id}
              className="space-y-3 py-4"
            >
              <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-platinum">{task.title}</h2>
                  <p className="text-xs uppercase tracking-[0.14em] text-platinum/50">
                    Награда: {task.reward} ★
                  </p>
                </div>
                <span
                  className={`inline-flex px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] ${
                    task.isActive
                      ? 'bg-emerald-500/20 text-emerald-200'
                      : 'bg-red-500/20 text-red-200'
                  }`}
                >
                  {task.isActive ? 'Активно' : 'Выключено'}
                </span>
              </header>
              <p className="text-sm text-platinum/70">{task.description ?? 'Без описания.'}</p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-platinum/50">
                <span>Выполнено: {task.completionsTotal}</span>
                {task.sponsorLink && (
                  <a
                    className="px-3 py-1 text-xs uppercase tracking-[0.12em] text-gold-300 transition hover:text-gold-200"
                    href={task.sponsorLink}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Ссылка на спонсора
                  </a>
                )}
              </div>
              <form action={toggleTaskAction}>
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="command" value={task.isActive ? 'deactivate' : 'activate'} />
                <button
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                    task.isActive
                      ? 'border-red-400/50 bg-red-500/20 text-red-100 hover:bg-red-500/30'
                      : 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30'
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                  type="submit"
                  disabled={isMockMode}
                >
                  {task.isActive ? 'Отключить' : 'Включить'}
                </button>
              </form>
            </article>
          ))}
          {tasks.length === 0 && (
            <p className="py-4 text-center text-sm text-platinum/50">
              Задания ещё не созданы. Используйте форму справа, чтобы добавить первое задание.
            </p>
          )}
        </div>

        <aside className="space-y-4 py-4">
          <h2 className="text-lg font-semibold text-platinum">Новое задание</h2>
          <form action={createTaskAction} className="space-y-4">
            <label className="flex flex-col gap-2 text-sm text-platinum/70">
              Название
              <input
                className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                name="title"
                placeholder="Подписка на канал"
                required
                disabled={isMockMode}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-platinum/70">
              Описание
              <textarea
                className="min-h-[80px] rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                name="description"
                placeholder="Условия выполнения задания"
                disabled={isMockMode}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-platinum/70">
              Награда (★)
              <input
                className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                name="reward"
                type="number"
                min={0}
                defaultValue={100}
                disabled={isMockMode}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-platinum/70">
              Ссылка спонсора
              <input
                className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                name="link"
                placeholder="https://t.me/..."
                disabled={isMockMode}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm text-platinum/70">
              Требуется подтверждение
              <input
                className="h-5 w-5 border-b border-platinum/20 text-gold-400"
                defaultChecked={false}
                disabled={isMockMode}
                name="requiredProof"
                type="checkbox"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-platinum/70">
              Максимум выполнений (опционально)
              <input
                className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                name="maxCompletions"
                placeholder="Оставьте пустым для безлимитного"
                type="number"
                min={1}
                disabled={isMockMode}
              />
            </label>
            <button
              className="px-6 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold-200 transition hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-40"
              type="submit"
              disabled={isMockMode}
            >
              Создать задание
            </button>
          </form>
        </aside>
      </section>

      <section className="space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-platinum">Отклики пользователей</h2>
            <p className="text-xs uppercase tracking-[0.16em] text-platinum/45">
              Одобрение задач автоматически начисляет награду.
            </p>
          </div>
        </header>

        <div className="admin-table-wrapper">
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-[0.14em] text-platinum/50">
                <th className="px-3 py-2 font-semibold text-platinum/70">Пользователь</th>
                <th className="px-3 py-2 font-semibold text-platinum/70">Задание</th>
                <th className="px-3 py-2 font-semibold text-platinum/70">Статус</th>
                <th className="px-3 py-2 font-semibold text-platinum/70">Действия</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => {
                const statusLabel =
                  submission.status === 'APPROVED'
                    ? 'Одобрено'
                    : submission.status === 'REJECTED'
                      ? 'Отклонено'
                      : 'На проверке';
                return (
                  <tr key={submission.id} className="border-b border-white/5 last:border-none">
                    <td className="px-3 py-2">
                      <div className="flex flex-col">
                        <span className="font-medium text-platinum">
                          {[submission.user?.firstName, submission.user?.lastName]
                            .filter(Boolean)
                            .join(' ') || 'Без имени'}
                        </span>
                        <span className="text-xs text-platinum/50">
                          {submission.user?.username
                            ? `@${submission.user.username}`
                            : submission.userId}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col">
                        <span className="font-medium text-platinum">
                          {submission.task?.title ?? 'Задание'}
                        </span>
                        <span className="text-xs text-platinum/45">
                          Награда: {submission.task?.reward ?? 0} ★
                        </span>
                        {submission.proofUrl && (
                          <a
                            className="text-xs text-gold-300 underline"
                            href={submission.proofUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Подтверждение
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex px-2 py-0.5 text-xs uppercase tracking-[0.1em] ${
                          submission.status === 'APPROVED'
                            ? 'bg-emerald-500/20 text-emerald-200'
                            : submission.status === 'REJECTED'
                              ? 'bg-red-500/20 text-red-200'
                              : 'bg-yellow-500/20 text-yellow-200'
                        }`}
                      >
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-2 text-xs">
                        <form action={resolveTaskAction} className="flex items-center gap-2">
                          <input type="hidden" name="submissionId" value={submission.id} />
                          <input type="hidden" name="command" value="approve" />
                          <input
                            className="w-24 rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-xs text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                            name="payout"
                            placeholder={`${submission.task?.reward ?? 0}`}
                            type="number"
                            min={0}
                            disabled={isMockMode || submission.status !== 'REVIEW'}
                          />
                          <button
                            className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-300 transition hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
                            type="submit"
                            disabled={isMockMode || submission.status !== 'REVIEW'}
                          >
                            Одобрить
                          </button>
                        </form>
                        <form action={resolveTaskAction}>
                          <input type="hidden" name="submissionId" value={submission.id} />
                          <input type="hidden" name="command" value="reject" />
                          <button
                            className="w-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-red-200 transition hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                            type="submit"
                            disabled={isMockMode || submission.status !== 'REVIEW'}
                          >
                            Отклонить
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {submissions.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-center text-platinum/50" colSpan={4}>
                    Активных откликов пока нет.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
type TaskSubmission = Awaited<ReturnType<typeof listTaskSubmissions>>[number];
