/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ember: {
          50: '#fff4ed',
          100: '#ffe4d4',
          200: '#ffc5a8',
          300: '#ff9d70',
          400: '#ff7238',
          500: '#f8531a',
          600: '#e8622c',
          700: '#c23f0f',
          800: '#9a3312',
          900: '#7c2c13',
        },
        ink: {
          900: '#1a1512',
          800: '#2a221d',
          700: '#3c322b',
        },
        // Added for the "Dusty Blue + Peach" redesign (customer + provider
        // pages only -- the admin panel keeps using ember/ink untouched, since
        // it never references these new tokens, so it is unaffected).
        primary: {
          50: '#eef2f6',
          100: '#dbe4ec',
          200: '#b7c9d9',
          300: '#93aec7',
          400: '#7897b5',
          500: '#5e7fa3',
          600: '#4c6a8c',
          700: '#3d5570',
          800: '#2f4257',
          900: '#24333f',
        },
        accent: {
          50: '#fef6f2',
          100: '#fce8de',
          200: '#f8d2c0',
          300: '#f2b8a0',
          400: '#ec9d80',
          500: '#e37f5c',
          600: '#c9643f',
          700: '#a44f32',
          800: '#7f3e28',
          900: '#603022',
        },
        navy: {
          900: '#1c2733',
          800: '#28374a',
          700: '#37485d',
        },
      },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 12px rgba(26, 21, 18, 0.08)',
        pop: '0 8px 30px rgba(26, 21, 18, 0.16)',
      },
      keyframes: {
        lockSnap: {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.25) rotate(-8deg)' },
          '70%': { transform: 'scale(0.95) rotate(4deg)' },
          '100%': { transform: 'scale(1) rotate(0)' },
        },
        popIn: {
          '0%': { opacity: 0, transform: 'translateY(6px) scale(0.98)' },
          '100%': { opacity: 1, transform: 'translateY(0) scale(1)' },
        },
        slideDown: {
          '0%': { opacity: 0, transform: 'translateY(-8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
      animation: {
        lockSnap: 'lockSnap 0.4s ease',
        popIn: 'popIn 0.25s ease-out',
        slideDown: 'slideDown 0.2s ease-out',
      },
    },
  },
  plugins: [],
};
