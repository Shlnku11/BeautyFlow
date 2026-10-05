import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router';
import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { ru } from '@/shared/i18n/ru';
import { LoginSchema, RegisterBusinessSchema } from '@/shared/schemas';
import { BUSINESS_COUNTRY_CODES, BUSINESS_CURRENCIES } from '@/shared/constants';
import { apiRequest, ApiClientError } from '@/lib/api-client';
import { UiSandbox } from './UiSandbox';
import { PublicBooking, PublicManage } from './PublicBooking';
import { PaymentsPage } from './Payments';
import { DashboardPage, MyDayPage } from './Dashboard';
import { CustomerDetailPage, CustomersPage, ServicesPage, SettingsPage, StaffDetailPage, StaffPage } from './Operations';
import { AppointmentCreateDialog, AppointmentDetailDialog } from './CalendarActions';
import { useSession } from '@/hooks/use-session';
import { LandingPage } from './Landing';

interface CalendarPayload {
  range: { from: string; to: string; timezone: string };
  staff: { id: string; displayName: string; color: string }[];
  appointments: { id: string; staff: { id: string; displayName: string }; customer: { firstName: string; lastName?: string }; service: { name: string }; startAt: string; endAt: string; blockedUntilAt: string; status: string }[];
  blockedPeriods: { id: string; staffId: string; startAt: string; endAt: string; reason?: string }[];
  workingIntervals: { staffId: string; date: string; intervals: { start: string; end: string }[] }[];
  load: { staffId: string; bookedMinutes: number; availableMinutes: number; loadPercent: number | null }[];
}

