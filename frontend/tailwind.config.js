/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        space: {
          950: '#020409',
          900: '#040d1a',
          800: '#071428',
          700: '#0a1f3d',
          600: '#0f2d54',
        },
        cyan: {
          400: '#22d3ee',
          500: '#06b6d4',
        },
        amber: {
          400: '#fbbf24',
          500: '#f59e0b',
        },
      },
      fontFamily: {
        display: ['"Rajdhani"', 'sans-serif'],
        mono: ['"Share Tech Mono"', 'monospace'],
        body: ['"Exo 2"', 'sans-serif'],
      },
      backgroundImage: {
        'star-field': 'radial-gradient(ellipse at top, #071428 0%, #020409 100%)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'flicker': 'flicker 4s ease-in-out infinite',
        'scanline': 'scanline 2s linear infinite',
      },
      keyframes: {
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.85' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
      },
    },
  },
  plugins: [],
}
