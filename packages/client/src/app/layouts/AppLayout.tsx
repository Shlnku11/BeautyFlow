import { useEffect, useState, type ReactNode } from 'react';
import { Dialog as HeadlessDialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRightFromBracket, faBars, faBell, faCalendarDays, faChevronDown, faClipboardList, faGear, faGaugeHigh, faMagnifyingGlass, faPlus, faScissors, faUserTie, faUsers, faWallet, faXmark, type IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { Link, useNavigate } from 'react-router';
import { Dialog } from '@/components/ui/Dialog';
import { ru } from '@/shared/i18n/ru';

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
const mobilePriority = ['/app/dashboard', '/app/my-day', '/app/calendar', '/app/appointments', '/app/customers'];

export function AppLayout({ navItems, currentPath, title, brand, banner, children, userName, userEmail, userRole, canCreateAppointment, onLogout }: { navItems: readonly NavigationLink[]; currentPath: string; title: string; brand: string; banner?: ReactNode; children: ReactNode; userName: string; userEmail: string; userRole: string; canCreateAppointment: boolean; onLogout: () => void }) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const available = new Set(navItems.map(([path]) => path));
  const homePath = available.has('/app/dashboard') ? '/app/dashboard' : '/app/my-day';
  const profilePath = available.has('/app/settings') ? '/app/settings' : homePath;
  const groups = navigationGroups.map((group) => ({ ...group, links: group.links.filter(([path]) => available.has(path)) })).filter((group) => group.links.length);
  if (available.has('/app/my-day')) groups.unshift({ title: 'РАБОТА', links: [['/app/my-day', 'Мой день']] });
  const active = (path: string) => currentPath === path || currentPath.startsWith(`${path}/`);
  const initials = userName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase('ru-RU') ?? '').join('');
  const mobileItems = mobilePriority.flatMap((path) => navItems.filter(([itemPath]) => itemPath === path)).slice(0, 4);
  const commandItems = [
    ...navItems.map(([path, label]) => ({ path, label })),
    ...(canCreateAppointment ? [{ path: '/app/calendar?create=1', label: ru.navigation.newAppointment }] : []),
  ];
  const normalizedQuery = commandQuery.trim().toLocaleLowerCase('ru-RU');
  const filteredCommands = commandItems.filter(({ label }) => label.toLocaleLowerCase('ru-RU').includes(normalizedQuery));
  const openCommand = () => { setCommandQuery(''); setCommandOpen(true); };

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileOpen(false);
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase('en-US') === 'k') {
        event.preventDefault();
        openCommand();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const sidebar = <>
    <Link className={`flex h-9 items-center gap-2 overflow-hidden px-1 font-semibold text-neutral-900 ${collapsed ? 'justify-center' : ''}`} title={brand} to={homePath}>
      <span aria-hidden="true" className="app-brand-mark grid size-8 shrink-0 place-items-center rounded-md text-xs font-semibold">B</span>
      {!collapsed ? <span className="truncate text-sm">{brand}</span> : null}
    </Link>
    <nav aria-label={ru.navigation.primary} className="mt-5 grid gap-2">
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
          <p className="truncate px-2 py-1 text-xs text-neutral-500">{userEmail}</p>{available.has('/app/settings') ? <Link className="rounded px-2 py-1.5 text-sm hover:bg-neutral-50" to={profilePath}>{ru.navigation.profile}</Link> : null}
          <button className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50" onClick={onLogout}><FontAwesomeIcon className="size-3.5" icon={faArrowRightFromBracket}/>{ru.navigation.logout}</button>
        </div>
      </details>
    </div>
  </>;

  return <div className={`min-h-screen md:grid ${collapsed ? 'md:grid-cols-[3rem_minmax(0,1fr)]' : 'md:grid-cols-[15rem_minmax(0,1fr)]'}`}>
    <a className="skip-link" href="#main-content">Перейти к основному содержимому</a>
    <aside className={`app-sidebar sticky top-0 hidden h-screen min-h-0 flex-col overflow-y-auto border-r p-3 md:flex ${collapsed ? 'items-stretch' : ''}`}>{sidebar}</aside>
    {mobileOpen ? <HeadlessDialog open onClose={() => setMobileOpen(false)} className="relative z-50 md:hidden">
      <DialogBackdrop className="fixed inset-0 bg-neutral-900/40" aria-hidden="true"/>
      <div className="fixed inset-0 flex">
        <DialogPanel className="app-sidebar relative flex h-full w-[min(280px,85vw)] flex-col overflow-y-auto border-r p-3 shadow-lg">
          <button aria-label={ru.navigation.closeMenu} className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100" onClick={() => setMobileOpen(false)} type="button"><FontAwesomeIcon aria-hidden="true" className="size-4" icon={faXmark}/></button>
          <DialogTitle className="sr-only">{ru.navigation.mobile}</DialogTitle>{sidebar}
        </DialogPanel>
      </div>
    </HeadlessDialog> : null}
    <section id="main-content" tabIndex={-1} className="min-w-0 pb-20 md:pb-0">
      <header className="app-topbar sticky top-0 z-30 flex h-12 items-center justify-between gap-3 border-b px-3 sm:px-4" aria-label={ru.navigation.topbar}>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button className="grid size-8 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100 md:hidden" aria-label={ru.navigation.openMenu} onClick={() => { setCollapsed(false); setMobileOpen(true); }}><FontAwesomeIcon className="size-4" icon={faBars}/></button>
          <button className="hidden size-8 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100 md:grid" aria-label={collapsed ? ru.navigation.expandMenu : ru.navigation.collapseMenu} onClick={() => setCollapsed((value) => !value)}><FontAwesomeIcon className="size-4" icon={faBars}/></button>
          <div aria-label={ru.navigation.breadcrumbs} className="truncate text-[13px] text-neutral-600"><span className="hidden text-neutral-400 sm:inline">{brand} / </span><span>{title}</span></div>
        </div>
        <button aria-label={ru.navigation.openSearch} className="hidden h-8 w-full max-w-80 items-center gap-2 rounded-md border border-neutral-200 px-3 text-left text-xs text-neutral-400 hover:bg-neutral-50 md:flex" onClick={openCommand} type="button"><FontAwesomeIcon className="size-3.5" icon={faMagnifyingGlass}/><span className="flex-1">{ru.navigation.search}</span><kbd className="text-[10px]">⌘K</kbd></button>
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <button aria-label={ru.navigation.openSearch} className="grid size-8 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100 md:hidden" onClick={openCommand} type="button"><FontAwesomeIcon className="size-4" icon={faMagnifyingGlass}/></button>
          {canCreateAppointment ? <Link className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary-600 px-2.5 text-[13px] font-medium text-on-accent transition-colors hover:bg-primary-700 sm:px-3" to="/app/calendar?create=1"><FontAwesomeIcon className="size-3.5" icon={faPlus}/><span className="hidden sm:inline">{ru.navigation.newAppointment}</span></Link> : null}
          {available.has('/app/appointments') ? <Link aria-label={ru.navigation.openAppointments} title={ru.navigation.openAppointments} className="grid size-8 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100" to="/app/appointments"><FontAwesomeIcon className="size-4" icon={faBell}/></Link> : null}
          <details className="relative md:hidden"><summary aria-label={ru.navigation.profileMenu} className="grid size-8 cursor-pointer list-none place-items-center rounded-full bg-neutral-100 text-[10px] font-semibold">{initials}</summary><div className="absolute right-0 top-full z-50 mt-2 grid min-w-44 gap-1 rounded-lg border border-neutral-200 bg-neutral-0 p-2 shadow-sm"><span className="truncate px-2 text-xs text-neutral-500">{userEmail}</span>{available.has('/app/settings') ? <Link className="rounded px-2 py-1 text-sm hover:bg-neutral-50" to={profilePath}>{ru.navigation.profile}</Link> : null}<button className="rounded px-2 py-1 text-left text-sm hover:bg-neutral-50" onClick={onLogout}>{ru.navigation.logout}</button></div></details>
        </div>
      </header>
      {banner}{children}
    </section>
    {mobileItems.length ? <nav aria-label={ru.navigation.mobile} className="app-mobile-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-neutral-0 px-1 pt-1 md:hidden">
      {mobileItems.map(([path, label]) => <Link key={path} aria-current={active(path) ? 'page' : undefined} className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1 text-[10px] leading-tight ${active(path) ? 'font-semibold text-primary-700' : 'text-neutral-600'}`} to={path}>
        <FontAwesomeIcon aria-hidden="true" className="size-4" icon={iconByPath[path] ?? faClipboardList}/><span className="max-w-full truncate">{label}</span>
      </Link>)}
    </nav> : null}
    <Dialog open={commandOpen} onClose={() => setCommandOpen(false)} title={ru.navigation.quickSearchTitle}>
      <label className="grid gap-2 text-[13px] font-medium text-neutral-600"><span>{ru.navigation.quickSearchLabel}</span><input autoFocus className="h-10 rounded-md border border-neutral-200 bg-neutral-0 px-3 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600" onChange={(event) => setCommandQuery(event.target.value)} onKeyDown={(event) => {
        if (event.key === 'Enter' && filteredCommands[0]) {
          event.preventDefault();
          navigate(filteredCommands[0].path);
          setCommandOpen(false);
        }
      }} placeholder={ru.navigation.quickSearchPlaceholder} value={commandQuery}/></label>
      <ul className="mt-3 grid gap-1" aria-label={ru.navigation.quickSearchResults}>
        {filteredCommands.map(({ path, label }) => <li key={path}><Link className="flex min-h-10 items-center gap-2 rounded-md px-3 text-sm hover:bg-neutral-50 focus-visible:bg-neutral-50" onClick={() => setCommandOpen(false)} to={path}><FontAwesomeIcon aria-hidden="true" className="size-4 text-neutral-500" icon={iconByPath[path.split('?')[0] ?? path] ?? faPlus}/><span>{label}</span></Link></li>)}
      </ul>
      {filteredCommands.length === 0 ? <p className="py-5 text-center text-sm text-neutral-500">{ru.navigation.quickSearchNoResults}</p> : null}
    </Dialog>
  </div>;
}
