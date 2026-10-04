import type { InputHTMLAttributes } from 'react';
export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={`min-h-10 w-full rounded-lg border border-neutral-300 bg-neutral-0 px-3 py-2 text-neutral-900 placeholder:text-neutral-500 focus-visible:outline focus-visible:outline-2 ${props.className ?? ''}`} />; }
