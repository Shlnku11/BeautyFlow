import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';

function readDarkMode(): boolean {
  const saved = localStorage.getItem('beautyflow-theme');
  return saved === 'light' ? false : saved === 'dark' ? true : matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('theme-dark', dark);
  document.documentElement.classList.toggle('theme-light', !dark);
}

export function initializeTheme() {
  applyTheme(readDarkMode());
}

export function ThemeToggle() {
  const [dark, setDark] = useState(() => readDarkMode());
  useEffect(() => {
    applyTheme(dark);
  }, [dark]);

  return <button aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'} className="clay-control grid size-10 place-items-center rounded-full bg-clay-raised text-primary-800" onClick={() => { const nextDark = !dark; setDark(nextDark); localStorage.setItem('beautyflow-theme', nextDark ? 'dark' : 'light'); }} type="button">{dark ? <SunIcon aria-hidden="true" className="size-5"/> : <MoonIcon aria-hidden="true" className="size-5"/>}</button>;
}
