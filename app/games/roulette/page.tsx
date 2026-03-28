'use client';

import React from 'react';

import GameViewport from '@/components/games/GameViewport';
import RouletteGame from '@/components/games/RouletteGame';

export default function RouletteGamePage(): React.JSX.Element {
  return (
    <GameViewport
      backgroundClassName="bg-gradient-to-b from-[#030508] via-[#04060a] to-[#020308]"
      contentClassName="px-0"
    >
      <RouletteGame />
    </GameViewport>
  );
}
