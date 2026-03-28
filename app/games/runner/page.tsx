'use client';

import React from 'react';

import GameViewport from '@/components/games/GameViewport';
import RunnerGame from '@/components/games/RunnerGame';

export default function RunnerGamePage(): React.JSX.Element {
  return (
    <GameViewport
      backgroundClassName="bg-gradient-to-b from-[#02040a] via-[#050a18] to-[#020309]"
      contentClassName="px-0"
    >
      <RunnerGame />
    </GameViewport>
  );
}
