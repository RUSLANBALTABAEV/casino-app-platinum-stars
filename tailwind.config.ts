import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}'
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    screens: {
      'xs': '400px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        night: '#0B0B0C',
        platinum: '#F4F4F5',
        gold: {
          400: '#D4AF37',
          500: '#CBA135'
        }
      },
      boxShadow: {
        glow: '0 0 12px rgba(212, 175, 55, 0.45)'
      },
      backgroundImage: {
        'gold-sheen':
          'radial-gradient(circle at top, rgba(212, 175, 55, 0.25), transparent 60%), radial-gradient(circle at bottom, rgba(203, 161, 53, 0.2), transparent 55%)'
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' }
        },
        'slide-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' }
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' }
        },
        'slide-in-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' }
        },
        // === §8 ТЗ: эффекты при выигрыше ===
        'win-shine': {
          '0%':   { textShadow: '0 0 8px rgba(212,175,55,0.6), 0 0 16px rgba(212,175,55,0.3)' },
          '50%':  { textShadow: '0 0 24px rgba(212,175,55,1), 0 0 48px rgba(212,175,55,0.7), 0 0 72px rgba(212,175,55,0.4)' },
          '100%': { textShadow: '0 0 8px rgba(212,175,55,0.6), 0 0 16px rgba(212,175,55,0.3)' }
        },
        'win-scale': {
          '0%':   { transform: 'scale(1)', opacity: '0' },
          '40%':  { transform: 'scale(1.18)', opacity: '1' },
          '70%':  { transform: 'scale(0.97)' },
          '100%': { transform: 'scale(1)' }
        },
        'particle-win': {
          '0%':   { opacity: '0', transform: 'scale(0.5) translateY(0px)' },
          '40%':  { opacity: '1', transform: 'scale(1.2) translateY(-28px)' },
          '100%': { opacity: '0', transform: 'scale(0.8) translateY(52px)' }
        },
        'win-glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 12px rgba(212,175,55,0.35)' },
          '50%':      { boxShadow: '0 0 32px rgba(212,175,55,0.85), 0 0 60px rgba(212,175,55,0.4)' }
        }
      },
      animation: {
        'fade-in': 'fade-in 220ms ease-out',
        'slide-up': 'slide-up 300ms ease-out',
        'slide-in-right': 'slide-in-right 300ms ease-out',
        'slide-in-left': 'slide-in-left 250ms ease-out',
        // === §8 ТЗ: win-эффекты ===
        'win-shine': 'win-shine 1.6s ease-in-out infinite',
        'win-scale': 'win-scale 0.55s cubic-bezier(0.34,1.56,0.64,1) both',
        'particle-win': 'particle-win 1.1s ease-out forwards',
        'win-glow-pulse': 'win-glow-pulse 1.8s ease-in-out infinite'
      }
    }
  },
  plugins: []
};

export default config;
