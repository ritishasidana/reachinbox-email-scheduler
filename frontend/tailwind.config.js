/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        logo: ['Silkscreen', 'monospace'],
      },
      colors: {
        brand: {
          DEFAULT: '#00A63E',
          dark: '#008A33',
          light: '#E6F4EA',
          border: '#7DD3A0',
        },
        field: '#F3F4F4',
        surface: '#F9F9F9',
        ink: {
          DEFAULT: '#1F2328',
          muted: '#6B7280',
          faint: '#9CA3AF',
        },
        line: '#EEEEEE',
        scheduled: { bg: '#FFE9D5', text: '#C2410C', border: '#FDBA8C' },
      },
      boxShadow: {
        popover: '0 4px 20px rgba(0,0,0,0.12)',
      },
    },
  },
  plugins: [],
};
