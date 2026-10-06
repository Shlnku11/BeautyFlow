import type { ReactNode } from 'react';

export function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-neutral-50">{children}</div>;
}
