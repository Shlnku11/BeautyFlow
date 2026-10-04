import type { HTMLAttributes, ReactNode } from 'react';
export function Card({ children, ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) { return <section {...props} className={`rounded-xl border border-neutral-200 bg-neutral-0 p-5 shadow-sm ${props.className ?? ''}`}>{children}</section>; }
