import type { HTMLAttributes, ReactNode } from 'react';
export function Card({ children, ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) { return <section {...props} className={`rounded-lg border border-neutral-200 bg-neutral-0 p-5 shadow-sm transition-shadow hover:shadow-md ${props.className ?? ''}`}>{children}</section>; }
