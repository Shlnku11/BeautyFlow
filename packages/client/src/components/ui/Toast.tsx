import type { ReactNode } from 'react';
export function Toast({ children, status = 'status' }: { children: ReactNode; status?: 'status' | 'alert' }) { return <div aria-live={status === 'alert' ? 'assertive' : 'polite'} className="rounded-clay-control border border-white/80 bg-clay-raised p-4 shadow-clay" role={status}>{children}</div>; }
