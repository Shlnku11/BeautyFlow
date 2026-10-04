import type { SelectHTMLAttributes } from 'react';
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className={`min-h-10 w-full rounded-lg border border-neutral-300 bg-neutral-0 px-3 py-2 text-neutral-900 focus-visible:outline focus-visible:outline-2 ${props.className ?? ''}`} />; }
