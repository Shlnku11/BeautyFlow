import type { ReactNode } from 'react';
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) { return <section className="rounded-xl border border-dashed border-neutral-300 p-8 text-center"><h2 className="font-semibold">{title}</h2>{children ? <div className="mt-2 text-neutral-600">{children}</div> : null}</section>; }
