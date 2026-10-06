import type { ReactNode } from 'react';
export function Toast({ children, status = 'status' }: { children: ReactNode; status?: 'status' | 'alert' }) { return <div aria-live={status === 'alert' ? 'assertive' : 'polite'} className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-md" role={status}>{children}</div>; }