function CalendarPage() {
  const session = useSession();
  const [date, setDate] = useState('');
  const [view, setView] = useState<'day' | 'week'>('day');
  const [staffId, setStaffId] = useState('');
  const [data, setData] = useState<CalendarPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [createSlot, setCreateSlot] = useState<{ date: string; startAt: string; staffId: string } | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<string | null>(null);
  const activeDate = date || (data ? DateTime.fromISO(data.range.from).setZone(data.range.timezone).toISODate() ?? '' : '');
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ view });
    if (date) params.set('date', date);
    if (staffId) params.set('staffId', staffId);
    setLoading(true);
    setError(null);
    void apiRequest<CalendarPayload>(`/api/calendar?${params}`, { signal: controller.signal }).then(setData).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof ApiClientError ? reason.message : ru.errors.INTERNAL);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, view, staffId, refresh]);
  function shiftDate(amount: number) {
    const current = DateTime.fromISO(activeDate || DateTime.now().toISODate() || '', { zone: data?.range.timezone });
    setDate(current.plus({ days: amount * (view === 'week' ? 7 : 1) }).toISODate() ?? '');
  }
  const canBook = session.data?.permissions.includes('appointments:create') ?? false;
  const isMaster = session.data?.active.role === 'master';
  return <main className="mx-auto w-full max-w-7xl p-4 md:p-6">
    <h1 className="text-2xl font-semibold">Календарь</h1>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <button className="rounded border px-3 py-2" onClick={() => setView('day')} aria-pressed={view === 'day'}>День</button><button className="rounded border px-3 py-2" onClick={() => setView('week')} aria-pressed={view === 'week'}>Неделя</button>
      <button className="rounded border px-3 py-2" onClick={() => shiftDate(-1)} aria-label="Предыдущий период">←</button><label className="grid gap-1 text-sm">Дата<input className="rounded border px-3 py-2" type="date" value={activeDate} onChange={(event) => setDate(event.target.value)} /></label><button className="rounded border px-3 py-2" onClick={() => setDate(DateTime.now().setZone(data?.range.timezone).toISODate() ?? '')}>Сегодня</button><button className="rounded border px-3 py-2" onClick={() => shiftDate(1)} aria-label="Следующий период">→</button>
      {!isMaster ? <label className="grid gap-1 text-sm">Сотрудник<select className="rounded border px-3 py-2" value={staffId} onChange={(event) => setStaffId(event.target.value)}><option value="">Все сотрудники</option>{data?.staff.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label> : null}
    </div>
    {loading ? <p className="mt-6" role="status">Загрузка календаря…</p> : null}{error ? <p className="mt-6 text-danger-fg" role="alert">{error}</p> : null}
    {data ? <>
      <section className="mt-6" aria-label="Загрузка сотрудников"><h2 className="font-semibold">Загрузка</h2><ul className="mt-2 flex flex-wrap gap-3">{data.load.map((item) => <li className="rounded-lg border px-3 py-2" key={item.staffId}>{data.staff.find((member) => member.id === item.staffId)?.displayName ?? 'Сотрудник'}: {item.loadPercent === null ? '—' : `${item.loadPercent}%`} ({item.bookedMinutes} / {item.availableMinutes} мин)</li>)}</ul></section>
      <section className="mt-6" aria-label="Сетка времени"><h2 className="font-semibold">Сетка времени · шаг 15 минут</h2><div className="mt-3 grid gap-4">{data.workingIntervals.filter((day) => !staffId || day.staffId === staffId).map((day) => { const member = data.staff.find((item) => item.id === day.staffId); return <section className="rounded-xl border bg-white p-3" key={`${day.staffId}-${day.date}`}><h3 className="mb-3 font-medium">{member?.displayName ?? 'Мастер'} · {day.date}</h3>{day.intervals.length ? day.intervals.map((interval) => { const start = new Date(interval.start).getTime(); const end = new Date(interval.end).getTime(); const slots: number[] = []; for (let cursor = start; cursor + 15 * 60_000 <= end; cursor += 15 * 60_000) slots.push(cursor); return <ol className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4" key={interval.start}>{slots.map((cursor) => { const until = cursor + 15 * 60_000; const appointment = data.appointments.find((item) => item.staff.id === day.staffId && new Date(item.startAt).getTime() >= cursor && new Date(item.startAt).getTime() < until); const occupied = data.appointments.some((item) => ['pending','confirmed','completed'].includes(item.status) && item.staff.id === day.staffId && new Date(item.startAt).getTime() < until && new Date(item.blockedUntilAt).getTime() > cursor); const blocked = data.blockedPeriods.some((item) => item.staffId === day.staffId && new Date(item.startAt).getTime() < until && new Date(item.endAt).getTime() > cursor); const label = new Intl.DateTimeFormat('ru-RU', { timeStyle: 'short', timeZone: data.range.timezone }).format(new Date(cursor)); return <li key={cursor}>{appointment ? <button className="w-full rounded-lg border border-primary-300 bg-primary-50 p-2 text-left text-sm" onClick={() => setSelectedAppointment(appointment.id)}><time dateTime={appointment.startAt}>{label}</time> · {appointment.customer.firstName} · {appointment.service.name}</button> : occupied || blocked ? <div className="rounded-lg border bg-neutral-100 p-2 text-sm text-neutral-500"><time>{label}</time> · {blocked ? 'Заблокировано' : 'Занято'}</div> : canBook ? <button className="w-full rounded-lg border border-dashed p-2 text-left text-sm text-neutral-600 hover:border-primary-500" onClick={() => setCreateSlot({ date: day.date, startAt: new Date(cursor).toISOString(), staffId: day.staffId })}><time>{label}</time> · Свободно</button> : <div className="rounded-lg border p-2 text-sm text-neutral-500"><time>{label}</time> · Свободно</div>}</li>; })}</ol>; }) : <p className="text-sm text-neutral-600">Нет рабочих интервалов.</p>}</section>; })}</div></section>
      <section className="mt-6" aria-label="Список записей календаря"><h2 className="font-semibold">Список записей</h2><ul className="mt-2 divide-y rounded-lg border">{data.appointments.map((item) => <li className="grid gap-1 p-3 sm:grid-cols-[10rem_1fr_12rem_auto]" key={item.id}><time dateTime={item.startAt}>{new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: data.range.timezone }).format(new Date(item.startAt))}</time><span>{item.customer.firstName} {item.customer.lastName ?? ''} · {item.service.name}</span><span>{item.staff.displayName} · {item.status}</span>{session.data?.permissions.includes('payments:create') && item.status !== 'cancelled' ? <Link className="text-primary-700 underline" to={`/app/payments?appointmentId=${encodeURIComponent(item.id)}`}>＋ Принять оплату</Link> : null}</li>)}</ul>{data.appointments.length === 0 ? <p className="mt-3 text-neutral-600">На этот период записей нет.</p> : null}</section>
      <section className="mt-6"><h2 className="font-semibold">Рабочее время</h2><ul className="mt-2 grid gap-2 sm:grid-cols-2">{data.workingIntervals.map((day) => <li className="rounded-lg border p-3" key={`${day.staffId}-${day.date}`}><strong>{data.staff.find((item) => item.id === day.staffId)?.displayName} · {day.date}</strong><p>{day.intervals.length ? day.intervals.map((range) => `${new Intl.DateTimeFormat('ru-RU', { timeStyle: 'short', timeZone: data.range.timezone }).format(new Date(range.start))}–${new Intl.DateTimeFormat('ru-RU', { timeStyle: 'short', timeZone: data.range.timezone }).format(new Date(range.end))}`).join(', ') : 'Нерабочее время'}</p></li>)}</ul>{data.blockedPeriods.map((block) => <p className="mt-2 rounded border border-amber-400 p-2" key={block.id}>Блокировка · {block.reason ?? 'без причины'} · {new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: data.range.timezone }).format(new Date(block.startAt))}</p>)}</section>
    </> : null}
    {createSlot && data ? <AppointmentCreateDialog date={createSlot.date} startAt={createSlot.startAt} timezone={data.range.timezone} staff={data.staff} preselectedStaffId={createSlot.staffId} onClose={() => setCreateSlot(null)} onCreated={() => setRefresh((value) => value + 1)}/> : null}
    {selectedAppointment && data ? <AppointmentDetailDialog id={selectedAppointment} timezone={data.range.timezone} role={session.data?.active.role ?? 'owner'} permissions={session.data?.permissions ?? []} onClose={() => setSelectedAppointment(null)} onChanged={() => setRefresh((value) => value + 1)}/> : null}
  </main>;
}

const links = [
  ['/app/dashboard', 'Обзор'], ['/app/calendar', 'Календарь'], ['/app/customers', 'Клиенты'],
  ['/app/staff', 'Сотрудники'], ['/app/services', 'Услуги'], ['/app/payments', 'Оплаты'],
  ['/app/settings', 'Настройки'], ['/app/my-day', 'Мой день'],
] as const;

function PageFrame({ title }: { title: string }) {
  return <main className="mx-auto w-full max-w-7xl p-6"><h1 className="text-2xl font-semibold">{title}</h1><p className="mt-3 text-neutral-600">Подключение данных выполняется через защищённый API.</p></main>;
}

function SessionLoading() {
  return <main className="grid min-h-screen place-items-center p-6"><p role="status" aria-live="polite">Проверяем сессию…</p></main>;
}

function SessionFailure({ retry }: { retry: () => void }) {
  return <main className="grid min-h-screen place-items-center p-6"><section role="alert" className="grid gap-3"><p>Не удалось проверить сессию.</p><button className="rounded-lg border px-4 py-2" onClick={retry}>Повторить</button></section></main>;
}

function AccessDenied() {
  return <main className="mx-auto max-w-5xl p-6"><h1 className="text-2xl font-semibold">Недостаточно прав</h1></main>;
}

function RootRedirect() {
  return <LandingPage/>;
}

function AppointmentDirectPage() {
  const { id = '' } = useParams();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void apiRequest<unknown>(`/api/appointments/${encodeURIComponent(id)}`).then(() => {
      if (active) setError('Не удалось открыть запись.');
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof ApiClientError ? reason.message : 'Не удалось открыть запись.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);
  return <main className="mx-auto max-w-5xl p-6"><h1 className="text-2xl font-semibold">Запись</h1>{loading ? <p role="status">Загрузка…</p> : null}{error ? <p role="alert">{error}</p> : null}</main>;
}

function AppShell() {
  const location = useLocation();
  const session = useSession();
  if (session.isLoading) return <SessionLoading/>;
  if (session.error instanceof ApiClientError && session.error.status === 401) return <Navigate to="/login" replace/>;
  if (!session.data) return <SessionFailure retry={() => { void session.refetch(); }}/>;
  const active = links.find(([path]) => location.pathname === path || location.pathname.startsWith(`${path}/`));
  const permissions = session.data.permissions;
  const requiredPermission: Record<string, string> = { '/app/dashboard': 'dashboard:read', '/app/calendar': 'calendar:read', '/app/customers': 'customers:read', '/app/staff': 'staff:read', '/app/services': 'services:read', '/app/payments': 'payments:read', '/app/settings': 'settings:business_read', '/app/my-day': 'dashboard:read_own' };
  const visibleLinks = links.filter(([path]) => permissions.includes(requiredPermission[path] ?? ''));
  const home = permissions.includes('dashboard:read') ? '/app/dashboard' : permissions.includes('dashboard:read_own') ? '/app/my-day' : undefined;
  const permissionFallback = home ? <Navigate to={home} replace/> : <AccessDenied/>;
  return <div className="min-h-screen md:grid md:grid-cols-[16rem_minmax(0,1fr)]"><a className="fixed left-3 top-3 z-50 -translate-y-20 rounded bg-neutral-0 px-4 py-3 text-primary-800 shadow focus:translate-y-0" href="#main-content">Перейти к основному содержимому</a><aside className="hidden border-r border-neutral-200 bg-neutral-0 p-5 md:block"><Link className="font-semibold text-primary-700" to="/">{ru.app.name}</Link><nav aria-label="Основная навигация" className="mt-8 grid gap-1">{visibleLinks.map(([to, label]) => <Link key={to} aria-current={location.pathname === to || location.pathname.startsWith(`${to}/`) ? 'page' : undefined} className="rounded-lg px-3 py-2 text-neutral-700 hover:bg-neutral-100 focus-visible:outline" to={to}>{label}</Link>)}</nav></aside><section id="main-content" tabIndex={-1} className="min-w-0 pb-20 md:pb-0"><header className="border-b border-neutral-200 bg-neutral-0 px-4 py-4 md:px-6" aria-label="Панель приложения">{active?.[1] ?? 'Приложение'}</header><Routes>{links.map(([path,label]) => <Route key={path} path={path.slice('/app/'.length)} element={path === '/app/calendar' ? <CalendarPage/> : path === '/app/payments' ? permissions.includes('payments:read') ? <PaymentsPage/> : permissionFallback : path === '/app/dashboard' ? permissions.includes('dashboard:read') ? <DashboardPage/> : permissions.includes('dashboard:read_own') ? <Navigate to="/app/my-day" replace/> : <AccessDenied/> : path === '/app/my-day' ? permissions.includes('dashboard:read_own') ? <MyDayPage/> : permissions.includes('dashboard:read') ? <Navigate to="/app/dashboard" replace/> : <AccessDenied/> : path === '/app/settings' ? permissions.includes('settings:business_read') ? <SettingsPage/> : permissionFallback : path === '/app/staff' ? <StaffPage/> : path === '/app/services' ? <ServicesPage/> : path === '/app/customers' ? <CustomersPage/> : <PageFrame title={label}/>} />)}<Route path="customers/:id" element={<CustomerDetailPage/>}/><Route path="staff/:id" element={<StaffDetailPage/>}/><Route path="appointments/:id" element={<AppointmentDirectPage/>}/><Route path="*" element={home ? <Navigate to={home} replace/> : <AccessDenied/>}/></Routes></section><nav aria-label="Мобильная навигация" className="fixed inset-x-0 bottom-0 z-40 flex gap-1 overflow-x-auto border-t border-neutral-200 bg-neutral-0 px-2 py-2 shadow-lg md:hidden">{visibleLinks.map(([to, label]) => <Link key={to} aria-current={location.pathname === to || location.pathname.startsWith(`${to}/`) ? 'page' : undefined} className="min-w-fit rounded-lg px-3 py-2 text-center text-sm text-neutral-700 hover:bg-neutral-100 focus-visible:outline" to={to}>{label}</Link>)}</nav></div>;
}

function AuthPage({ register = false }: { register?: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const title = register ? ru.auth.registerTitle : ru.auth.loginTitle;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const raw = Object.fromEntries(data.entries());
    const parsed = register ? RegisterBusinessSchema.safeParse({ ...raw, acceptTerms: data.has('acceptTerms'), website: '' }) : LoginSchema.safeParse(raw);
    if (!parsed.success) { setError(ru.errors.VALIDATION_ERROR); return; }
    try {
      await apiRequest(register ? '/api/auth/register-business' : '/api/auth/login', { method: 'POST', body: parsed.data, redirectOnUnauthorized: false });
      await queryClient.resetQueries({ queryKey: ['session'] });
      navigate('/app', { replace: true });
    } catch (reason: unknown) {
      setError(reason instanceof ApiClientError ? reason.message : ru.errors.INTERNAL);
    }
  }
  return <main className="mx-auto flex min-h-screen max-w-lg items-center p-6"><section className="w-full rounded-2xl border border-neutral-200 bg-neutral-0 p-8 shadow-sm"><p className="text-sm font-semibold text-primary-700">{ru.app.name}</p><h1 className="mt-3 text-2xl font-semibold">{title}</h1><form className="mt-6 grid gap-4" onSubmit={(event) => { void submit(event); }}>
    {register ? <>
      <label className="grid gap-1">{ru.auth.businessName}<input autoComplete="organization" className="rounded-lg border border-neutral-300 px-3 py-2" name="businessName" minLength={2} maxLength={120} required/></label>
      <label className="grid gap-1">{ru.auth.timezone}<input className="rounded-lg border border-neutral-300 px-3 py-2" defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone} name="timezone" required/></label>
      <label className="grid gap-1">{ru.auth.currency}<select className="rounded-lg border border-neutral-300 px-3 py-2" name="currency">{BUSINESS_CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
      <label className="grid gap-1">{ru.auth.countryCode}<select className="rounded-lg border border-neutral-300 px-3 py-2" name="countryCode" required><option value="">Выберите страну</option>{BUSINESS_COUNTRY_CODES.map((country) => <option key={country} value={country}>{country}</option>)}</select></label>
      <label className="grid gap-1">{ru.auth.ownerName}<input autoComplete="name" className="rounded-lg border border-neutral-300 px-3 py-2" name="ownerName" minLength={2} required/></label>
    </> : null}
    <label className="grid gap-1">{ru.auth.email}<input autoComplete="email" className="rounded-lg border border-neutral-300 px-3 py-2" name="email" type="email" required/></label>
    <label className="grid gap-1">{ru.auth.password}<input autoComplete={register ? 'new-password' : 'current-password'} className="rounded-lg border border-neutral-300 px-3 py-2" name="password" type="password" minLength={register ? 10 : 1} required/></label>
    {register ? <label className="flex items-start gap-2"><input className="mt-1" name="acceptTerms" type="checkbox" required/><span>{ru.auth.acceptTerms}</span></label> : null}
    {error ? <p className="text-danger-fg" role="alert">{error}</p> : null}
    <button className="rounded-lg bg-primary-600 px-4 py-2 font-medium text-neutral-0" type="submit">{register ? ru.auth.submitRegister : ru.auth.submitLogin}</button>
    <Link className="text-primary-700 underline" to={register ? '/login' : '/register'}>{register ? 'Уже есть аккаунт? Войти' : 'Создать бизнес'}</Link>
  </form></section></main>;
}

export function App() {
  return <Routes><Route path="/login" element={<AuthPage/>}/><Route path="/register" element={<AuthPage register/>}/><Route path="/b/:slug/manage/:token" element={<PublicManage/>}/><Route path="/b/:slug/*" element={<PublicBooking/>}/><Route path="/__dev/ui" element={<UiSandbox/>}/><Route path="/app/*" element={<AppShell/>}/><Route path="/" element={<RootRedirect/>}/></Routes>;
}
