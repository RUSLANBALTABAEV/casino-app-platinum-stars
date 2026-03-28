'use client';

import clsx from 'clsx';
import React from 'react';

export default function FrostOverlay({
  className
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <div
      aria-hidden
      className={clsx('pointer-events-none absolute inset-0 z-0', className)}
    >
      <div className="absolute inset-0 holiday-frost" />
      <div className="absolute inset-0 holiday-frost-corners" />
    </div>
  );
}
