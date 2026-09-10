/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          dark: 'var(--bg-dark)',
          surface: 'var(--bg-surface)',
          card: 'var(--bg-card)',
          cardHover: 'var(--bg-card-hover)',
          border: 'var(--border)',
          borderLight: 'var(--border-light)',
          gold: 'var(--gold)',
          goldLight: 'var(--gold-light)',
          goldDim: 'var(--gold-dim)',
          sand: 'var(--text-sand)',
          olive: '#82846C',
          mocha: '#AE8966',
          amber: '#C28B4B',
          text: 'var(--text)',
          muted: 'var(--muted)',
          faint: 'var(--faint)',
        },
        noire: {
          ncb: '#AE8966',
          ndc: '#82846C',
          njfb: '#C28B4B',
          other: '#9E9B93',
        },
        status: {
          ok: '#22C55E',
          okBg: 'rgba(34, 197, 94, 0.12)',
          warning: '#F59E0B',
          warningBg: 'rgba(245, 158, 11, 0.12)',
          bad: '#EF4444',
          badBg: 'rgba(239, 68, 68, 0.12)',
          info: '#3B82F6',
          infoBg: 'rgba(59, 130, 246, 0.12)',
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Montserrat', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
        display: ['Outfit', 'Montserrat', 'sans-serif'],
      },
      boxShadow: {
        'glow-gold': '0 0 20px -5px rgba(197, 160, 89, 0.3)',
        'glow-sm': '0 0 10px -2px rgba(197, 160, 89, 0.2)',
        'card': '0 4px 20px -2px rgba(0, 0, 0, 0.5)',
      }
    },
  },
  plugins: [],
}
