import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { ru } from '@/shared/i18n/ru';
import { apiRequest, ApiClientError } from '@/lib/api-client';
import { useSession } from '@/hooks/use-session';
import { canRoleOpenAppPath } from '@/app/navigation-access';
import { AuthLayout } from '@/app/layouts/AuthLayout';
import { PublicLayout } from '@/app/layouts/PublicLayout';

const links = [
  ['/app/dashboard', 'Обзор'], ['/app/calendar', 'Календарь'], ['/app/appointments', 'Записи'], ['/app/customers', 'Клиенты'],
  ['/app/staff', 'Сотрудники'], ['/app/services', 'Услуги'], ['/app/payments', 'Оплаты'],
  ['/app/inventory', 'Склад'], ['/app/waitlist', 'Лист ожидания'],
  ['/app/settings', 'Настройки'], ['/app/my-day', 'Мой день'], ['/app/reports', 'Отчёты'], ['/app/audit', 'История действий'],
] as const;

const AppLayout = lazy(() => import('@/app/layouts/AppLayout').then((module) => ({ default: module.AppLayout })));
const LandingPage = lazy(() => import('@/features/public-landing/Landing').then((module) => ({ default: module.LandingPage })));
const UiSandbox = lazy(() => import('@/features/dev/UiSandbox').then((module) => ({ default: module.UiSandbox })));
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage').then((module) => ({ default: module.CalendarPage })));
const AuthPage = lazy(() => import('@/features/auth/AuthPage').then((module) => ({ default: module.AuthPage })));
const PublicBooking = lazy(() => import('@/features/public-booking/PublicBooking').then((module) => ({ default: module.PublicBooking })));
const PublicManage = lazy(() => import('@/features/public-booking/PublicBooking').then((module) => ({ default: module.PublicManage })));
const PaymentsPage = lazy(() => import('@/features/payments/Payments').then((module) => ({ default: module.PaymentsPage })));
const DashboardPage = lazy(() => import('@/features/dashboard/Dashboard').then((module) => ({ default: module.DashboardPage })));
const MyDayPage = lazy(() => import('@/features/dashboard/Dashboard').then((module) => ({ default: module.MyDayPage })));
const CustomerDetailPage = lazy(() => import('@/features/customers/Customers').then((module) => ({ default: module.CustomerDetailPage })));
const CustomersPage = lazy(() => import('@/features/customers/Customers').then((module) => ({ default: module.CustomersPage })));
const ServicesPage = lazy(() => import('@/features/services/Services').then((module) => ({ default: module.ServicesPage })));
const SettingsPage = lazy(() => import('@/features/settings/Settings').then((module) => ({ default: module.SettingsPage })));
const StaffDetailPage = lazy(() => import('@/features/staff/Staff').then((module) => ({ default: module.StaffDetailPage })));
const StaffPage = lazy(() => import('@/features/staff/Staff').then((module) => ({ default: module.StaffPage })));
const AppointmentsPage = lazy(() => import('@/features/appointments/Appointments').then((module) => ({ default: module.AppointmentsPage })));
const AccountPage = lazy(() => import('@/features/account/Account').then((module) => ({ default: module.AccountPage })));
const ReportsPage = lazy(() => import('@/features/reports/Reports').then((module) => ({ default: module.ReportsPage })));
const AuditPage = lazy(() => import('@/features/audit/Audit').then((module) => ({ default: module.AuditPage })));
const InventoryPage = lazy(() => import('@/features/inventory/Inventory').then((module) => ({ default: module.InventoryPage })));
const WaitlistPage = lazy(() => import('@/features/waitlist/Waitlist').then((module) => ({ default: module.WaitlistPage })));

function PageFrame({ title }: { title: string }) {
  return <main className="mx-auto w-full max-w-7xl p-6"><h1 className="text-2xl font-semibold">{title}</h1><p className="mt-3 text-neutral-600">Подключение данных выполняется через защищённый API.</p></main>;
}

