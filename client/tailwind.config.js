/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Taskora brand palette (Oct 2026 redesign) -- sampled directly from
        // the official logo mark: indigo -> violet -> magenta ribbon, with a
        // near-black ink for the "Task" half of the wordmark. `primary` and
        // `accent` are the two ends of that gradient; every page that used
        // the old dusty-blue/peach tokens picks this up automatically.
        primary: {
          50: '#f4effe',
          100: '#e9ddfd',
          200: '#cdb5fa',
          300: '#ad88f5',
          400: '#8c5ef2',
          500: '#6d35ee',
          600: '#5b1fe0',
          700: '#4a18b4',
          800: '#3a148c',
          900: '#2c1068',
        },
        accent: {
          50: '#fef1fb',
          100: '#fde0f7',
          200: '#fabaef',
          300: '#f68de3',
          400: '#f163d4',
          500: '#ec45c4',
          600: '#d324a6',
          700: '#ab1a84',
          800: '#861668',
          900: '#611050',
        },
        navy: {
          900: '#120a24',
          800: '#1d1236',
          700: '#2a1b4c',
        },
        // ember/ink power the admin panel only -- aliased onto the same
        // palette above so the whole app (admin included) reads as one
        // brand instead of two.
        ember: {
          50: '#f4effe',
          100: '#e9ddfd',
          200: '#cdb5fa',
          300: '#ad88f5',
          400: '#8c5ef2',
          500: '#6d35ee',
          600: '#5b1fe0',
          700: '#4a18b4',
          800: '#3a148c',
          900: '#2c1068',
        },
        ink: {
          900: '#120a24',
          800: '#1d1236',
          700: '#2a1b4c',
        },
      },
      backgroundImage: {
        // The signature diagonal sweep from the logo -- used on the logo
        // mark itself, the splash intro, and any "hero" surface that wants
        // the full brand treatment in one shot.
        'brand-gradient': 'linear-gradient(135deg, #6d35ee 0%, #9333ea 50%, #ec45c4 100%)',
      },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 12px rgba(18, 10, 36, 0.08)',
        pop: '0 8px 30px rgba(18, 10, 36, 0.16)',
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
