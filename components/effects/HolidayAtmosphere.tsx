'use client';

import React from 'react';

import SnowfallOverlay from '@/components/effects/SnowfallOverlay';
import FrostOverlay from '@/components/effects/FrostOverlay';

export default function HolidayAtmosphere(): React.JSX.Element {
  return (
    <>
      <FrostOverlay className="opacity-48" />
      <SnowfallOverlay className="opacity-42" density={0.032} />
      <SnowfallOverlay className="opacity-26 blur-[0.3px]" density={0.016} />
    </>
  );
}
