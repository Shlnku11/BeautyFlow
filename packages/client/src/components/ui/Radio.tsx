import type { InputHTMLAttributes } from 'react';
export function Radio(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} type="radio" className={`size-4 accent-primary-600 focus-visible:outline focus-visible:outline-2 ${props.className ?? ''}`} />; }
