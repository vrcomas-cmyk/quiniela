/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Bebas Neue"', 'Impact', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        // Paleta verde césped (50..900 completos)
        pitch: {
          50:  '#f0f9f1',
          100: '#dcf0de',
          200: '#bce0c1',
          300: '#8dc995',
          400: '#5aab66',
          500: '#16803c',
          600: '#0f6e32',
          700: '#0a5526',
          800: '#08431f',
          900: '#053018',
        },
        // Acento naranja fuego
        fire: {
          50:  '#fff7ed',
          100: '#ffedd5',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
        },
        // Neutros oscuros
        ink: {
          700: '#1f2722',
          800: '#141a16',
          900: '#0a0f0c',
        },
      },
      boxShadow: {
        'card': '0 4px 16px -4px rgba(0,0,0,0.15)',
        'glow': '0 0 24px rgba(249, 115, 22, 0.35)',
      },
    },
  },
  plugins: [],
};
