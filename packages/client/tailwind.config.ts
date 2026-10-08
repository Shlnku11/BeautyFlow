import type { Config } from 'tailwindcss';
import { resolve } from 'node:path';

export default {
  content: [resolve(import.meta.dirname, 'index.html'), resolve(import.meta.dirname, 'src/**/*.{ts,tsx}'), resolve(import.meta.dirname, '../shared/src/**/*.{ts,tsx}')],
  safelist: [
    ...Array.from({ length: 52 }, (_, index) => `row-start-[${index + 1}]`),
    ...Array.from({ length: 52 }, (_, index) => `row-span-[${index + 1}]`),
  ],
  theme: { extend: {
    colors: {
    primary: {
      DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
      foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
      ...Object.fromEntries([50,100,200,300,400,500,600,700,800,900,950].map((shade) => [shade, `var(--color-primary-${shade})`])),
    },
    background: 'hsl(var(--background) / <alpha-value>)',
    foreground: 'hsl(var(--foreground) / <alpha-value>)',
    card: { DEFAULT: 'hsl(var(--card) / <alpha-value>)', foreground: 'hsl(var(--card-foreground) / <alpha-value>)' },
    popover: { DEFAULT: 'hsl(var(--popover) / <alpha-value>)', foreground: 'hsl(var(--popover-foreground) / <alpha-value>)' },
    secondary: { DEFAULT: 'hsl(var(--secondary) / <alpha-value>)', foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)' },
    muted: { DEFAULT: 'hsl(var(--muted) / <alpha-value>)', foreground: 'hsl(var(--muted-foreground) / <alpha-value>)' },
    accent: { DEFAULT: 'hsl(var(--accent) / <alpha-value>)', foreground: 'hsl(var(--accent-foreground) / <alpha-value>)' },
    destructive: { DEFAULT: 'hsl(var(--destructive) / <alpha-value>)', foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)' },
    border: 'hsl(var(--border) / <alpha-value>)',
    input: 'hsl(var(--input) / <alpha-value>)',
    ring: 'hsl(var(--ring) / <alpha-value>)',
    neutral: Object.fromEntries([0,25,50,100,200,300,400,500,600,700,800,900].map((shade) => [shade, `var(--color-neutral-${shade})`])),
    'on-accent': 'var(--text-on-accent)',
    'on-danger': 'var(--text-on-danger)',
    'master-badge': { DEFAULT: 'var(--master-badge-bg)', fg: 'var(--master-badge-fg)' },
    success: { bg: 'var(--color-success-bg)', fg: 'var(--color-success-fg)', solid: 'var(--color-success-solid)' },
    warning: { bg: 'var(--color-warning-bg)', fg: 'var(--color-warning-fg)', solid: 'var(--color-warning-solid)' },
    danger: { bg: 'var(--color-danger-bg)', fg: 'var(--color-danger-fg)', solid: 'var(--color-danger-solid)' },
    info: { bg: 'var(--color-info-bg)', fg: 'var(--color-info-fg)', solid: 'var(--color-info-solid)' },
    staff: Object.fromEntries(['violet','teal','blue','green','amber','rose','orange','slate'].map((name) => [name, `rgb(var(--staff-${name}) / <alpha-value>)`])),
    clay: { DEFAULT: 'var(--surface-clay)', raised: 'var(--surface-clay-raised)', inset: 'var(--surface-clay-inset)' },
    },
    boxShadow: {
      clay: 'var(--shadow-clay-raised)',
      clayPressed: 'var(--shadow-clay-pressed)',
      clayHover: 'var(--shadow-clay-hover)',
    },
    borderRadius: {
      DEFAULT: 'var(--radius-md)',
      sm: 'var(--radius-sm)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
      xl: 'var(--radius-xl)',
      '2xl': 'var(--radius-xl)',
      'clay-card': 'var(--radius-clay-card)',
      'clay-control': 'var(--radius-clay-control)',
      'clay-input': 'var(--radius-clay-input)',
    },
    gridRow: Object.fromEntries(Array.from({ length: 52 }, (_, index) => {
      const span = index + 1;
      return [`span-${span}`, `span ${span} / span ${span}`];
    })),
    gridRowStart: Object.fromEntries(Array.from({ length: 52 }, (_, index) => {
      const line = index + 1;
      return [String(line), String(line)];
    })),
  } },
  plugins: [],
} satisfies Config;
