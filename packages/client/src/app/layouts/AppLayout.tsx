import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog as HeadlessDialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRightFromBracket, faBars, faBell, faCalendarDays, faChevronDown, faClipboardList, faGear, faGaugeHigh, faMagnifyingGlass, faPlus, faScissors, faUserTie, faUsers, faWallet, faXmark, type IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { Link, useNavigate } from 'react-router';
import { DialogShell as Dialog } from '@/components/ui/dialog';
import { ru } from '@/shared/i18n/ru';
import { ApiClientError, apiRequest } from '@/lib/api-client';

type NavigationLink = readonly [string, string];
const navigationGroups: { title: string; links: NavigationLink[] }[] = [
  { title: 'РАБОТА', links: [['/app/dashboard', 'Обзор'], ['/app/calendar', 'Календарь'], ['/app/appointments', 'Записи']] },
  { title: 'БАЗА', links: [['/app/customers', 'Клиенты'], ['/app/staff', 'Сотрудники'], ['/app/services', 'Услуги']] },
  { title: 'ФИНАНСЫ', links: [['/app/payments', 'Оплаты']] },
  { title: 'АНАЛИТИКА', links: [['/app/reports', 'Отчёты'], ['/app/audit', 'История действий']] },
  { title: 'СИСТЕМА', links: [['/app/settings', 'Настройки']] },
];
const iconByPath: Record<string, IconDefinition> = {
  '/app/dashboard': faGaugeHigh, '/app/calendar': faCalendarDays, '/app/appointments': faClipboardList,
  '/app/customers': faUsers, '/app/staff': faUserTie, '/app/services': faScissors,
  '/app/payments': faWallet, '/app/settings': faGear, '/app/my-day': faCalendarDays, '/app/reports': faWallet, '/app/audit': faClipboardList,
};
const mobilePriority = ['/app/dashboard', '/app/my-day', '/app/calendar', '/app/appointments', '/app/customers'];

type ShiftGate = { active: boolean; loading: boolean; busy: boolean; error: string | null; onStart: () => void; onClose: () => void };
type SearchCustomer = { id: string; firstName: string; lastName?: string; phone?: string };
type InboxItem = { id: string; kind: string; title: string; body: string; route: string; createdAt: string; read: boolean };
type InboxEnvelope = { items: InboxItem[]; unreadCount: number };

function playInboxTone(volume: number) {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return;
  try {
    const context = new window.AudioContext();
    void context.resume().then(() => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(Math.max(0.01, Math.min(1, volume)) * 0.16, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
      oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.18);
      window.setTimeout(() => { void context.close(); }, 400);
    }).catch(() => { void context.close(); });
  } catch { /* Sound is optional; a blocked device keeps the inbox usable. */ }
}

