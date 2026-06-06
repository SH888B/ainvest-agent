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
        background: '#0f1117',
        surface: '#1a1d27',
        'surface-hover': '#232633',
        border: '#2a2e3b',
        primary: '#3b82f6',
        'primary-hover': '#2563eb',
        text: '#e2e8f0',
        'text-muted': '#94a3b8',
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
