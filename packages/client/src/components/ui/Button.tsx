import type { ButtonHTMLAttributes, ReactNode } from 'react';
export function Button({ children, variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon' }) {
  const styles = { primary: 'border border-primary-600 bg-primary-600 text-white hover:bg-primary-700', secondary: 'border border-neutral-300 bg-neutral-0 text-neutral-900 hover:bg-neutral-100', danger: 'border border-danger-solid bg-danger-solid text-white hover:opacity-90', ghost: 'border border-transparent bg-transparent text-neutral-700 hover:bg-neutral-100', icon: 'w-9 border border-transparent bg-transparent px-0 text-neutral-700 hover:bg-neutral-100' };
  return <button {...props} className={`inline-flex h-9 min-h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${props.className ?? ''}`}>{children}</button>;
}
