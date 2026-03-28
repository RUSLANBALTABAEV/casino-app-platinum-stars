'use client';

import React from 'react';

import CrashGame from '@/components/games/CrashGame';
import GameViewport from '@/components/games/GameViewport';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

export default function CrashGamePage(): React.JSX.Element {
  useBodyScrollLock(true);

  return (
    <GameViewport
      backgroundClassName="bg-gradient-to-b from-[#03060c] via-[#02060a] to-[#010407]"
      contentClassName="px-0 sm:px-4 lg:px-8"
    >
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <CrashGame />
      </div>
    </GameViewport>
  );
}
