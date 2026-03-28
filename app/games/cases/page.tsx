'use client';

import React from 'react';

import CaseGame from '@/components/games/CaseGame';
import GameViewport from '@/components/games/GameViewport';

export default function CasesPage(): React.JSX.Element {
  return (
    <GameViewport
      backgroundClassName="bg-gradient-to-b from-[#05060b] via-[#04060e] to-[#020309]"
      contentClassName="px-0"
    >
      <CaseGame />
    </GameViewport>
  );
}
