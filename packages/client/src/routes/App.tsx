import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { useState, type FormEvent } from 'react';
import { ru } from '@/shared/i18n/ru';
import { LoginSchema, RegisterBusinessSchema } from '@/shared/schemas';
import { BUSINESS_COUNTRY_CODES, BUSINESS_CURRENCIES } from '@/shared/constants';
import { apiRequest, ApiClientError } from '@/lib/api-client';
import { UiSandbox } from './UiSandbox';
import { PublicBooking, PublicManage } from './PublicBooking';

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
  const active = links.find(([path]) => location.pathname === path || location.pathname.startsWith(`${path}/`));
  return <div className="min-h-screen md:grid md:grid-cols-[16rem_1fr]"><aside className="border-r border-neutral-200 bg-neutral-0 p-5"><Link className="font-semibold text-primary-700" to="/">{ru.app.name}</Link><nav aria-label="Основная навигация" className="mt-8 grid gap-1">{links.map(([to, label]) => <Link key={to} className="rounded-lg px-3 py-2 text-neutral-700 hover:bg-neutral-100 focus-visible:outline" to={to}>{label}</Link>)}</nav></aside><section><header className="border-b border-neutral-200 bg-neutral-0 px-6 py-4" aria-label="Панель приложения">{active?.[1] ?? 'Приложение'}</header><Routes>{links.map(([path,label]) => <Route key={path} path={path} element={<PageFrame title={label}/>} />)}<Route path="customers/:id" element={<PageFrame title="Карточка клиента"/>}/><Route path="staff/:id" element={<PageFrame title="Сотрудник"/>}/><Route path="*" element={<Navigate to="/app/dashboard" replace/>}/></Routes></section></div>;
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