export function AppLayout({ navItems, currentPath, title, brand, banner, children, userName, userEmail, userRole, canCreateAppointment, canAccount, canReadNotifications, shiftGate, onLogout }: { navItems: readonly NavigationLink[]; currentPath: string; title: string; brand: string; banner?: ReactNode; children: ReactNode; userName: string; userEmail: string; userRole: string; canCreateAppointment: boolean; canAccount: boolean; canReadNotifications: boolean; shiftGate?: ShiftGate | undefined; onLogout: () => void }) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [activityItems, setActivityItems] = useState<InboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [shiftCloseOpen, setShiftCloseOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [customerMatches, setCustomerMatches] = useState<SearchCustomer[]>([]);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const soundSettings = useRef({ enabled: false, volume: 0.45 });
  const seenInboxIds = useRef(new Set<string>());
  const hasLoadedInbox = useRef(false);
  const available = new Set(navItems.map(([path]) => path));
  const homePath = available.has('/app/dashboard') ? '/app/dashboard' : '/app/my-day';
  const profilePath = canAccount ? '/app/account' : homePath;
  const groups = navigationGroups.map((group) => ({ ...group, links: group.links.filter(([path]) => available.has(path)) })).filter((group) => group.links.length);
  if (available.has('/app/my-day')) {
    const workGroup = groups.find((group) => group.title === 'РАБОТА');
    if (workGroup) workGroup.links = [['/app/my-day', 'Мой день'], ...workGroup.links];
    else groups.unshift({ title: 'РАБОТА', links: [['/app/my-day', 'Мой день']] });
  }
  const active = (path: string) => currentPath === path || currentPath.startsWith(`${path}/`);
  const initials = userName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase('ru-RU') ?? '').join('');
  const mobileItems = mobilePriority.flatMap((path) => navItems.filter(([itemPath]) => itemPath === path)).slice(0, 4);
  const mobileColumns = ['grid-cols-none', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4'][mobileItems.length] ?? 'grid-cols-4';
  const commandItems = [
    ...navItems.map(([path, label]) => ({ path, label })),
    ...(canCreateAppointment ? [{ path: '/app/calendar?create=1', label: ru.navigation.newAppointment }] : []),
  ];
  const normalizedQuery = commandQuery.trim().toLocaleLowerCase('ru-RU');
  const filteredCommands = [
    ...commandItems.filter(({ label }) => label.toLocaleLowerCase('ru-RU').includes(normalizedQuery)),
    ...(available.has('/app/customers') ? customerMatches.map((customer) => ({ path: `/app/customers/${customer.id}`, label: `${customer.firstName} ${customer.lastName ?? ''}${customer.phone ? ` · ${customer.phone}` : ''}`.trim() })) : []),
  ];
  const openCommand = () => { setCommandQuery(''); setCommandOpen(true); };
  const shiftLocked = Boolean(shiftGate && (shiftGate.loading || !shiftGate.active));

  useEffect(() => {
    if (!canReadNotifications) return;
    const controller = new AbortController();
    const refresh = async (playSound: boolean) => {
      try {
        const result = await apiRequest<InboxEnvelope>('/api/notifications/inbox?limit=20', { signal: controller.signal });
        const unseen = result.items.filter((item) => !seenInboxIds.current.has(item.id));
        for (const item of result.items) seenInboxIds.current.add(item.id);
        setActivityItems(result.items);
        setUnreadCount(result.unreadCount);
        setActivityError(null);
        if (playSound && hasLoadedInbox.current && unseen.length && document.visibilityState === 'visible' && document.hasFocus() && soundSettings.current.enabled) playInboxTone(soundSettings.current.volume);
        hasLoadedInbox.current = true;
      } catch (reason: unknown) {
        if (!controller.signal.aborted && reason instanceof ApiClientError) setActivityError(reason.message);
      }
    };
    void apiRequest<{ preferences: { soundEnabled: boolean; soundVolume: number } }>('/api/notifications/preferences', { signal: controller.signal }).then((result) => {
      soundSettings.current = { enabled: result.preferences.soundEnabled, volume: result.preferences.soundVolume };
    }).catch(() => undefined);
    void refresh(false);
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(true); }, 15_000);
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') void refresh(false); };
    const onServiceWorkerMessage = (event: MessageEvent) => { if (event.data?.type === 'beautyflow:notification') void refresh(true); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage);
    };
  }, [canReadNotifications]);

  async function openNotifications() {
    setNotificationsOpen(true);
    setActivityLoading(true);
    setActivityError(null);
    try {
      const result = await apiRequest<InboxEnvelope>('/api/notifications/inbox?limit=20');
      for (const item of result.items) seenInboxIds.current.add(item.id);
      hasLoadedInbox.current = true;
      setActivityItems(result.items);
      const unreadIds = result.items.filter((item) => !item.read).map((item) => item.id);
      const read = unreadIds.length ? await apiRequest<{ updated: number }>('/api/notifications/inbox/read', { method: 'POST', body: { ids: unreadIds } }) : { updated: 0 };
      setActivityItems(result.items.map((item) => ({ ...item, read: true })));
      setUnreadCount(Math.max(0, result.unreadCount - read.updated));
    } catch (reason: unknown) {
      setActivityError(reason instanceof ApiClientError ? reason.message : 'Не удалось загрузить уведомления.');
    } finally {
      setActivityLoading(false);
    }
  }

  useEffect(() => {
    if (!available.has('/app/customers') || normalizedQuery.length < 2) { setCustomerMatches([]); setCustomerSearchLoading(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCustomerSearchLoading(true);
      void apiRequest<{ data: SearchCustomer[] }>(`/api/customers?q=${encodeURIComponent(commandQuery.trim())}&limit=5`, { signal: controller.signal })
        .then((result) => setCustomerMatches(result.data.slice(0, 5)))
        .catch((reason: unknown) => { if (!controller.signal.aborted && reason instanceof ApiClientError) setCustomerMatches([]); })
        .finally(() => { if (!controller.signal.aborted) setCustomerSearchLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [available.has('/app/customers'), commandQuery, normalizedQuery]);

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
          <p className="truncate px-2 py-1 text-xs text-neutral-500">{userEmail}</p>{canAccount ? <Link className="rounded px-2 py-1.5 text-sm hover:bg-neutral-50" to={profilePath}>{ru.navigation.profile}</Link> : null}
          <button className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50" onClick={onLogout}><FontAwesomeIcon className="size-3.5" icon={faArrowRightFromBracket}/>{ru.navigation.logout}</button>
        </div>
      </details>
    </div>
  </>;

  return <div className={`app-shell min-h-screen md:grid ${collapsed ? 'md:grid-cols-[4.25rem_minmax(0,1fr)]' : 'md:grid-cols-[17rem_minmax(0,1fr)]'}`}>
    <a className="skip-link" href="#main-content">Перейти к основному содержимому</a>
    <aside className={`app-sidebar sticky top-0 hidden h-screen min-h-0 flex-col overflow-y-auto border-r p-4 md:flex ${collapsed ? 'items-stretch' : ''}`}>{sidebar}</aside>
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
      <header className="app-topbar sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b px-3 sm:px-6" aria-label={ru.navigation.topbar}>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button className="grid size-8 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100 md:hidden" aria-label={ru.navigation.openMenu} onClick={() => { setCollapsed(false); setMobileOpen(true); }}><FontAwesomeIcon className="size-4" icon={faBars}/></button>
          <button className="hidden size-8 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100 md:grid" aria-label={collapsed ? ru.navigation.expandMenu : ru.navigation.collapseMenu} onClick={() => setCollapsed((value) => !value)}><FontAwesomeIcon className="size-4" icon={faBars}/></button>
          <div aria-label={ru.navigation.breadcrumbs} className="truncate text-sm font-semibold text-neutral-900"><span className="hidden font-normal text-neutral-400 sm:inline">{brand} / </span><span>{title}</span></div>
        </div>
        <button aria-label={ru.navigation.openSearch} className="hidden h-8 w-full max-w-80 items-center gap-2 rounded-md border border-neutral-200 px-3 text-left text-xs text-neutral-400 hover:bg-neutral-50 md:flex" onClick={openCommand} type="button"><FontAwesomeIcon className="size-3.5" icon={faMagnifyingGlass}/><span className="flex-1">{ru.navigation.search}</span><kbd className="text-[10px]">⌘K</kbd></button>
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <button aria-label={ru.navigation.openSearch} className="grid size-8 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100 md:hidden" onClick={openCommand} type="button"><FontAwesomeIcon className="size-4" icon={faMagnifyingGlass}/></button>
          {canCreateAppointment ? <Link aria-label={ru.navigation.newAppointment} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary-600 px-2.5 text-[13px] font-medium text-on-accent transition-colors hover:bg-primary-700 sm:px-3" to="/app/calendar?create=1"><FontAwesomeIcon aria-hidden="true" className="size-3.5" icon={faPlus}/><span className="hidden sm:inline">{ru.navigation.newAppointment}</span></Link> : null}
          {shiftGate?.active ? <button className="inline-flex h-8 items-center rounded-md border border-danger-fg/40 px-2 text-[11px] font-medium text-danger-fg hover:bg-danger-bg sm:px-3 sm:text-xs" disabled={shiftGate.busy} onClick={() => setShiftCloseOpen(true)} type="button">Завершить смену</button> : null}
          {canReadNotifications ? <button aria-label={unreadCount ? `Открыть уведомления, непрочитанных: ${unreadCount}` : 'Открыть уведомления'} aria-haspopup="dialog" aria-expanded={notificationsOpen} title="Уведомления" className="relative grid size-9 place-items-center rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900" onClick={() => { void openNotifications(); }} type="button"><FontAwesomeIcon className="size-4" icon={faBell}/>{unreadCount > 0 ? <span aria-hidden="true" className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-danger-fg px-1 text-[9px] font-semibold text-white">{unreadCount > 9 ? '9+' : unreadCount}</span> : null}</button> : null}
          <details className="relative md:hidden"><summary aria-label={ru.navigation.profileMenu} className="grid size-8 cursor-pointer list-none place-items-center rounded-full bg-neutral-100 text-[10px] font-semibold">{initials}</summary><div className="absolute right-0 top-full z-50 mt-2 grid min-w-44 gap-1 rounded-lg border border-neutral-200 bg-neutral-0 p-2 shadow-sm"><span className="truncate px-2 text-xs text-neutral-500">{userEmail}</span>{canAccount ? <Link className="rounded px-2 py-1 text-sm hover:bg-neutral-50" to={profilePath}>{ru.navigation.profile}</Link> : null}<button className="rounded px-2 py-1 text-left text-sm hover:bg-neutral-50" onClick={onLogout}>{ru.navigation.logout}</button></div></details>
        </div>
      </header>
      {banner}<div key={currentPath} aria-hidden={shiftLocked || undefined} className={`app-page-enter min-w-0 ${shiftLocked ? 'pointer-events-none select-none blur-sm' : ''}`} inert={shiftLocked || undefined}>{children}</div>
    </section>
    {mobileItems.length ? <nav aria-label={ru.navigation.mobile} className={`app-mobile-nav fixed inset-x-0 bottom-0 z-40 grid ${mobileColumns} border-t bg-neutral-0 px-1 pt-1 md:hidden`}>
      {mobileItems.map(([path, label]) => <Link key={path} aria-current={active(path) ? 'page' : undefined} className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1 text-[10px] leading-tight ${active(path) ? 'font-semibold text-primary-700' : 'text-neutral-600'}`} to={path}>
        <FontAwesomeIcon aria-hidden="true" className="size-4" icon={iconByPath[path] ?? faClipboardList}/><span className="max-w-full truncate">{label}</span>
      </Link>)}
    </nav> : null}
    {shiftLocked ? <div className="fixed inset-0 z-[100] grid place-items-center bg-neutral-950/35 p-5 backdrop-blur-sm"><section aria-labelledby="shift-required-title" aria-busy={shiftGate?.loading || shiftGate?.busy} className="w-full max-w-md rounded-xl border border-neutral-200 bg-neutral-0 p-6 shadow-lg"><p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Рабочее время</p><h2 id="shift-required-title" className="mt-2 text-xl font-semibold">{shiftGate?.loading ? 'Проверяем смену…' : 'Начните смену'}</h2><p className="mt-2 text-sm text-neutral-600">После начала смены откроются ваши записи, календарь и рабочие инструменты.</p>{shiftGate?.error ? <p className="mt-3 text-sm text-danger-fg" role="alert">{shiftGate.error}</p> : null}<button autoFocus className="mt-5 h-10 w-full rounded-md bg-primary-600 px-4 text-sm font-medium text-on-accent disabled:opacity-50" type="button" disabled={shiftGate?.loading || shiftGate?.busy} onClick={shiftGate?.onStart}>{shiftGate?.busy ? 'Открываем смену…' : 'Начать смену'}</button><p className="mt-3 text-xs text-neutral-500">Время начала будет сохранено в истории смен.</p></section></div> : null}
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
      {customerSearchLoading ? <p className="text-xs text-neutral-500" role="status">Ищем клиентов…</p> : null}
      {filteredCommands.length === 0 ? <p className="py-5 text-center text-sm text-neutral-500">{ru.navigation.quickSearchNoResults}</p> : null}
    </Dialog>
    <Dialog open={notificationsOpen} onClose={() => setNotificationsOpen(false)} title="Центр уведомлений">
      {activityError ? <p className="mb-3 text-sm text-danger-fg" role="alert">{activityError}</p> : null}
      {activityLoading && activityItems.length === 0 ? <p className="py-8 text-center text-sm text-neutral-500" role="status">Загружаем уведомления…</p> : activityItems.length ? <ol aria-label="Последние уведомления" className="max-h-[min(60vh,480px)] divide-y divide-neutral-100 overflow-y-auto">{activityItems.map((item) => {
        const routeAllowed = item.route.startsWith('/app/') && navItems.some(([path]) => item.route === path || item.route.startsWith(`${path}/`));
        const content = <><span className="block text-sm"><strong>{item.title}</strong></span><span className="mt-1 block text-xs text-neutral-600">{item.body}</span><time className="mt-1 block text-xs text-neutral-500" dateTime={item.createdAt}>{new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</time></>;
        return <li className={`py-3 ${item.read ? '' : 'border-l-2 border-primary-500 pl-2'}`} key={item.id}>{routeAllowed ? <Link className="block rounded px-2 py-1 hover:bg-neutral-50" to={item.route} onClick={() => setNotificationsOpen(false)}>{content}</Link> : <div className="px-2 py-1">{content}</div>}</li>;
      })}</ol> : !activityLoading ? <div className="notification-empty"><span className="notification-empty-icon"><FontAwesomeIcon icon={faBell}/></span><h3>Пока нет уведомлений</h3><p>Новые записи и события появятся здесь. История действий доступна отдельно.</p><div className="notification-links">{available.has('/app/appointments') ? <Link to="/app/appointments" onClick={() => setNotificationsOpen(false)}><FontAwesomeIcon icon={faClipboardList}/>Открыть записи</Link> : null}{available.has('/app/audit') ? <Link to="/app/audit" onClick={() => setNotificationsOpen(false)}><FontAwesomeIcon icon={faClipboardList}/>История действий</Link> : null}{available.has('/app/payments') ? <Link to="/app/payments" onClick={() => setNotificationsOpen(false)}><FontAwesomeIcon icon={faWallet}/>Открыть оплаты</Link> : null}</div></div> : null}
    </Dialog>
    <Dialog open={shiftCloseOpen} title="Завершить смену?" onClose={() => setShiftCloseOpen(false)}><p className="text-sm text-neutral-600">После завершения доступ к рабочим разделам закроется до начала следующей смены.</p><div className="flex justify-end gap-2 border-t border-neutral-200 pt-3"><button className="h-9 rounded-md border border-neutral-200 px-3 text-sm" type="button" onClick={() => setShiftCloseOpen(false)}>Продолжить работу</button><button className="h-9 rounded-md bg-danger-fg px-3 text-sm font-medium text-white disabled:opacity-50" type="button" disabled={shiftGate?.busy} onClick={() => { setShiftCloseOpen(false); shiftGate?.onClose(); }}>{shiftGate?.busy ? 'Закрываем…' : 'Завершить смену'}</button></div></Dialog>
  </div>;
}
