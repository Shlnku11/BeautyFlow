import type { HTMLAttributes, ReactNode } from 'react';
export function Card({ children, ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) { return <section {...props} className={`clay-card rounded-clay-card border border-white/80 bg-clay-raised p-5 shadow-clay ${props.className ?? ''}`}>{children}</section>; }
