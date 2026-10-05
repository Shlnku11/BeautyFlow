import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { useEffect, useState, type FormEvent } from 'react';
import { ru } from '@/shared/i18n/ru';
import { LoginSchema, RegisterBusinessSchema } from '@/shared/schemas';
import { BUSINESS_COUNTRY_CODES, BUSINESS_CURRENCIES } from '@/shared/constants';
import { apiRequest, ApiClientError } from '@/lib/api-client';
import { UiSandbox } from './UiSandbox';
import { PublicBooking, PublicManage } from './PublicBooking';
import { PaymentsPage } from './Payments';
import { DashboardPage, MyDayPage } from './Dashboard';
import { useSession } from '@/hooks/use-session';

interface CalendarPayload {
  range: { from: string; to: string; timezone: string };
  staff: { id: string; displayName: string; color: string }[];
  appointments: { id: string; staff: { id: string; displayName: string }; customer: { firstName: string; lastName?: string }; service: { name: string }; startAt: string; endAt: string; status: string }[];
  blockedPeriods: { id: string; staffId: string; startAt: string; endAt: string; reason?: string }[];
  workingIntervals: { staffId: string; date: string; intervals: { start: string; end: string }[] }[];
  load: { staffId: string; bookedMinutes: number; availableMinutes: number; loadPercent: number | null }[];
}

function CalendarPage() {
  const session = useSession();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [view, setView] = useState<'day' | 'week'>('day');
  const [staffId, setStaffId] = useState('');
  const [data, setData] = useState<CalendarPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ date, view });
    if (staffId) params.set('staffId', staffId);
    setLoading(true);
    setError(null);
    void apiRequest<{ data: CalendarPayload }>(`/api/calendar?${params}`, { signal: controller.signal }).then((response) => setData(response.data)).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof ApiClientError ? reason.message : ru.errors.INTERNAL);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, view, staffId]);
  function shiftDate(amount: number) {
    const shifted = new Date(`${date}T12:00:00Z`);
    shifted.setUTCDate(shifted.getUTCDate() + amount * (view === 'week' ? 7 : 1));
    setDate(shifted.toISOString().slice(0, 10));
  }
  return <main className="mx-auto w-full max-w-7xl p-4 md:p-6">
    <h1 className="text-2xl font-semibold">Календарь</h1>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <button className="rounded border px-3 py-2" onClick={() => setView('day')} aria-pressed={view === 'day'}>День</button><button className="rounded border px-3 py-2" onClick={() => setView('week')} aria-pressed={view === 'week'}>Неделя</button>
      <button className="rounded border px-3 py-2" onClick={() => shiftDate(-1)} aria-label="Предыдущий период">←</button><label className="grid gap-1 text-sm">Дата<input className="rounded border px-3 py-2" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><button className="rounded border px-3 py-2" onClick={() => setDate(new Date().toISOString().slice(0, 10))}>Сегодня</button><button className="rounded border px-3 py-2" onClick={() => shiftDate(1)} aria-label="Следующий период">→</button>
      <label className="grid gap-1 text-sm">Сотрудник<select className="rounded border px-3 py-2" value={staffId} onChange={(event) => setStaffId(event.target.value)}><option value="">Все сотрудники</option>{data?.staff.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
    </div>
    {loading ? <p className="mt-6" role="status">Загрузка календаря…</p> : null}{error ? <p className="mt-6 text-danger-fg" role="alert">{error}</p> : null}
    {data ? <>
      <section className="mt-6" aria-label="Загрузка сотрудников"><h2 className="font-semibold">Загрузка</h2><ul className="mt-2 flex flex-wrap gap-3">{data.load.map((item) => <li className="rounded-lg border px-3 py-2" key={item.staffId}>{data.staff.find((member) => member.id === item.staffId)?.displayName ?? 'Сотрудник'}: {item.loadPercent === null ? '—' : `${item.loadPercent}%`} ({item.bookedMinutes} / {item.availableMinutes} мин)</li>)}</ul></section>
      <section className="mt-6" aria-label="Список записей календаря"><h2 className="font-semibold">Список записей</h2><ul className="mt-2 divide-y rounded-lg border">{data.appointments.map((item) => <li className="grid gap-1 p-3 sm:grid-cols-[10rem_1fr_12rem_auto]" key={item.id}><time dateTime={item.startAt}>{new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: data.range.timezone }).format(new Date(item.startAt))}</time><span>{item.customer.firstName} {item.customer.lastName ?? ''} · {item.service.name}</span><span>{item.staff.displayName} · {item.status}</span>{session.data?.permissions.includes('payments:create') && item.status !== 'cancelled' ? <Link className="text-primary-700 underline" to={`/app/payments?appointmentId=${encodeURIComponent(item.id)}`}>＋ Принять оплату</Link> : null}</li>)}</ul>{data.appointments.length === 0 ? <p className="mt-3 text-neutral-600">На этот период записей нет.</p> : null}</section>
      <section className="mt-6"><h2 className="font-semibold">Рабочее время</h2><ul className="mt-2 grid gap-2 sm:grid-cols-2">{data.workingIntervals.map((day) => <li className="rounded-lg border p-3" key={`${day.staffId}-${day.date}`}><strong>{data.staff.find((item) => item.id === day.staffId)?.displayName} · {day.date}</strong><p>{day.intervals.length ? day.intervals.map((range) => `${new Intl.DateTimeFormat('ru-RU', { timeStyle: 'short', timeZone: data.range.timezone }).format(new Date(range.start))}–${new Intl.DateTimeFormat('ru-RU', { timeStyle: 'short', timeZone: data.range.timezone }).format(new Date(range.end))}`).join(', ') : 'Нерабочее время'}</p></li>)}</ul>{data.blockedPeriods.map((block) => <p className="mt-2 rounded border border-amber-400 p-2" key={block.id}>Блокировка · {block.reason ?? 'без причины'} · {new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: data.range.timezone }).format(new Date(block.startAt))}</p>)}</section>
    </> : null}
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

