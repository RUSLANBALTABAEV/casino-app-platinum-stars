'use client';

import React, { useEffect, useRef } from 'react';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  life: number;
  color: string;
};

const PALETTE = ['#fbbf24', '#f472b6', '#60a5fa', '#34d399', '#a78bfa', '#fb7185'];

export default function ConfettiBurst({
  active,
  className = ''
}: {
  active: boolean;
  className?: string;
}): React.JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const parent = canvas.parentElement;
    const width = parent?.clientWidth ?? window.innerWidth;
    const height = parent?.clientHeight ?? window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const originX = width * 0.5;
    const originY = height * 0.42;
    const count = Math.max(60, Math.floor(width * 0.16));
    const particles: Particle[] = [];

    for (let i = 0; i < count; i += 1) {
      const angle = (-Math.PI / 2) + (Math.random() - 0.5) * Math.PI * 0.9;
      const power = 520 + Math.random() * 560;
      const size = 4 + Math.random() * 7;
      particles.push({
        x: originX + (Math.random() - 0.5) * 12,
        y: originY + (Math.random() - 0.5) * 12,
        vx: Math.cos(angle) * power,
        vy: Math.sin(angle) * power,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 10,
        size,
        life: 1,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)]
      });
    }

    let last = 0;
    const gravity = 980;
    const drag = 0.86;

    const step = (ts: number) => {
      const delta = last ? Math.min(0.05, (ts - last) / 1000) : 0;
      last = ts;

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';

      let alive = 0;
      for (const p of particles) {
        if (p.life <= 0) {
          continue;
        }
        alive += 1;
        p.vx *= drag;
        p.vy = p.vy * drag + gravity * delta;
        p.x += p.vx * delta;
        p.y += p.vy * delta;
        p.rotation += p.rotationSpeed * delta;
        p.life -= delta * 0.6;

        const alpha = Math.max(0, Math.min(1, p.life));
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size * 0.5, -p.size * 0.3, p.size, p.size * 0.6);
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      if (alive > 0) {
        rafRef.current = window.requestAnimationFrame(step);
      }
    };

    rafRef.current = window.requestAnimationFrame(step);

    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [active]);

  if (!active) {
    return null;
  }

  return <canvas ref={canvasRef} aria-hidden className={['absolute inset-0', className].join(' ')} />;
}

