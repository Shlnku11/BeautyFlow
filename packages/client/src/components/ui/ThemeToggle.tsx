import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';

type Theme = 'light' | 'dark' | 'system';

function readTheme(): Theme {
  const saved = localStorage.getItem('beautyflow-theme');
  return saved === 'light' || saved === 'dark' ? saved : 'system';
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('theme-dark', theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches));
  document.documentElement.classList.toggle('theme-light', theme === 'light');
}

export function initializeTheme() {
  applyTheme(readTheme());
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  useEffect(() => {
    applyTheme(theme);
    if (theme === 'system') localStorage.removeItem('beautyflow-theme');
    else localStorage.setItem('beautyflow-theme', theme);
  }, [theme]);

  return <button aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'} className="clay-control grid size-10 place-items-center rounded-full bg-clay-raised text-primary-800" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} type="button">{theme === 'dark' ? <SunIcon aria-hidden="true" className="size-5"/> : <MoonIcon aria-hidden="true" className="size-5"/>}</button>;
}
