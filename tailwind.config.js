/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './views/**/*.ejs',
    './public/js/**/*.js'
  ],
  darkMode: 'media',
  // Built from variables at runtime (method-${m}, credit-card--${kind}).
  safelist: [
    'method-get', 'method-post', 'method-put', 'method-delete',
    'credit-card--credit', 'credit-card--debit', 'credit-card--bank', 'credit-card--other'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9eaff',
          200: '#bcdaff',
          300: '#8ec3ff',
          400: '#59a2ff',
          500: '#3381fb',
          600: '#1a64f0',
          700: '#1550dc',
          800: '#1842b2',
          900: '#1a3c8c',
          950: '#142655'
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"PingFang TC"', '"Noto Sans TC"', '"Microsoft JhengHei"', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 16px -4px rgba(15, 23, 42, 0.08)',
        lift: '0 8px 30px -8px rgba(15, 23, 42, 0.25)'
      },
      animation: {
        'fade-in': 'fadeIn 0.18s ease-out',
        'sheet-up': 'sheetUp 0.26s cubic-bezier(0.2, 0.8, 0.2, 1)',
        'pop': 'pop 0.2s ease-out'
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        sheetUp: { '0%': { transform: 'translateY(24px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        pop: { '0%': { transform: 'scale(0.96)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } }
      }
    }
  },
  plugins: []
};
