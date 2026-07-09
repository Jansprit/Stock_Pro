import type { Config } from 'tailwindcss';

const config: Config = {
  // 啟用 class 模式切換 dark：<html class="dark">
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // 金融主題色彩
        // light 模式用深色（列印友善），dark 模式用 OLED 對比佳的亮色
        bull: {
          50: '#ecfdf5',
          100: '#d1fae5',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',  // light 主要色（深綠，列印清晰）
          700: '#047857',
        },
        bear: {
          50: '#fef2f2',
          100: '#fee2e2',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',  // light 主要色（深紅，列印清晰）
          700: '#b91c1c',
        },
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',  // light 主要色（深藍，列印清晰）
        },
        // 主題色：light = paper white，dark = OLED 純黑（省電 + 護眼）
        surface: {
          // 頁面背景
          DEFAULT: '#f8fafc',  // light: paper-50
          raised: '#ffffff',    // light: card 背景
          sunken: '#f1f5f9',   // light: nested card
        },
        ink: {
          // 文字
          primary: '#0f172a',    // light: slate-900
          secondary: '#475569',  // light: slate-600
          tertiary: '#94a3b8',   // light: slate-400
          inverse: '#f1f5f9',    // dark 主要文字
        },
        border: {
          DEFAULT: '#e2e8f0',    // light: slate-200
          strong: '#cbd5e1',     // light: slate-300
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'bulb-flicker': 'bulbFlicker 0.6s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        bulbFlicker: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.7', transform: 'scale(0.92)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
