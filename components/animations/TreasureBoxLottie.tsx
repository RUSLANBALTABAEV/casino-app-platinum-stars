'use client';

import React, { useEffect, useRef, useState } from 'react';

type Phase = 'idle' | 'opening' | 'opened';

type LottieAnimation = {
  destroy: () => void;
  play: () => void;
  stop: () => void;
  setSpeed: (speed: number) => void;
  setSubframe?: (useSubFrames: boolean) => void;
  playSegments: (segments: [number, number] | Array<[number, number]>, forceFlag?: boolean) => void;
  goToAndStop: (value: number, isFrame?: boolean) => void;
  addEventListener: (eventName: string, callback: () => void) => void;
  removeEventListener: (eventName: string, callback: () => void) => void;
  totalFrames: number;
  loop: boolean;
};

async function loadAnimationJson(url: string): Promise<any> {
  const res = await fetch(url, {
    // В dev файл анимации может появиться после первого 404 (и force-cache будет держать старый ответ).
    cache: process.env.NODE_ENV === 'development' ? 'no-store' : 'force-cache'
  });
  if (!res.ok) {
    throw new Error(`Failed to load Lottie JSON: ${res.status}`);
  }
  return res.json();
}

export default function TreasureBoxLottie({
  phase,
  onOpened,
  onUnavailable,
  className = '',
  jsonUrl = '/lottie/treasure-box/treasure-box.json?v=1',
  // Внутри JSON у ассетов `u: "images/"`, поэтому basePath должен быть папкой анимации,
  // иначе получится `/images/images/...` и ассеты не подгрузятся.
  assetsPath = '/lottie/treasure-box/',
  renderer = 'svg'
}: {
  phase: Phase;
  onOpened?: () => void;
  onUnavailable?: (reason: string) => void;
  className?: string;
  jsonUrl?: string;
  assetsPath?: string;
  renderer?: 'svg' | 'canvas';
}): React.JSX.Element | null {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<LottieAnimation | null>(null);
  const completeHandlerRef = useRef<(() => void) | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [animationReady, setAnimationReady] = useState(false);

  useEffect(() => {
    let canceled = false;
    let unavailableSent = false;

    const mount = async () => {
      try {
        const [animationData, lottie] = await Promise.all([
          loadAnimationJson(jsonUrl),
          import('lottie-web')
        ]);
        if (canceled) {
          return;
        }

        const container = containerRef.current;
        if (!container) {
          return;
        }

        const tryLoad = (requestedRenderer: 'svg' | 'canvas') =>
          lottie.default.loadAnimation({
            container,
            renderer: requestedRenderer,
            loop: false,
            autoplay: false,
            animationData,
            rendererSettings: {
              progressiveLoad: true,
              hideOnTransparent: true,
              ...(requestedRenderer === 'canvas'
                ? {
                    // Снижает нагрузку на CPU/GPU на ретина-экранах и делает анимацию стабильнее.
                    // Визуально почти не отличается на 220px контейнере.
                    dpr: 1,
                    clearCanvas: true
                  }
                : {})
            },
            assetsPath
          }) as unknown as LottieAnimation;

        // Некоторые Lottie (особенно с графикой/эффектами) нестабильно работают в SVG.
        // Пробуем выбранный renderer, затем fallback на canvas.
        let instance: LottieAnimation;
        try {
          instance = tryLoad(renderer);
        } catch (e) {
          if (renderer !== 'canvas') {
            instance = tryLoad('canvas');
          } else {
            throw e;
          }
        }

        animRef.current = instance;
        instance.setSpeed(1);
        instance.setSubframe?.(false);
        setLoadError(null);
        setAnimationReady(true);
      } catch (error) {
        if (canceled) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to load Lottie';
        setLoadError(message);
        setAnimationReady(false);
        if (!unavailableSent) {
          unavailableSent = true;
          onUnavailable?.(message);
        }
      }
    };

    void mount();
    return () => {
      canceled = true;
      const anim = animRef.current;
      const completeHandler = completeHandlerRef.current;
      if (anim && completeHandler) {
        try {
          anim.removeEventListener('complete', completeHandler);
        } catch {
          // lottie-web can throw if instance is already destroyed
        }
      }
      animRef.current?.destroy();
      animRef.current = null;
      completeHandlerRef.current = null;
      setAnimationReady(false);
    };
  }, [assetsPath, jsonUrl, onUnavailable, renderer]);

  useEffect(() => {
    const anim = animRef.current;
    if (!anim) {
      return;
    }

    if (phase === 'idle') {
      // Универсально: первый кадр, чтобы не зависеть от маркеров/сегментов конкретной анимации
      anim.loop = false;
      anim.stop();
      anim.goToAndStop(0, true);
      return;
    }

    if (phase === 'opening') {
      anim.loop = false;
      const previousHandler = completeHandlerRef.current;
      if (previousHandler) {
        try {
          anim.removeEventListener('complete', previousHandler);
        } catch {
          // ignore
        }
      }

      const handleComplete = () => onOpened?.();
      completeHandlerRef.current = handleComplete;
      try {
        anim.addEventListener('complete', handleComplete);
      } catch {
        // ignore
      }
      // `playSegments` иногда обрывает проигрывание на сложных анимациях.
      // Для «3D Treasure Box» надёжнее проигрывать всю таймлинию через `play()`.
      anim.stop();
      anim.goToAndStop(0, true);
      anim.play();
      return () => {
        try {
          anim.removeEventListener('complete', handleComplete);
        } catch {
          // lottie-web can throw if instance is already destroyed
        }
      };
    }

    // opened
    anim.stop();
    anim.goToAndStop(Math.max(0, anim.totalFrames - 1), true);
  }, [animationReady, onOpened, phase]);

  if (loadError) {
    return null;
  }

  return <div ref={containerRef} className={className} aria-hidden />;
}
