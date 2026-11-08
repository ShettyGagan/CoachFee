/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#00863F',
        brand: '#00A557',
        'brand-soft': '#E6F6EE',
        'page-bg': '#FAFAFA',
        'top-bar': '#1C1C1C',
        border: '#ECECEC',
        success: '#00863F',
        'success-soft': '#E6F6EE',
        warning: '#D97706',
        'warning-soft': '#FEF3C7',
        danger: '#DC2626',
        'danger-soft': '#FEE2E2',
        info: '#2563EB',
        'info-soft': '#DBEAFE',
        'muted': '#6B7280',
        'muted-foreground': '#9CA3AF',
        'neutral-chip': '#F4F4F4',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Noto Sans Devanagari', 'sans-serif'],
      },
      fontVariantNumeric: ['tabular-nums'],
      borderRadius: {
        xl: '12px',
        md: '6px',
        full: '9999px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        '2xs': '0 1px rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
}

