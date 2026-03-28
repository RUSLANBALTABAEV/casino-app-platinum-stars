'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useTelegram } from '@/context/TelegramContext';

type TaskStatus = 'PENDING' | 'REVIEW' | 'APPROVED' | 'REJECTED';

interface TaskItem {
  id: string;
  title: string;
  description?: string | null;
  reward: number;
  sponsorLink?: string | null;
  status: TaskStatus;
  userTaskId: string | null;
  requiredProof: boolean;
  completionsTotal: number;
}

interface TasksResponse {
  tasks: TaskItem[];
  error?: string;
}

export default function TasksPage(): React.JSX.Element {
  const { initDataRaw } = useTelegram();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!initDataRaw) {
      setError('Подождите, идёт инициализация Telegram.');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/mini-app/tasks', {
        method: 'GET',
        headers: {
          'x-telegram-init-data': initDataRaw,
        },
      });

      const data = await response.json().catch(() => null) as TasksResponse | null;

      if (!response.ok) {
        const errorMsg = data?.error || `Ошибка ${response.status}: ${response.statusText}`;
        setError(errorMsg);
        return;
      }

      if (data?.tasks) {
        setTasks(data.tasks);
      } else {
        setError('Не удалось загрузить задания.');
      }
    } catch (fetchError) {
      const message =
        fetchError instanceof Error ? fetchError.message : 'Не удалось загрузить задания.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [initDataRaw]);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const formatReward = useCallback((value: number) => {
    return `+${value.toLocaleString('ru-RU')} ★`;
  }, []);

  const handleSubmitTask = useCallback(
    async (task: TaskItem) => {
      if (!initDataRaw) {
        setError('Подождите, идёт инициализация Telegram.');
        return;
      }
      if (task.status === 'APPROVED') {
        return;
      }

      let proofUrl: string | undefined;
      if (task.requiredProof) {
        proofUrl = window.prompt('Вставьте ссылку-подтверждение выполнения задания') ?? undefined;
        if (!proofUrl || !proofUrl.trim()) {
          return;
        }
      }

      setPendingTaskId(task.id);
      setError(null);

      try {
        const response = await fetch('/api/mini-app/tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-telegram-init-data': initDataRaw,
          },
          body: JSON.stringify({
          taskId: task.id,
          proofUrl
          }),
        });

        const data = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;

        if (!response.ok) {
          const errorMsg = data?.error || `Ошибка ${response.status}: ${response.statusText}`;
          setError(errorMsg);
          return;
        }

        if (data?.success) {
          await fetchTasks();
        } else if (data?.error) {
          setError(data.error);
        } else {
          setError('Не удалось отправить выполнение.');
        }
      } catch (submitError) {
        const message =
          submitError instanceof Error
            ? submitError.message
            : 'Не удалось отправить выполнение задания.';
        setError(message);
      } finally {
        setPendingTaskId(null);
      }
    },
    [fetchTasks, initDataRaw]
  );

  const memoizedTasks = useMemo(() => tasks, [tasks]);

  return (
    <section className="space-y-6">
      <header className="relative space-y-2">
        <div className="relative z-10 space-y-2">
          <p className="ui-kicker">Задания и партнёры</p>
          <h1 className="ui-title">Выполните задания и заберите дополнительные звёзды</h1>
          <p className="ui-lead max-w-[50ch]">
            Подписывайтесь на каналы спонсоров, проходите активности и повышайте свой статус в играх.
          </p>
        </div>
      </header>

      <Link
        className="ui-card ui-card-glass ui-card-pad block transition hover:border-gold-400/60 hover:bg-black/40"
        data-garland="1"
        href="/gift"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_60%),radial-gradient(circle_at_bottom,rgba(34,211,238,0.10),transparent_55%)]"
        />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5">
            <p className="ui-kicker">Ежедневные подарки</p>
            <h2 className="text-lg font-semibold text-platinum">🎁 Подарок дня</h2>
            <p className="text-sm text-platinum/58">Отдельная вкладка с коробкой под ёлкой.</p>
          </div>
          <span className="ui-btn ui-btn-secondary">Открыть</span>
        </div>
      </Link>

      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={`skeleton-${index}`}
              className="ui-card h-24 animate-pulse"
            />
          ))}
        </div>
      )}

      {!isLoading && memoizedTasks.length === 0 && (
        <p className="ui-card ui-card-glass ui-card-gold ui-card-pad text-sm text-platinum/60">
          Активных заданий пока нет. Загляните позже или включите уведомления в боте.
        </p>
      )}

      {error && (
        <p className="ui-chip border-red-400/25 bg-red-500/10 text-red-200">
          {error} Попробуйте обновить страницу.
        </p>
      )}

      <div className="space-y-4">
        {memoizedTasks.map((task) => {
          const isApproved = task.status === 'APPROVED';
          const isPendingReview = task.status === 'REVIEW';
          const isDisabled = pendingTaskId === task.id;

          return (
            <article
              key={task.id}
              className="ui-card ui-card-glass ui-card-gold ui-card-pad grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-6"
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="ui-chip ui-chip-gold">{formatReward(task.reward)}</span>
                  {task.requiredProof ? (
                    <span className="ui-chip border-white/10 bg-white/5 text-platinum/60">
                      Требуется подтверждение
                    </span>
                  ) : null}
                </div>
                <h2 className="text-lg font-semibold text-platinum">{task.title}</h2>
                {task.description && (
                  <p className="text-sm text-platinum/60">{task.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-platinum/45">
                  <span>Выполнений: {task.completionsTotal}</span>
                </div>
              </div>

              <div className="flex flex-col items-stretch gap-2 md:items-end">
                {task.sponsorLink && (
                  <a
                    className="ui-btn ui-btn-secondary"
                    href={task.sponsorLink}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Открыть задание
                  </a>
                )}
                <button
                  className={`ui-btn ${
                    isApproved
                      ? 'border border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                      : isPendingReview
                        ? 'border border-yellow-400/35 bg-yellow-500/10 text-yellow-100'
                        : 'ui-btn-primary'
                  }`}
                  disabled={isApproved || isPendingReview || isDisabled}
                  onClick={() => {
                    void handleSubmitTask(task);
                  }}
                  type="button"
                >
                  {isApproved
                    ? 'Задание выполнено'
                    : isPendingReview
                      ? 'На проверке'
                      : isDisabled
                        ? 'Отправка...'
                        : 'Отметить выполнение'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
