import type { ButtonHTMLAttributes, ReactNode } from 'react';
export function Button({ children, variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; variant?: 'primary' | 'secondary' | 'danger' }) {
  const styles = { primary: 'bg-gradient-to-br from-primary-600 to-primary-700 text-neutral-0', secondary: 'bg-clay-raised text-neutral-900', danger: 'bg-danger-solid text-neutral-0' };
  return <button {...props} className={`clay-control inline-flex min-h-10 items-center justify-center rounded-clay-control px-4 py-2 font-medium shadow-clay transition-[box-shadow,transform] duration-200 hover:shadow-clayHover active:shadow-clayPressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${props.className ?? ''}`}>{children}</button>;
}
