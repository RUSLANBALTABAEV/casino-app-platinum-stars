'use client';
import React, { useEffect, useState } from 'react';

interface WinFloatProps {
  amount: number;
  active: boolean;
  x?: number;
  y?: number;
}

export default function WinFloat({ amount, active, x = 50, y = 50 }: WinFloatProps): React.JSX.Element | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1200);
    return () => clearTimeout(t);
  }, [active]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed z-50 text-2xl font-extrabold"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        color: amount > 0 ? '#fbbf24' : '#f87171',
        textShadow: amount > 0 ? '0 0 20px rgba(251,191,36,0.8)' : '0 0 20px rgba(248,113,113,0.8)',
        animation: 'floatUp 1.2s ease-out forwards',
        transform: 'translateX(-50%)',
      }}
    >
      {amount > 0 ? `+${amount} ★` : `−${Math.abs(amount)} ★`}
    </div>
  );
}
