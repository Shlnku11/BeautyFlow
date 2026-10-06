import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';

type NavigationLink = readonly [string, string];

export function AppLayout({ navItems, currentPath, title, brand, banner, children }: { navItems: readonly NavigationLink[]; currentPath: string; title: string; brand: string; banner?: ReactNode; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  return <div className={`min-h-screen md:grid ${collapsed ? 'md:grid-cols-[3.5rem_minmax(0,1fr)]' : 'md:grid-cols-[15rem_minmax(0,1fr)]'}`}>
    <a className="skip-link" href="#main-content">Перейти к основному содержимому</a>
    <aside className={`app-sidebar hidden border-r border-neutral-200 p-2 md:block ${collapsed ? '' : 'md:p-4'}`}>
      <Link className={`block truncate font-semibold text-primary-700 ${collapsed ? 'px-2 py-1' : ''}`} title={brand} to="/">{collapsed ? 'B' : brand}</Link>
      <nav aria-label="Основная навигация" className="mt-6 grid gap-1">{navItems.map(([to, label]) => <Link key={to} title={label} aria-current={currentPath === to || currentPath.startsWith(`${to}/`) ? 'page' : undefined} className={`app-nav-link ${collapsed ? 'px-2 text-center' : ''} ${currentPath === to || currentPath.startsWith(`${to}/`) ? 'app-nav-active' : ''}`} to={to}>{collapsed ? label.slice(0, 1) : label}</Link>)}</nav>
    </aside>
    <section id="main-content" tabIndex={-1} className="min-w-0 pb-16 md:pb-0">
      <header className="app-topbar sticky top-0 z-30 flex h-14 items-center justify-between border-b border-neutral-200 px-4 md:px-6" aria-label="Панель приложения">
        <div className="flex items-center gap-3"><button className="hidden h-8 min-h-8 rounded-md border border-neutral-200 px-2 text-xs md:inline-flex md:items-center md:justify-center" aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'} onClick={() => setCollapsed((value) => !value)}>{collapsed ? 'Развернуть' : 'Свернуть'}</button><span className="text-sm font-medium">{title}</span></div>
      </header>
      {banner}
      {children}
    </section>
    <nav aria-label="Мобильная навигация" className="app-mobile-nav fixed inset-x-0 bottom-0 z-40 flex gap-1 overflow-x-auto border-t border-neutral-200 bg-neutral-0 px-2 py-2 md:hidden">{navItems.map(([to, label]) => <Link key={to} aria-current={currentPath === to || currentPath.startsWith(`${to}/`) ? 'page' : undefined} className="min-w-fit px-3 py-2 text-center text-sm text-neutral-700" to={to}>{label}</Link>)}</nav>
  </div>;
}
