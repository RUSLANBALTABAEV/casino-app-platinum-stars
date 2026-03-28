'use client';

import React from 'react';

import GameViewport from '@/components/games/GameViewport';
import LotteryGame from '@/components/games/LotteryGame';

export default function LotteryGamePage(): React.JSX.Element {
  return (
    <GameViewport
      backgroundClassName="bg-gradient-to-b from-[#040712] via-[#03060f] to-[#02030a]"
      contentClassName="px-0"
    >
      <LotteryGame />
    </GameViewport>
  );
}
