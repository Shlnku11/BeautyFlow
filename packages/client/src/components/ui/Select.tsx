import type { SelectHTMLAttributes } from 'react';
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className={`h-9 min-h-9 w-full rounded-md border border-neutral-300 bg-neutral-0 px-3 text-sm text-neutral-900 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/20 ${props.className ?? ''}`} />; }
