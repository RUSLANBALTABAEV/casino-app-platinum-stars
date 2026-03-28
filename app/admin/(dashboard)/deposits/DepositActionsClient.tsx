'use client';

import React, { useState } from 'react';
import { approveDepositAction, rejectDepositAction } from './actions';
import CompleteDepositModal from './CompleteDepositModal';

type DepositActionsClientProps = {
  depositId: string;
  status: string;
  stars: number;
  userName: string;
  isMockMode: boolean;
};

export default function DepositActionsClient({
  depositId,
  status,
  stars,
  userName,
  isMockMode
}: DepositActionsClientProps): React.JSX.Element {
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (status === 'PENDING') {
    return (
      <div className="flex flex-col gap-2 text-xs">
        <form action={approveDepositAction}>
          <input type="hidden" name="depositId" value={depositId} />
          <button
            className="w-full rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-3 py-2 font-semibold uppercase tracking-[0.12em] text-emerald-100 transition hover:bg-emerald-500/30 hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            type="submit"
            disabled={isMockMode}
          >
            Одобрить
          </button>
        </form>
        <form action={rejectDepositAction}>
          <input type="hidden" name="depositId" value={depositId} />
          <button
            className="w-full rounded-lg border border-red-400/50 bg-red-500/20 px-3 py-2 font-semibold uppercase tracking-[0.12em] text-red-100 transition hover:bg-red-500/30 hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-40"
            type="submit"
            disabled={isMockMode}
          >
            Отклонить
          </button>
        </form>
      </div>
    );
  }

  if (status === 'APPROVED') {
    return (
      <>
        <button
          className="w-full rounded-lg border border-gold-400/50 bg-gold-500/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-gold-100 transition hover:bg-gold-500/30 hover:border-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
          type="button"
          onClick={() => setIsModalOpen(true)}
          disabled={isMockMode}
        >
          Зачислить звёзды
        </button>
        <CompleteDepositModal
          depositId={depositId}
          defaultStars={stars}
          userName={userName}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
      </>
    );
  }

  return <></>;
}
