'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    console.error('Admin Panel Error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{
      background: 'linear-gradient(135deg, #0a0a0a 0%, #1a0033 50%, #0a0a2e 100%)',
      backgroundAttachment: 'fixed'
    }}>
      <div className="text-center max-w-md">
        <h1 className="text-4xl font-black mb-4" style={{
          color: '#ff0055',
          textShadow: '0 0 20px rgba(255, 0, 85, 0.8)'
        }}>
          ⚠️ ОШИБКА
        </h1>
        <p className="mb-6" style={{ color: '#fff' }}>
          {error.message || 'Что-то пошло не так с админ-панелью'}
        </p>
        <button
          onClick={reset}
          className="px-6 py-3 font-bold uppercase"
          style={{
            background: 'linear-gradient(90deg, #00ff88, #00ccff)',
            color: '#000',
            boxShadow: '0 0 20px rgba(0, 255, 136, 0.8)',
            cursor: 'pointer'
          }}
        >
          Повторить попытку
        </button>
      </div>
    </div>
  );
}







