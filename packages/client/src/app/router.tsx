import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router';
import { lazy, Suspense, useEffect, useState } from 'react';
import { ru } from '@/shared/i18n/ru';
import { apiRequest, ApiClientError } from '@/lib/api-client';
import { UiSandbox } from '@/features/dev/UiSandbox';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { AuthPage } from '@/features/auth/AuthPage';
import { PublicBooking, PublicManage } from '@/features/public-booking/PublicBooking';
import { PaymentsPage } from '@/features/payments/Payments';
import { DashboardPage, MyDayPage } from '@/features/dashboard/Dashboard';
import { CustomerDetailPage, CustomersPage } from '@/features/customers/Customers';
import { ServicesPage } from '@/features/services/Services';
import { SettingsPage } from '@/features/settings/Settings';
import { StaffDetailPage, StaffPage } from '@/features/staff/Staff';
import { useSession } from '@/hooks/use-session';
import { AppointmentsPage } from '@/features/appointments/Appointments';
import { AppLayout } from '@/app/layouts/AppLayout';
import { AuthLayout } from '@/app/layouts/AuthLayout';
import { PublicLayout } from '@/app/layouts/PublicLayout';

const links = [
  ['/app/dashboard', 'Обзор'], ['/app/calendar', 'Календарь'], ['/app/appointments', 'Записи'], ['/app/customers', 'Клиенты'],
  ['/app/staff', 'Сотрудники'], ['/app/services', 'Услуги'], ['/app/payments', 'Оплаты'],
  ['/app/settings', 'Настройки'], ['/app/my-day', 'Мой день'],
] as const;

const LandingPage = lazy(() => import('@/features/public-landing/Landing').then((module) => ({ default: module.LandingPage })));

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
  return <Suspense fallback={<main className="grid min-h-[60svh] place-items-center p-6"><p className="text-sm text-neutral-500" role="status">Загружаем страницу…</p></main>}><LandingPage/></Suspense>;
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
  const navigate = useNavigate();
  const session = useSession();
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
      await apiRequest('/api/auth/logout', { method: 'POST' });
      await session.refetch();
      navigate('/login', { replace: true });
    } catch (reason: unknown) {
      setVerificationError(reason instanceof ApiClientError ? reason.message : 'Не удалось выйти. Повторите попытку.');
    }
  }
  if (session.isLoading) return <SessionLoading/>;
  if (session.error instanceof ApiClientError && session.error.status === 401) return <Navigate to="/login" replace/>;
  if (!session.data) return <SessionFailure retry={() => { void session.refetch(); }}/>;
  const active = links.find(([path]) => location.pathname === path || location.pathname.startsWith(`${path}/`));
  const permissions = session.data.permissions;
  const requiredPermission: Record<string, string> = { '/app/dashboard': 'dashboard:read', '/app/calendar': 'calendar:read', '/app/appointments': 'calendar:read', '/app/customers': 'customers:read', '/app/staff': 'staff:read', '/app/services': 'services:read', '/app/payments': 'payments:read', '/app/settings': 'settings:business_read', '/app/my-day': 'dashboard:read_own' };
  const visibleLinks = links.filter(([path]) => permissions.includes(requiredPermission[path] ?? ''));
  const home = permissions.includes('dashboard:read') ? '/app/dashboard' : permissions.includes('dashboard:read_own') ? '/app/my-day' : undefined;
  const permissionFallback = home ? <Navigate to={home} replace/> : <AccessDenied/>;
  const pageRoutes = <Routes>{links.map(([path,label]) => <Route key={path} path={path.slice('/app/'.length)} element={path === '/app/calendar' ? <CalendarPage/> : path === '/app/appointments' ? <AppointmentsPage/> : path === '/app/payments' ? permissions.includes('payments:read') ? <PaymentsPage/> : permissionFallback : path === '/app/dashboard' ? permissions.includes('dashboard:read') ? <DashboardPage/> : permissions.includes('dashboard:read_own') ? <Navigate to="/app/my-day" replace/> : <AccessDenied/> : path === '/app/my-day' ? permissions.includes('dashboard:read_own') ? <MyDayPage/> : permissions.includes('dashboard:read') ? <Navigate to="/app/dashboard" replace/> : <AccessDenied/> : path === '/app/settings' ? permissions.includes('settings:business_read') ? <SettingsPage/> : permissionFallback : path === '/app/staff' ? <StaffPage/> : path === '/app/services' ? <ServicesPage/> : path === '/app/customers' ? <CustomersPage/> : <PageFrame title={label}/>} />)}<Route path="customers/:id" element={<CustomerDetailPage/>}/><Route path="staff/:id" element={<StaffDetailPage/>}/><Route path="appointments/:id" element={<AppointmentDirectPage/>}/><Route path="*" element={home ? <Navigate to={home} replace/> : <AccessDenied/>}/></Routes>;
  const verificationBanner = !session.data.user.emailVerified ? <div className="border-b border-warning-solid/30 bg-warning-bg px-4 py-3 text-sm text-warning-fg md:px-6" role="status"><div className="flex flex-wrap items-center gap-3"><span>{ru.auth.emailVerificationBanner}, {session.data.user.name}.</span><button className="font-medium" onClick={() => { void resendVerification(); }}>{ru.auth.resendVerification}</button>{verificationNotice ? <span aria-live="polite">{verificationNotice}</span> : null}{verificationError ? <span role="alert">{verificationError}</span> : null}</div></div> : null;
  return <AppLayout navItems={visibleLinks} currentPath={location.pathname} title={active?.[1] ?? 'Приложение'} brand={ru.app.name} banner={verificationBanner} userName={session.data.user.name} userEmail={session.data.user.email} userRole={session.data.active.role === 'master' ? 'Мастер' : 'Владелец'} canCreateAppointment={permissions.includes('appointments:create')} onLogout={() => { void logout(); }}>{pageRoutes}</AppLayout>;
}

export function App() {
  return <Routes><Route path="/login" element={<AuthLayout><AuthPage/></AuthLayout>}/><Route path="/register" element={<AuthLayout><AuthPage register/></AuthLayout>}/><Route path="/verify-email" element={<AuthLayout><AuthPage mode="verify"/></AuthLayout>}/><Route path="/forgot-password" element={<AuthLayout><AuthPage mode="forgot"/></AuthLayout>}/><Route path="/reset-password" element={<AuthLayout><AuthPage mode="reset"/></AuthLayout>}/><Route path="/b/:slug/manage/:token" element={<PublicLayout><PublicManage/></PublicLayout>}/><Route path="/b/:slug/*" element={<PublicLayout><PublicBooking/></PublicLayout>}/><Route path="/__dev/ui" element={<UiSandbox/>}/><Route path="/app/*" element={<AppShell/>}/><Route path="/" element={<PublicLayout><RootRedirect/></PublicLayout>}/></Routes>;
}
