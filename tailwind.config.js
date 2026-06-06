/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/renderer/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#030712',
        surface: {
          DEFAULT: '#111827',
          elevated: '#1a2236',
          hover: '#1e293b',
        },
        border: {
          DEFAULT: '#1e293b',
          subtle: '#172033',
        },
        primary: {
          DEFAULT: '#2563eb',
          hover: '#1d4ed8',
        },
        text: {
          DEFAULT: '#f1f5f9',
          secondary: '#94a3b8',
          muted: '#64748b',
        },
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#f43f5e',
        'panel-left': '#080d1a',
        'panel-center': '#0B1120',
        'panel-right': '#0e1526',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
