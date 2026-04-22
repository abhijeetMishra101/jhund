import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        sidebar: {
          bg:      '#1A1D21',
          text:    '#C9D1D9',
          active:  '#FFFFFF',
          hover:   '#27292D',
          badge:   '#E01E5A',
          divider: '#2E3136',
        },
        canvas: {
          DEFAULT: '#FFFFFF',
          subtle:  '#F7F8FA',
        },
        border: {
          DEFAULT: '#E4E8EE',
          strong:  '#C1C9D2',
        },
        text: {
          primary:   '#111827',
          secondary: '#6B7280',
          muted:     '#9CA3AF',
          inverse:   '#FFFFFF',
        },
        primary: {
          DEFAULT: '#4F46E5',
          hover:   '#4338CA',
          subtle:  '#EEF2FF',
        },
        success: {
          DEFAULT: '#059669',
          subtle:  '#ECFDF5',
        },
        warning: {
          DEFAULT: '#D97706',
          subtle:  '#FFFBEB',
        },
        error: {
          DEFAULT: '#DC2626',
          subtle:  '#FEF2F2',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        '2xl': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'xl':  ['20px', { lineHeight: '28px', fontWeight: '600' }],
        'lg':  ['18px', { lineHeight: '26px', fontWeight: '600' }],
        'base': ['15px', { lineHeight: '22px', fontWeight: '400' }],
        'sm':  ['13px', { lineHeight: '20px', fontWeight: '400' }],
        'xs':  ['11px', { lineHeight: '16px', fontWeight: '500' }],
      },
      boxShadow: {
        sm:      '0 1px 2px rgba(0,0,0,0.06)',
        md:      '0 4px 12px rgba(0,0,0,0.10)',
        lg:      '0 8px 32px rgba(0,0,0,0.16)',
        overlay: '0 0 0 1px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.18)',
      },
      borderRadius: {
        sm:   '4px',
        md:   '6px',
        lg:   '8px',
        xl:   '12px',
        full: '9999px',
      },
    },
  },
  plugins: [],
}

export default config