function SessionLoading() {
  return <main className="grid min-h-screen place-items-center p-6"><p role="status" aria-live="polite">Проверяем сессию…</p></main>;
}

function RouteLoading() {
  return <main className="mx-auto w-full max-w-7xl p-6"><p className="text-sm text-neutral-500" role="status" aria-live="polite">Загружаем раздел…</p></main>;
}

function SessionFailure({ retry }: { retry: () => void }) {
  return <main className="grid min-h-screen place-items-center p-6"><section role="alert" className="grid gap-3"><p>Не удалось проверить сессию.</p><button className="rounded-lg border px-4 py-2" onClick={retry}>Повторить</button></section></main>;
}

function AccessDenied() {
  return <main className="mx-auto max-w-5xl p-6"><h1 className="text-2xl font-semibold">Недостаточно прав</h1></main>;
}

function RootRedirect() {
  return <Suspense fallback={<main className="grid min-h-[60svh] place-items-center p-6"><p className="text-sm text-neutral-500" role="status">Загружаем страницу…</p></main>}><LandingPage/></Suspense>;
}

function AppointmentDirectPage() {
  const { id = '' } = useParams();
  const [appointment, setAppointment] = useState<{ id: string; customer: { firstName: string; lastName?: string }; staff: { displayName: string }; service: { name: string }; startAt: string; endAt: string; status: string; serviceSnapshot?: { priceMinor?: number; currency?: string } } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void apiRequest<typeof appointment>(`/api/appointments/${encodeURIComponent(id)}`).then((result) => {
      if (active && result) setAppointment(result);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof ApiClientError ? reason.message : 'Не удалось открыть запись.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);
  return <main className="mx-auto max-w-5xl p-6"><h1 className="text-2xl font-semibold">Запись</h1>{loading ? <p role="status">Загрузка…</p> : null}{error ? <p role="alert">{error}</p> : appointment ? <section className="mt-4 grid gap-3 rounded-lg border border-neutral-200 bg-neutral-0 p-5"><h2 className="text-lg font-semibold">{appointment.service.name}</h2><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-sm text-neutral-500">Клиент</dt><dd>{appointment.customer.firstName} {appointment.customer.lastName ?? ''}</dd></div><div><dt className="text-sm text-neutral-500">Специалист</dt><dd>{appointment.staff.displayName}</dd></div><div><dt className="text-sm text-neutral-500">Начало</dt><dd>{new Date(appointment.startAt).toLocaleString('ru-RU')}</dd></div><div><dt className="text-sm text-neutral-500">Статус</dt><dd>{appointment.status}</dd></div>{typeof appointment.serviceSnapshot?.priceMinor === 'number' ? <div><dt className="text-sm text-neutral-500">Стоимость</dt><dd>{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: appointment.serviceSnapshot.currency ?? 'KGS' }).format(appointment.serviceSnapshot.priceMinor / 100)}</dd></div> : null}</dl></section> : null}</main>;
}

class PageErrorBoundary extends Component<{ children: ReactNode; home: string }, { hasError: boolean }> {
  override state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return <main className="mx-auto w-full max-w-3xl px-5 py-10" role="alert"><h1 className="text-xl font-semibold">Не удалось открыть раздел</h1><p className="mt-2 text-sm text-neutral-600">Ошибка страницы не закрыла весь кабинет. Вернитесь к рабочему экрану и попробуйте ещё раз.</p><Link className="mt-4 inline-flex h-9 items-center rounded-md bg-primary-600 px-3 text-sm font-medium text-on-accent" to={this.props.home}>Вернуться в кабинет</Link></main>;
    }
    return this.props.children;
  }
}

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useSession();
  const isMaster = session.data?.active.role === 'master';
  const [currentShift, setCurrentShift] = useState<{ id: string; startedAt: string } | null>(null);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftBusy, setShiftBusy] = useState(false);
  const [shiftError, setShiftError] = useState<string | null>(null);
  useEffect(() => {
    if (!isMaster) { setCurrentShift(null); return; }
    const controller = new AbortController();
    setShiftLoading(true);
    void apiRequest<{ id: string; startedAt: string } | null>('/api/shifts/current', { signal: controller.signal }).then(setCurrentShift).catch((reason: unknown) => { if (!controller.signal.aborted) setShiftError(reason instanceof ApiClientError ? reason.message : 'Не удалось проверить смену. Повторите попытку.'); }).finally(() => { if (!controller.signal.aborted) setShiftLoading(false); });
    return () => controller.abort();
  }, [isMaster]);
  async function setShift(open: boolean) {
    setShiftBusy(true); setShiftError(null);
    try {
      const value = await apiRequest<{ id: string; startedAt: string } | null>(open ? '/api/shifts/start' : '/api/shifts/end', { method: 'POST', body: {} });
      setCurrentShift(open ? value as { id: string; startedAt: string } : null);
      if (!open) navigate('/', { replace: true });
    }
    catch (reason: unknown) {
      if (open && reason instanceof ApiClientError && reason.code === 'SHIFT_ALREADY_OPEN') {
        try {
          setCurrentShift(await apiRequest<{ id: string; startedAt: string } | null>('/api/shifts/current'));
          setShiftError(null);
          return;
        } catch (refreshReason: unknown) {
          setShiftError(refreshReason instanceof ApiClientError ? refreshReason.message : 'Не удалось проверить открытую смену. Обновите страницу.');
          return;
        }
      }
      setShiftError(reason instanceof ApiClientError ? reason.message : 'Не удалось изменить смену. Повторите попытку.');
    }
    finally { setShiftBusy(false); }
  }
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  async function resendVerification() {
    if (!session.data?.user.email) return;
    setVerificationError(null);
    try {
      await apiRequest('/api/auth/resend-verification', { method: 'POST', body: { email: session.data.user.email }, redirectOnUnauthorized: false });
      setVerificationNotice(ru.auth.resendVerificationSent);
    } catch (reason: unknown) {
      setVerificationError(reason instanceof ApiClientError ? reason.message : ru.errors.INTERNAL);
    }
  }
  async function logout() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST', redirectOnUnauthorized: false });
    } catch (reason: unknown) {
      if (!(reason instanceof ApiClientError && reason.status === 401)) {
        setVerificationError(reason instanceof ApiClientError ? reason.message : 'Не удалось выйти. Повторите попытку.');
        return;
      }
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    navigate('/', { replace: true });
  }
  if (session.isLoading && !session.data) return <SessionLoading/>;
  if (session.error instanceof ApiClientError && session.error.status === 401) return <Navigate to="/login" replace/>;
  if (!session.data) return <SessionFailure retry={() => { void session.refetch(); }}/>;
  const active = links.find(([path]) => location.pathname === path || location.pathname.startsWith(`${path}/`));
  const permissions = session.data.permissions;
  const canOpenPath = (path: string) => canRoleOpenAppPath(session.data.active.role, path, permissions);
  const visibleLinks = links.filter(([path]) => canOpenPath(path));
  const home = permissions.includes('dashboard:read') ? '/app/dashboard' : permissions.includes('dashboard:read_own') ? '/app/my-day' : undefined;
  const permissionFallback = home ? <Navigate to={home} replace/> : <AccessDenied/>;
  const pageRoutes = <Routes>{links.map(([path, label]) => {
    const page = path === '/app/calendar' ? <CalendarPage/> : path === '/app/appointments' ? <AppointmentsPage/> : path === '/app/payments' ? <PaymentsPage/> : path === '/app/dashboard' ? permissions.includes('dashboard:read') ? <DashboardPage/> : permissions.includes('dashboard:read_own') ? <Navigate to="/app/my-day" replace/> : <AccessDenied/> : path === '/app/my-day' ? permissions.includes('dashboard:read_own') ? <MyDayPage/> : permissions.includes('dashboard:read') ? <Navigate to="/app/dashboard" replace/> : <AccessDenied/> : path === '/app/settings' ? <SettingsPage/> : path === '/app/staff' ? <StaffPage/> : path === '/app/services' ? <ServicesPage/> : path === '/app/customers' ? <CustomersPage/> : path === '/app/reports' ? <ReportsPage/> : path === '/app/audit' ? <AuditPage/> : path === '/app/inventory' ? <InventoryPage/> : path === '/app/waitlist' ? <WaitlistPage/> : <PageFrame title={label}/>;
    return <Route key={path} path={path.slice('/app/'.length)} element={canOpenPath(path) ? page : permissionFallback}/>;
  })}<Route path="account" element={permissions.includes('account:self') ? <AccountPage/> : permissionFallback}/><Route path="customers/:id" element={!isMaster && permissions.includes('customers:read') ? <CustomerDetailPage/> : permissionFallback}/><Route path="staff/:id" element={!isMaster && permissions.includes('staff:read') ? <StaffDetailPage/> : permissionFallback}/><Route path="appointments/:id" element={<AppointmentDirectPage/>}/><Route path="*" element={home ? <Navigate to={home} replace/> : <AccessDenied/>}/></Routes>;
  const verificationBanner = !session.data.user.emailVerified ? <div className="border-b border-warning-solid/30 bg-warning-bg px-4 py-3 text-sm text-warning-fg md:px-6" role="status"><div className="flex flex-wrap items-center gap-3"><span>{ru.auth.emailVerificationBanner}, {session.data.user.name}.</span><button className="font-medium" onClick={() => { void resendVerification(); }}>{ru.auth.resendVerification}</button>{verificationNotice ? <span aria-live="polite">{verificationNotice}</span> : null}{verificationError ? <span role="alert">{verificationError}</span> : null}</div></div> : null;
  return <AppLayout navItems={visibleLinks} currentPath={location.pathname} title={active?.[1] ?? (location.pathname === '/app/account' ? 'Мой аккаунт' : 'Приложение')} brand={ru.app.name} banner={verificationBanner} userName={session.data.user.name} userEmail={session.data.user.email} userRole={session.data.active.role === 'master' ? 'Мастер' : session.data.active.role === 'admin' ? 'Менеджер' : 'Владелец'} canCreateAppointment={permissions.includes('appointments:create')} canAccount={permissions.includes('account:self')} canReadNotifications={permissions.includes('notifications:read')} shiftGate={isMaster ? { active: Boolean(currentShift), loading: shiftLoading, busy: shiftBusy, error: shiftError, onStart: () => { void setShift(true); }, onClose: () => { void setShift(false); } } : undefined} onLogout={() => { void logout(); }}><PageErrorBoundary key={location.pathname} home={home ?? '/login'}><Suspense fallback={<RouteLoading/>}>{pageRoutes}</Suspense></PageErrorBoundary></AppLayout>;
}

export function App() {
  return <Suspense fallback={<RouteLoading/>}><Routes><Route path="/login" element={<AuthLayout><AuthPage/></AuthLayout>}/><Route path="/register" element={<AuthLayout><AuthPage register/></AuthLayout>}/><Route path="/verify-email" element={<AuthLayout><AuthPage mode="verify"/></AuthLayout>}/><Route path="/forgot-password" element={<AuthLayout><AuthPage mode="forgot"/></AuthLayout>}/><Route path="/reset-password" element={<AuthLayout><AuthPage mode="reset"/></AuthLayout>}/><Route path="/accept-invite" element={<AuthLayout><AuthPage mode="accept-invite"/></AuthLayout>}/><Route path="/b/:slug/manage/:token" element={<PublicLayout><PublicManage/></PublicLayout>}/><Route path="/b/:slug/*" element={<PublicLayout><PublicBooking/></PublicLayout>}/><Route path="/__dev/ui" element={<UiSandbox/>}/><Route path="/app/*" element={<AppShell/>}/><Route path="/" element={<PublicLayout><RootRedirect/></PublicLayout>}/></Routes></Suspense>;
}
