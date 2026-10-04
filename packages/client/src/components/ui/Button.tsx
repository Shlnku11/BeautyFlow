import type { ButtonHTMLAttributes, ReactNode } from 'react';
export function Button({ children, variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; variant?: 'primary' | 'secondary' | 'danger' }) {
  const styles = { primary: 'bg-primary-600 text-neutral-0 hover:bg-primary-700', secondary: 'border border-neutral-300 bg-neutral-0 text-neutral-900 hover:bg-neutral-100', danger: 'bg-danger-solid text-neutral-0' };
  return <button {...props} className={`inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 font-medium focus-visible:outline focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${props.className ?? ''}`}>{children}</button>;
}
