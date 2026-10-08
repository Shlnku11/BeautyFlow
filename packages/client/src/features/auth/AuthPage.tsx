import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { ru } from '@/shared/i18n/ru';
import { GoogleRegisterBusinessSchema, LoginSchema, RegisterBusinessSchema, VerifyEmailSchema } from '@/shared/schemas';
import { BUSINESS_COUNTRY_CODES, BUSINESS_CURRENCIES } from '@/shared/constants';
import { apiRequest, ApiClientError } from '@/lib/api-client';
export function AuthPage({ register = false }: { register?: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const googleConfig = useQuery({
    queryKey: ['google-auth-config'],
    queryFn: () => apiRequest<{ enabled: boolean; clientId: string | null }>('/api/auth/google/config'),
    staleTime: 300_000,
    retry: false,
  });
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
      if (register) {
        setVerificationEmail(parsed.data.email);
        return;
      }
      await queryClient.resetQueries({ queryKey: ['session'] });
      navigate('/app', { replace: true });
    } catch (reason: unknown) {
      setError(reason instanceof ApiClientError ? reason.message : ru.errors.INTERNAL);
    }
  }
  async function submitVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verificationEmail) return;
    setError(null);
    const data = new FormData(event.currentTarget);
    const parsed = VerifyEmailSchema.safeParse({ email: verificationEmail, code: data.get('code') });
    if (!parsed.success) { setError(ru.errors.VALIDATION_ERROR); return; }
    try {
      await apiRequest('/api/auth/verify-email', { method: 'POST', body: parsed.data, redirectOnUnauthorized: false });
      await queryClient.resetQueries({ queryKey: ['session'] });
      navigate('/app', { replace: true });
    } catch (reason: unknown) {
      setError(reason instanceof ApiClientError ? reason.message : ru.errors.INTERNAL);
    }
  }
  async function resendVerification() {
    if (!verificationEmail) return;
    setError(null);
    setVerificationNotice(null);
    try {
      await apiRequest('/api/auth/resend-verification', { method: 'POST', body: { email: verificationEmail }, redirectOnUnauthorized: false });
      setVerificationNotice(ru.auth.resendVerificationSent);
    } catch (reason: unknown) {
      setError(reason instanceof ApiClientError ? reason.message : ru.errors.INTERNAL);
    }
  }
  async function submitGoogleCredential(idToken: string) {
    setError(null);
    try {
      if (register) {
        const data = new FormData(formRef.current ?? undefined);
        const parsed = GoogleRegisterBusinessSchema.safeParse({
          idToken,
          businessName: data.get('businessName'),
          slug: data.get('slug') || undefined,
          timezone: data.get('timezone'),
          currency: data.get('currency'),
          countryCode: data.get('countryCode'),
          acceptTerms: data.has('acceptTerms'),
        });
        if (!parsed.success) { setError(ru.auth.googleRegisterDetailsRequired); return; }
        await apiRequest('/api/auth/google/register-business', { method: 'POST', body: parsed.data, redirectOnUnauthorized: false });
      } else {
        await apiRequest('/api/auth/google', { method: 'POST', body: { idToken }, redirectOnUnauthorized: false });
      }
      await queryClient.resetQueries({ queryKey: ['session'] });
      navigate('/app', { replace: true });
    } catch (reason: unknown) {
      setError(reason instanceof ApiClientError && reason.code === 'GOOGLE_ACCOUNT_NOT_FOUND' ? ru.auth.googleRegistrationRequired : reason instanceof ApiClientError ? reason.message : ru.errors.INTERNAL);
    }
  }
  if (verificationEmail) return <main className="mx-auto flex min-h-screen max-w-lg items-center p-6"><section className="w-full rounded-2xl border border-neutral-200 bg-neutral-0 p-8 shadow-sm"><p className="text-sm font-semibold text-primary-700">{ru.app.name}</p><h1 className="mt-3 text-2xl font-semibold">{ru.auth.verifyEmailTitle}</h1><p className="mt-2 text-sm text-neutral-600">{ru.auth.verifyEmailDescription} <strong>{verificationEmail}</strong></p><form className="mt-6 grid gap-4" onSubmit={(event) => { void submitVerification(event); }}><label className="grid gap-1">{ru.auth.verifyEmailCode}<input autoComplete="one-time-code" className="rounded-lg border border-neutral-300 px-3 py-2 tracking-[0.3em]" name="code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required/></label>{error ? <p className="text-danger-fg" role="alert">{error}</p> : null}{verificationNotice ? <p role="status">{verificationNotice}</p> : null}<button className="rounded-lg bg-primary-600 px-4 py-2 font-medium text-neutral-0" type="submit">{ru.auth.verifyEmailSubmit}</button><button className="rounded-lg border px-4 py-2 font-medium" type="button" onClick={() => { void resendVerification(); }}>{ru.auth.resendVerification}</button></form></section></main>;
  return <main className="mx-auto flex min-h-screen max-w-lg items-center p-6"><section className="w-full rounded-2xl border border-neutral-200 bg-neutral-0 p-8 shadow-sm"><p className="text-sm font-semibold text-primary-700">{ru.app.name}</p><h1 className="mt-3 text-2xl font-semibold">{title}</h1><form ref={formRef} className="mt-6 grid gap-4" onSubmit={(event) => { void submit(event); }}>
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
  </form><div className="my-5 flex items-center gap-3 text-xs text-neutral-500"><span className="h-px flex-1 bg-neutral-200"/><span>{ru.auth.or}</span><span className="h-px flex-1 bg-neutral-200"/></div>{googleConfig.data?.enabled && googleConfig.data.clientId ? <GoogleOAuthProvider clientId={googleConfig.data.clientId}><GoogleLogin onSuccess={(response) => { if (response.credential) void submitGoogleCredential(response.credential); else setError(ru.auth.googleSignInFailed); }} onError={() => setError(ru.auth.googleSignInFailed)} /></GoogleOAuthProvider> : <p className="text-center text-sm text-neutral-500">{ru.auth.googleComingSoon}</p>}</section></main>;
}