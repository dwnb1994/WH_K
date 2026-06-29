import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-thai)', 'Noto Sans Thai', 'sans-serif'],
        mono: ['ui-monospace', 'Consolas', 'monospace'],
      },
      colors: {
        ink: '#1c1c22',
        muted: '#8a8a96',
        line: '#e6e6ea',
        surface: '#f6f6f8',
        brand: '#18181b',
        in: '#2f9e6b',
        out: '#d99a2b',
        danger: '#d6493b',
        link: '#2a7de1',
      },
    },
  },
  plugins: [],
}

export default config
