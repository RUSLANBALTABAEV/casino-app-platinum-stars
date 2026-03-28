'use client';

import React, { useEffect, useMemo, useRef } from 'react';

type Snowflake = {
  x: number;
  y: number;
  radius: number;
  speedY: number;
  driftX: number;
  opacity: number;
  wobble: number;
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

function createFlake(width: number, height: number): Snowflake {
  const radius = Math.random() * 2.2 + 0.8;
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    radius,
    speedY: 18 + Math.random() * 42 + radius * 6,
    driftX: (Math.random() - 0.5) * 18,
    opacity: 0.22 + Math.random() * 0.55,
    wobble: Math.random() * Math.PI * 2
  };
}

export default function SnowfallOverlay({
  enabled = true,
  density = 0.06,
  className = ''
}: {
  enabled?: boolean;
  density?: number;
  className?: string;
}): React.JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const flakesRef = useRef<Snowflake[]>([]);
  const lastRef = useRef<number>(0);

  const shouldRun = useMemo(() => enabled && !prefersReducedMotion(), [enabled]);

  useEffect(() => {
    if (!shouldRun) {
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

    const resize = () => {
      const parent = canvas.parentElement;
      const width = parent?.clientWidth ?? window.innerWidth;
      const height = parent?.clientHeight ?? window.innerHeight;
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const targetCount = Math.max(14, Math.floor(width * height * density * 0.001));
      const next: Snowflake[] = [];
      for (let i = 0; i < targetCount; i += 1) {
        next.push(createFlake(width, height));
      }
      flakesRef.current = next;
    };

    const step = (timestamp: number) => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) {
        animationRef.current = window.requestAnimationFrame(step);
        return;
      }

      const last = lastRef.current;
      const delta = last ? Math.min(0.05, (timestamp - last) / 1000) : 0;
      lastRef.current = timestamp;

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      const flakes = flakesRef.current;
      for (const flake of flakes) {
        flake.wobble += delta * 1.4;
        flake.y += flake.speedY * delta;
        flake.x += (flake.driftX + Math.sin(flake.wobble) * 10) * delta;

        if (flake.y > height + 12) {
          flake.y = -12;
          flake.x = Math.random() * width;
        }
        if (flake.x < -20) {
          flake.x = width + 20;
        } else if (flake.x > width + 20) {
          flake.x = -20;
        }

        const glow = ctx.createRadialGradient(flake.x, flake.y, 0, flake.x, flake.y, flake.radius * 6);
        glow.addColorStop(0, `rgba(255,255,255,${flake.opacity})`);
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(flake.x, flake.y, flake.radius * 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = flake.opacity;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.beginPath();
        ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.globalCompositeOperation = 'source-over';
      animationRef.current = window.requestAnimationFrame(step);
    };

    resize();
    window.addEventListener('resize', resize);
    animationRef.current = window.requestAnimationFrame(step);

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) {
        window.cancelAnimationFrame(animationRef.current);
      }
    };
  }, [density, shouldRun]);

  if (!shouldRun) {
    return null;
  }

  return (
    <div
      aria-hidden
      className={[
        'pointer-events-none absolute inset-0 z-0 overflow-hidden',
        className
      ].join(' ')}
    >
      <canvas ref={canvasRef} className="h-full w-full opacity-70" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(180,220,255,0.14),transparent_56%)]" />
    </div>
  );
}