function AppShell() {
  const location = useLocation();
  const session = useSession();
  const active = links.find(([path]) => location.pathname === path || location.pathname.startsWith(`${path}/`));
  const permissions = session.data?.permissions ?? [];
  const visibleLinks = links.filter(([path]) => path === '/app/payments' ? permissions.includes('payments:read') : path === '/app/dashboard' ? permissions.includes('dashboard:read') : path === '/app/my-day' ? permissions.includes('dashboard:read_own') : true);
  return <div className="min-h-screen md:grid md:grid-cols-[16rem_1fr]"><aside className="border-r border-neutral-200 bg-neutral-0 p-5"><Link className="font-semibold text-primary-700" to="/">{ru.app.name}</Link><nav aria-label="Основная навигация" className="mt-8 grid gap-1">{visibleLinks.map(([to, label]) => <Link key={to} className="rounded-lg px-3 py-2 text-neutral-700 hover:bg-neutral-100 focus-visible:outline" to={to}>{label}</Link>)}</nav></aside><section><header className="border-b border-neutral-200 bg-neutral-0 px-6 py-4" aria-label="Панель приложения">{active?.[1] ?? 'Приложение'}</header><Routes>{links.map(([path,label]) => <Route key={path} path={path.slice('/app/'.length)} element={path === '/app/calendar' ? <CalendarPage/> : path === '/app/payments' ? session.isLoading ? <p role="status">Загрузка прав доступа…</p> : permissions.includes('payments:read') ? <PaymentsPage/> : <Navigate to="calendar" replace/> : path === '/app/dashboard' ? session.isLoading ? <p role="status">Загрузка прав доступа…</p> : permissions.includes('dashboard:read') ? <DashboardPage/> : <Navigate to="my-day" replace/> : path === '/app/my-day' ? session.isLoading ? <p role="status">Загрузка прав доступа…</p> : permissions.includes('dashboard:read_own') ? <MyDayPage/> : <Navigate to="dashboard" replace/> : <PageFrame title={label}/>} />)}<Route path="customers/:id" element={<PageFrame title="Карточка клиента"/>}/><Route path="staff/:id" element={<PageFrame title="Сотрудник"/>}/><Route path="*" element={<Navigate to={permissions.includes('dashboard:read_own') ? 'my-day' : 'dashboard'} replace/>}/></Routes></section></div>;
}

function AuthPage({ register = false }: { register?: boolean }) {
  const navigate = useNavigate();
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
  return <Routes><Route path="/login" element={<AuthPage/>}/><Route path="/register" element={<AuthPage register/>}/><Route path="/b/:slug/manage/:token" element={<PublicManage/>}/><Route path="/b/:slug/*" element={<PublicBooking/>}/><Route path="/__dev/ui" element={<UiSandbox/>}/><Route path="/app/*" element={<AppShell/>}/><Route path="/" element={<Navigate to="/app/dashboard" replace/>}/></Routes>;
}
