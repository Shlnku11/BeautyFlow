import type { Config } from 'tailwindcss';
import { resolve } from 'node:path';

export default {
  content: [resolve(import.meta.dirname, 'index.html'), resolve(import.meta.dirname, 'src/**/*.{ts,tsx}'), resolve(import.meta.dirname, '../shared/src/**/*.{ts,tsx}')],
  theme: { extend: {
    colors: {
    primary: Object.fromEntries([50,100,200,300,400,500,600,700,800,900,950].map((shade) => [shade, `var(--color-primary-${shade})`])),
    neutral: Object.fromEntries([0,25,50,100,200,300,400,500,600,700,800,900].map((shade) => [shade, `var(--color-neutral-${shade})`])),
    success: { bg: 'var(--color-success-bg)', fg: 'var(--color-success-fg)', solid: 'var(--color-success-solid)' },
    warning: { bg: 'var(--color-warning-bg)', fg: 'var(--color-warning-fg)', solid: 'var(--color-warning-solid)' },
    danger: { bg: 'var(--color-danger-bg)', fg: 'var(--color-danger-fg)', solid: 'var(--color-danger-solid)' },
    info: { bg: 'var(--color-info-bg)', fg: 'var(--color-info-fg)', solid: 'var(--color-info-solid)' },
    clay: { DEFAULT: 'var(--surface-clay)', raised: 'var(--surface-clay-raised)', inset: 'var(--surface-clay-inset)' },
    },
    boxShadow: {
      clay: 'var(--shadow-clay-raised)',
      clayPressed: 'var(--shadow-clay-pressed)',
    },
    borderRadius: {
      'clay-card': 'var(--radius-clay-card)',
      'clay-control': 'var(--radius-clay-control)',
    },
  } },
  plugins: [],
} satisfies Config;
