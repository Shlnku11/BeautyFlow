import { useState, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRightFromBracket, faBars, faBell, faCalendarDays, faChevronDown, faClipboardList, faGear, faGaugeHigh, faMagnifyingGlass, faPlus, faScissors, faUserTie, faUsers, faWallet, type IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { Link } from 'react-router';

type NavigationLink = readonly [string, string];
const navigationGroups: { title: string; links: NavigationLink[] }[] = [
  { title: 'РАБОТА', links: [['/app/dashboard', 'Обзор'], ['/app/calendar', 'Календарь'], ['/app/appointments', 'Записи']] },
  { title: 'БАЗА', links: [['/app/customers', 'Клиенты'], ['/app/staff', 'Сотрудники'], ['/app/services', 'Услуги']] },
  { title: 'ФИНАНСЫ', links: [['/app/payments', 'Оплаты']] },
  { title: 'СИСТЕМА', links: [['/app/settings', 'Настройки']] },
];
const iconByPath: Record<string, IconDefinition> = {
  '/app/dashboard': faGaugeHigh, '/app/calendar': faCalendarDays, '/app/appointments': faClipboardList,
  '/app/customers': faUsers, '/app/staff': faUserTie, '/app/services': faScissors,
  '/app/payments': faWallet, '/app/settings': faGear, '/app/my-day': faCalendarDays,
};

export function AppLayout({ navItems, currentPath, title, brand, banner, children, userName, userEmail, userRole, onLogout }: { navItems: readonly NavigationLink[]; currentPath: string; title: string; brand: string; banner?: ReactNode; children: ReactNode; userName: string; userEmail: string; userRole: string; onLogout: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const available = new Set(navItems.map(([path]) => path));
  const homePath = available.has('/app/dashboard') ? '/app/dashboard' : '/app/my-day';
  const groups = navigationGroups.map((group) => ({ ...group, links: group.links.filter(([path]) => available.has(path)) })).filter((group) => group.links.length);
  if (available.has('/app/my-day')) groups.unshift({ title: 'РАБОТА', links: [['/app/my-day', 'Мой день']] });
  const active = (path: string) => currentPath === path || currentPath.startsWith(`${path}/`);
  const initials = userName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase('ru-RU') ?? '').join('');
  const sidebar = <>
    <Link className={`flex h-9 items-center gap-2 overflow-hidden px-1 font-semibold text-neutral-900 ${collapsed ? 'justify-center' : ''}`} title={brand} to={homePath}>
      <span aria-hidden="true" className="app-brand-mark grid size-8 shrink-0 place-items-center rounded-md text-xs font-semibold">B</span>
      {!collapsed ? <span className="truncate text-sm">{brand}</span> : null}
    </Link>
    <nav aria-label="Основная навигация" className="mt-5 grid gap-2">
      {groups.map((group) => <section className="grid gap-1" key={`${group.title}-${group.links[0]?.[0]}`}>
        {!collapsed ? <h2 className="mb-0.5 ml-2 mt-2 text-[11px] font-medium tracking-[0.08em] text-neutral-500">{group.title}</h2> : null}
        {group.links.map(([to, label]) => <Link key={to} title={label} aria-current={active(to) ? 'page' : undefined} className={`app-nav-link ${collapsed ? 'justify-center px-0' : ''} ${active(to) ? 'app-nav-active' : ''}`} to={to} onClick={() => setMobileOpen(false)}>
          <FontAwesomeIcon aria-hidden="true" className="size-4 shrink-0 text-neutral-500" icon={iconByPath[to] ?? faClipboardList}/>{!collapsed ? <span className="truncate">{label}</span> : null}
        </Link>)}
      </section>)}
    </nav>
    <div className="mt-auto border-t border-neutral-200 pt-3">
      <details className="group relative">
        <summary className={`flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-md px-1.5 py-1 hover:bg-neutral-50 ${collapsed ? 'justify-center' : ''}`}>
          <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-neutral-100 text-[10px] font-semibold text-neutral-700">{initials}</span>
          {!collapsed ? <span className="min-w-0 flex-1 text-left"><span className="block truncate text-xs font-medium text-neutral-900">{userName}</span><span className="block truncate text-[11px] text-neutral-500">{userRole}</span></span> : null}
          {!collapsed ? <FontAwesomeIcon aria-hidden="true" className="size-3 text-neutral-500" icon={faChevronDown}/> : null}
        </summary>
        <div className="absolute bottom-full left-0 z-50 mb-2 grid w-full min-w-48 gap-1 rounded-lg border border-neutral-200 bg-neutral-0 p-1 shadow-sm">
          <p className="truncate px-2 py-1 text-xs text-neutral-500">{userEmail}</p><Link className="rounded px-2 py-1.5 text-sm hover:bg-neutral-50" to="/app/settings">Профиль и настройки</Link>
          <button className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50" onClick={onLogout}><FontAwesomeIcon className="size-3.5" icon={faArrowRightFromBracket}/>Выйти</button>
        </div>
      </details>
    </div>
  </>;
  return <div className={`min-h-screen md:grid ${collapsed ? 'md:grid-cols-[3rem_minmax(0,1fr)]' : 'md:grid-cols-[15rem_minmax(0,1fr)]'}`}>
    <a className="skip-link" href="#main-content">Перейти к основному содержимому</a>
    <aside className={`app-sidebar sticky top-0 hidden h-screen min-h-0 flex-col overflow-y-auto border-r p-3 md:flex ${collapsed ? 'items-stretch' : ''}`}>{sidebar}</aside>
    {mobileOpen ? <div className="fixed inset-0 z-50 md:hidden"><button aria-label="Закрыть меню" className="absolute inset-0 size-full bg-black/40" onClick={() => setMobileOpen(false)}/><aside className="app-sidebar relative flex h-full w-[min(280px,85vw)] flex-col overflow-y-auto border-r p-3">{sidebar}</aside></div> : null}
    <section id="main-content" tabIndex={-1} className="min-w-0">
      <header className="app-topbar sticky top-0 z-30 flex h-12 items-center justify-between gap-3 border-b px-4" aria-label="Панель приложения">
        <div className="flex min-w-0 items-center gap-3">
          <button className="grid size-8 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100 md:hidden" aria-label="Открыть меню" onClick={() => { setCollapsed(false); setMobileOpen(true); }}><FontAwesomeIcon className="size-4" icon={faBars}/></button>
          <button className="hidden size-8 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100 md:grid" aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'} onClick={() => setCollapsed((value) => !value)}><FontAwesomeIcon className="size-4" icon={faBars}/></button>
          <div aria-label="Навигационная цепочка" className="truncate text-[13px] text-neutral-600"><span className="hidden text-neutral-400 sm:inline">{brand} / </span><span>{title}</span></div>
        </div>
        <button aria-label="Поиск" className="hidden h-8 w-full max-w-80 items-center gap-2 rounded-md border border-neutral-200 px-3 text-left text-xs text-neutral-400 hover:bg-neutral-50 md:flex"><FontAwesomeIcon className="size-3.5" icon={faMagnifyingGlass}/><span className="flex-1">Поиск…</span><kbd className="text-[10px]">⌘K</kbd></button>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary-600 px-3 text-[13px] font-medium text-on-accent transition-colors hover:bg-primary-700" to="/app/calendar?create=1"><FontAwesomeIcon className="size-3.5" icon={faPlus}/><span className="hidden sm:inline">Запись</span></Link>
          <div className="relative"><button aria-label="Уведомления" aria-expanded={notificationsOpen} className="grid size-8 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100" onClick={() => setNotificationsOpen((open) => !open)}><FontAwesomeIcon className="size-4" icon={faBell}/></button>{notificationsOpen ? <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm" role="status"><p className="text-sm font-medium text-neutral-900">Уведомления</p><p className="mt-1 text-xs text-neutral-500">Центр уведомлений скоро появится.</p><button className="mt-3 text-xs font-medium text-neutral-600 underline" onClick={() => setNotificationsOpen(false)}>Закрыть</button></div> : null}</div>
          <details className="relative md:hidden"><summary aria-label="Меню профиля" className="grid size-8 cursor-pointer list-none place-items-center rounded-full bg-neutral-100 text-[10px] font-semibold">{initials}</summary><div className="absolute right-0 top-full z-50 mt-2 grid min-w-44 gap-1 rounded-lg border border-neutral-200 bg-neutral-0 p-2 shadow-sm"><span className="truncate px-2 text-xs text-neutral-500">{userEmail}</span><Link className="rounded px-2 py-1 text-sm hover:bg-neutral-50" to="/app/settings">Настройки</Link><button className="rounded px-2 py-1 text-left text-sm hover:bg-neutral-50" onClick={onLogout}>Выйти</button></div></details>
        </div>
      </header>
      {banner}{children}
    </section>
  </div>;
}
