import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faCalendarCheck, faEye, faEyeSlash, faLock, faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import { ru } from '@/shared/i18n/ru';
import { AcceptInviteSchema, GoogleRegisterBusinessSchema, LoginSchema, RegisterBusinessSchema, ResetPasswordSchema, VerifyEmailSchema } from '@/shared/schemas';
import { BUSINESS_COUNTRY_CODES, BUSINESS_CURRENCIES, DEV_DEMO_LOGIN_CODE, DEV_DEMO_LOGIN_EMAILS } from '@/shared/constants';
import type { LoginResponseDto } from '@/shared/types/dto';
import { apiRequest, ApiClientError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

type AuthMode = 'login' | 'register' | 'verify' | 'forgot' | 'reset' | 'accept-invite';
type AuthLocationState = { flow?: 'login' | 'register'; email?: string; loginToken?: string; notice?: string };

function AuthFrame({ children, wide = false, headerHref, headerText }: { children: ReactNode; wide?: boolean; headerHref?: string; headerText?: string }) {
  const defaultHeaderHref = wide ? '/login' : '/register';
  const defaultHeaderText = wide ? `${ru.auth.haveAccount} ${ru.auth.loginTitle.toLowerCase()}` : `${ru.auth.noAccount} ${ru.auth.registerTitle.toLowerCase()}`;
  return <div className="auth-shell">
    <header className="auth-header"><Link aria-label="BeautyFlow — главная" className="auth-brand" to="/"><span className="auth-brand-mark"><FontAwesomeIcon icon={faCalendarCheck} aria-hidden="true"/></span><span>{ru.app.name}</span></Link><Link className="auth-switch" to={headerHref ?? defaultHeaderHref}>{headerText ?? defaultHeaderText}</Link></header>
    <main className={`auth-main ${wide ? 'auth-main-wide' : ''}`}>
      <aside aria-label="BeautyFlow" className="auth-aside"><span className="auth-aside-kicker">ПОРЯДОК В КАЖДОМ ДНЕ</span><h1>Больше времени<br/>на красоту и рост.</h1><p>Записи, клиенты и команда — в одном спокойном рабочем пространстве.</p><div className="auth-aside-card"><span className="auth-aside-card-icon"><FontAwesomeIcon icon={faCalendarCheck}/></span><span><b>Ваш бизнес — в фокусе</b><small>Расписание и важные дела рядом</small></span><span className="auth-aside-card-check">✓</span></div><div aria-hidden="true" className="auth-aside-orbit auth-aside-orbit-a"/><div aria-hidden="true" className="auth-aside-orbit auth-aside-orbit-b"/></aside>
      <section className="auth-content"><div className={`auth-card-wrap ${wide ? 'auth-card-wrap-wide' : ''}`}>{children}</div></section>
    </main>
    <footer className="auth-footer"><span>© {new Date().getFullYear()} BeautyFlow</span><span>Спокойный порядок для вашего бизнеса</span></footer>
  </div>;
}

function AuthError({ children }: { children: string | null }) {
  return children ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{children}</p> : null;
}

function Field({ id, label, children, hint }: { id: string; label: string; children: ReactNode; hint?: string }) {
  return <div className="grid gap-1.5"><Label htmlFor={id} className="text-[13px]">{label}</Label>{children}{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}</div>;
}

function countryCurrency(country: string): string {
  return country === 'KG' ? 'KGS' : country === 'KZ' ? 'KZT' : country === 'US' ? 'USD' : 'RUB';
}

function defaultCountry(): string {
  const localeCountry = typeof navigator === 'undefined' ? undefined : navigator.language.split('-')[1]?.toUpperCase();
  if (localeCountry && BUSINESS_COUNTRY_CODES.includes(localeCountry as (typeof BUSINESS_COUNTRY_CODES)[number])) return localeCountry;
  return Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Bishkek' ? 'KG' : 'RU';
}

function slugify(value: string): string {
  const replacements: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  return Array.from(value.normalize('NFKC').toLowerCase(), (character) => replacements[character] ?? character).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function AuthForm({ register }: { register: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const locationState = location.state as AuthLocationState | null;
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [countryCode, setCountryCode] = useState(defaultCountry);
  const [currency, setCurrency] = useState(() => countryCurrency(defaultCountry()));
  const googleConfig = useQuery({ queryKey: ['google-auth-config'], queryFn: () => apiRequest<{ enabled: boolean; clientId: string | null }>('/api/auth/google/config'), staleTime: 300_000, retry: false });
  const title = register ? ru.auth.registerTitle : ru.auth.loginTitle;
  const shownSlug = slugEdited ? slug : slugify(businessName);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const data = new FormData(event.currentTarget);
    const raw = Object.fromEntries(data.entries());
    const prepared = register ? { ...raw, slug: typeof raw.slug === 'string' && raw.slug.trim() ? raw.slug.trim() : undefined, acceptTerms: data.has('acceptTerms'), website: '' } : raw;
    const parsed = register ? RegisterBusinessSchema.safeParse(prepared) : LoginSchema.safeParse(prepared);
    if (!parsed.success) { setError(ru.errors.VALIDATION_ERROR); setIsSubmitting(false); return; }
    try {
      if (register) {
        await apiRequest('/api/auth/register-business', { method: 'POST', body: parsed.data, redirectOnUnauthorized: false });
        navigate(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`, { state: { flow: 'register', email: parsed.data.email } satisfies AuthLocationState });
        return;
      }
      const result = await apiRequest<LoginResponseDto>('/api/auth/login', { method: 'POST', body: parsed.data, redirectOnUnauthorized: false });
      if (result.requiresEmailCode) {
        sessionStorage.setItem('beautyflow-login-token', result.loginToken);
        navigate('/verify-email', { state: { flow: 'login', email: parsed.data.email, loginToken: result.loginToken } satisfies AuthLocationState });
        return;
      }
      sessionStorage.removeItem('beautyflow-login-token');
      await queryClient.resetQueries({ queryKey: ['session'] });
      navigate('/app', { replace: true });
    } catch (reason: unknown) {
      if (!register && reason instanceof ApiClientError && reason.code === 'EMAIL_NOT_VERIFIED') {
        await apiRequest('/api/auth/resend-verification', { method: 'POST', body: { email: parsed.data.email }, redirectOnUnauthorized: false }).catch(() => undefined);
        navigate(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`, { state: { flow: 'register', email: parsed.data.email } satisfies AuthLocationState });
        return;
      }
      setError(reason instanceof ApiClientError ? reason.message : ru.errors.INTERNAL);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitGoogleCredential(idToken: string) {
    setError(null);
    setIsSubmitting(true);
    try {
      if (register) {
        const data = new FormData(formRef.current ?? undefined);
        const parsed = GoogleRegisterBusinessSchema.safeParse({ idToken, businessName: data.get('businessName'), slug: data.get('slug') || undefined, timezone: data.get('timezone'), currency: data.get('currency'), countryCode: data.get('countryCode'), acceptTerms: data.has('acceptTerms') });
        if (!parsed.success) { setError(ru.auth.googleRegisterDetailsRequired); return; }
        await apiRequest('/api/auth/google/register-business', { method: 'POST', body: parsed.data, redirectOnUnauthorized: false });
      } else {
        await apiRequest('/api/auth/google', { method: 'POST', body: { idToken }, redirectOnUnauthorized: false });
      }
      await queryClient.resetQueries({ queryKey: ['session'] });
      navigate('/app', { replace: true });
    } catch (reason: unknown) {
      setError(reason instanceof ApiClientError && reason.code === 'GOOGLE_ACCOUNT_NOT_FOUND' ? ru.auth.googleRegistrationRequired : reason instanceof ApiClientError ? reason.message : ru.auth.googleSignInFailed);
    } finally {
      setIsSubmitting(false);
    }
  }

  return <AuthFrame wide={register}><Card className="overflow-hidden rounded-xl border-border/80 bg-card shadow-sm"><CardHeader className="space-y-2 px-6 pb-3 pt-7 sm:px-8 sm:pt-8"><p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{ru.app.name}</p><CardTitle className="text-[22px] tracking-tight">{title}</CardTitle><CardDescription>{register ? ru.auth.registerSubtitle : ru.auth.loginSubtitle}</CardDescription></CardHeader><CardContent className="px-6 pb-7 sm:px-8 sm:pb-8">
    <form ref={formRef} className="grid gap-4" onSubmit={(event) => { void submit(event); }}>
      {register ? <>
        <div className="border-b border-border pb-2 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{ru.auth.businessSection}</div>
        <Field id="businessName" label={ru.auth.businessName}><Input id="businessName" autoComplete="organization" name="businessName" value={businessName} onChange={(event) => setBusinessName(event.currentTarget.value)} minLength={2} maxLength={120} required/></Field>
        <Field id="slug" label={ru.auth.slug} hint={ru.auth.slugHint}><div className="flex h-9 min-w-0 items-center overflow-hidden rounded-md border border-input bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring"><span className="shrink-0 pl-3 text-sm text-muted-foreground">beautyflow.app/b/</span><input id="slug" aria-label={ru.auth.slug} className="h-full min-w-0 flex-1 bg-transparent px-1 text-sm outline-none" name="slug" value={shownSlug} onChange={(event) => { setSlugEdited(true); setSlug(slugify(event.currentTarget.value)); }} maxLength={60}/></div></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="timezone" label={ru.auth.timezone}><Input id="timezone" name="timezone" defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone} required/></Field>
          <Field id="countryCode" label={ru.auth.countryCode}><NativeSelect id="countryCode" name="countryCode" value={countryCode} onChange={(event) => { const value = event.currentTarget.value; setCountryCode(value); setCurrency(countryCurrency(value)); }} aria-label={ru.auth.countryCode}>{BUSINESS_COUNTRY_CODES.map((country) => <NativeSelectOption key={country} value={country}>{country === 'KG' ? 'Кыргызстан' : country === 'KZ' ? 'Казахстан' : country === 'RU' ? 'Россия' : country === 'US' ? 'США' : 'Другая'}</NativeSelectOption>)}</NativeSelect></Field>
        </div>
        <Field id="currency" label={ru.auth.currency}><NativeSelect id="currency" name="currency" value={currency} onChange={(event) => setCurrency(event.currentTarget.value)}>{BUSINESS_CURRENCIES.map((currencyOption) => <NativeSelectOption key={currencyOption} value={currencyOption}>{currencyOption}</NativeSelectOption>)}</NativeSelect></Field>
        <div className="border-b border-border pb-2 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{ru.auth.accountSection}</div>
        <Field id="ownerName" label={ru.auth.ownerName}><Input id="ownerName" autoComplete="name" name="ownerName" minLength={2} maxLength={120} required/></Field>
      </> : null}
      <Field id="email" label={ru.auth.email}><Input id="email" autoComplete="email" defaultValue={locationState?.email ?? ''} name="email" type="email" required/></Field>
      <Field id="password" label={ru.auth.password} {...(register ? { hint: ru.auth.passwordRequirement } : {})}><div className="relative"><Input id="password" autoComplete={register ? 'new-password' : 'current-password'} className="pr-10" name="password" type={showPassword ? 'text' : 'password'} minLength={register ? 10 : 1} maxLength={128} required/><button aria-label={showPassword ? ru.auth.hidePassword : ru.auth.showPassword} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground transition-colors hover:text-foreground" type="button" onClick={() => setShowPassword((value) => !value)}><FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} aria-hidden="true"/></button></div></Field>
      {register ? <label className="flex items-start gap-2 text-sm text-muted-foreground"><Input className="mt-0.5" name="acceptTerms" type="checkbox" required/><span>{ru.auth.acceptTerms}</span></label> : <div className="flex justify-end"><Link className="text-sm text-primary underline-offset-4 hover:underline" to="/forgot-password">{ru.auth.forgotPassword}</Link></div>}
      <AuthError>{error}</AuthError>
      <Button className="h-9 w-full font-medium" type="submit" disabled={isSubmitting}>{isSubmitting ? '…' : register ? ru.auth.submitRegister : ru.auth.submitLogin}</Button>
      {register ? <p className="text-center text-sm text-muted-foreground">{ru.auth.haveAccount} <Link className="font-medium text-primary underline-offset-4 hover:underline" to="/login">{ru.auth.loginTitle}</Link></p> : null}
    </form>
    <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border"/><span>{ru.auth.or}</span><span className="h-px flex-1 bg-border"/></div>
    {googleConfig.data?.enabled && googleConfig.data.clientId ? <div className="flex justify-center"><GoogleOAuthProvider clientId={googleConfig.data.clientId}><GoogleLogin text="continue_with" theme="outline" shape="rectangular" onSuccess={(response) => { if (response.credential) void submitGoogleCredential(response.credential); else setError(ru.auth.googleSignInFailed); }} onError={() => setError(ru.auth.googleSignInFailed)}/></GoogleOAuthProvider></div> : <Button className="w-full" variant="outline" type="button" disabled><FontAwesomeIcon icon={faLock} aria-hidden="true"/>{ru.auth.googleComingSoon}</Button>}
  </CardContent></Card></AuthFrame>;
}

function VerificationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const locationState = location.state as AuthLocationState | null;
  const params = new URLSearchParams(location.search);
  const email = locationState?.email ?? params.get('email') ?? '';
  const flow = locationState?.flow ?? (sessionStorage.getItem('beautyflow-login-token') ? 'login' : 'register');
  const [loginToken, setLoginToken] = useState(locationState?.loginToken ?? sessionStorage.getItem('beautyflow-login-token') ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const cells = useRef<Array<HTMLInputElement | null>>([]);
  const autoVerifyStarted = useRef(false);
  const autoVerifyDemoLogin = import.meta.env.DEV
    && import.meta.env.VITE_DEMO_OTP_AUTO_VERIFY !== 'false'
    && flow === 'login'
    && DEV_DEMO_LOGIN_EMAILS.some((demoEmail) => demoEmail === email.toLowerCase());

  useEffect(() => {
    const interval = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!autoVerifyDemoLogin || !loginToken || autoVerifyStarted.current) return;
    autoVerifyStarted.current = true;
    setCode(DEV_DEMO_LOGIN_CODE);
    setNotice(ru.auth.devDemoOtpNotice);
    setIsSubmitting(true);
    void apiRequest('/api/auth/login/verify', { method: 'POST', body: { loginToken, code: DEV_DEMO_LOGIN_CODE }, redirectOnUnauthorized: false })
      .then(async () => {
        sessionStorage.removeItem('beautyflow-login-token');
        await queryClient.resetQueries({ queryKey: ['session'] });
        navigate('/app', { replace: true });
      })
      .catch((reason: unknown) => setError(reason instanceof ApiClientError ? reason.message : ru.errors.INTERNAL))
      .finally(() => setIsSubmitting(false));
  }, [autoVerifyDemoLogin, loginToken, navigate, queryClient]);

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    setCode(pasted);
    cells.current[Math.min(pasted.length, 6) - 1]?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (code.length !== 6) { setError(ru.errors.VALIDATION_ERROR); return; }
      if (flow === 'login') {
        if (!loginToken) { setError(ru.auth.resendLoginError); return; }
        await apiRequest('/api/auth/login/verify', { method: 'POST', body: { loginToken, code }, redirectOnUnauthorized: false });
        sessionStorage.removeItem('beautyflow-login-token');
      } else {
        const parsed = VerifyEmailSchema.safeParse({ email, code });
        if (!parsed.success) { setError(ru.errors.VALIDATION_ERROR); return; }
        await apiRequest('/api/auth/verify-email', { method: 'POST', body: parsed.data, redirectOnUnauthorized: false });
      }
      await queryClient.resetQueries({ queryKey: ['session'] });
      navigate('/app', { replace: true });
    } catch (reason: unknown) {
      setError(reason instanceof ApiClientError ? reason.message : ru.errors.INTERNAL);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resend() {
    setError(null);
    setNotice(null);
    try {
      if (flow === 'login') {
        const result = await apiRequest<{ loginToken: string }>('/api/auth/login/resend', { method: 'POST', body: { loginToken }, redirectOnUnauthorized: false });
        setLoginToken(result.loginToken);
        sessionStorage.setItem('beautyflow-login-token', result.loginToken);
        setNotice(ru.auth.resendVerificationSent);
      } else {
        await apiRequest('/api/auth/resend-verification', { method: 'POST', body: { email }, redirectOnUnauthorized: false });
        setNotice(ru.auth.resendVerificationSent);
      }
      setCode('');
      setCooldown(60);
      cells.current[0]?.focus();
    } catch (reason: unknown) {
      setError(reason instanceof ApiClientError ? reason.message : ru.errors.INTERNAL);
    }
  }

  const title = flow === 'login' ? ru.auth.verifyLoginTitle : ru.auth.verifyEmailTitle;
  const description = flow === 'login' ? ru.auth.verifyLoginDescription : ru.auth.verifyEmailDescription;
  const digitLabels = Array.from({ length: 6 }, (_, index) => `Цифра ${index + 1} из 6`);
  if (!email) return <AuthFrame headerHref="/login" headerText={ru.auth.backToLogin}><Card><CardContent className="grid gap-4 p-7 text-center"><p className="text-sm text-muted-foreground">{ru.auth.resendLoginError}</p><Button asChild><Link to="/login">{ru.auth.backToLogin}</Link></Button></CardContent></Card></AuthFrame>;

  return <AuthFrame headerHref="/login" headerText={ru.auth.backToLogin}><Card className="rounded-xl border-border/80 bg-card shadow-sm"><CardHeader className="space-y-3 px-6 pb-3 pt-7"><div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><FontAwesomeIcon icon={faPaperPlane} aria-hidden="true"/></div><CardTitle className="text-[22px] tracking-tight">{title}</CardTitle><CardDescription>{description}<br/><strong className="mt-1 inline-block font-medium text-foreground">{email}</strong></CardDescription></CardHeader><CardContent className="px-6 pb-7"><form className="grid gap-5" onSubmit={(event) => { void submit(event); }}><div className="grid gap-2"><p id="verify-code-label" className="text-[13px] font-medium leading-none">{ru.auth.verifyEmailCode}</p><div aria-labelledby="verify-code-label" className="flex items-center justify-between gap-2" onPaste={handlePaste} role="group">{Array.from({ length: 6 }, (_, index) => <Input key={digitLabels[index]} ref={(element) => { cells.current[index] = element; }} aria-label={digitLabels[index]} autoComplete={index === 0 ? 'one-time-code' : 'off'} autoFocus={index === 0} className="size-11 p-0 text-center text-lg font-semibold tabular-nums" inputMode="numeric" maxLength={1} value={code[index] ?? ''} onChange={(event) => { const digit = event.currentTarget.value.replace(/\D/g, '').slice(-1); const next = `${code.slice(0, index)}${digit}${code.slice(index + 1)}`.slice(0, 6); setCode(next); if (digit) cells.current[Math.min(index + 1, 5)]?.focus(); }} onKeyDown={(event) => { if (event.key === 'Backspace' && !code[index] && index > 0) cells.current[index - 1]?.focus(); if (event.key === 'ArrowLeft' && index > 0) cells.current[index - 1]?.focus(); if (event.key === 'ArrowRight' && index < 5) cells.current[index + 1]?.focus(); }}/>)}</div></div><AuthError>{error}</AuthError>{notice ? <p className="text-sm text-muted-foreground" role="status" aria-live="polite">{notice}</p> : null}<Button className="w-full" type="submit" disabled={isSubmitting}>{isSubmitting ? '…' : flow === 'login' ? ru.auth.verifyLoginSubmit : ru.auth.verifyEmailSubmit}</Button><div className="text-center text-sm text-muted-foreground">{cooldown > 0 ? ru.auth.resendIn(cooldown) : <button className="font-medium text-primary underline-offset-4 hover:underline" type="button" onClick={() => { void resend(); }}>{flow === 'login' ? ru.auth.resendLogin : ru.auth.resendVerification}</button>}</div><Link className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" to="/login" onClick={() => { if (flow === 'login') sessionStorage.removeItem('beautyflow-login-token'); }}>{ru.auth.backToLogin}</Link></form></CardContent></Card></AuthFrame>;
}

function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') ?? '').trim().toLowerCase();
    setIsSubmitting(true);
    try {
      await apiRequest('/api/auth/forgot-password', { method: 'POST', body: { email }, redirectOnUnauthorized: false });
      setSent(true);
    } catch (reason: unknown) {
      setError(reason instanceof ApiClientError ? reason.message : ru.errors.INTERNAL);
    } finally {
      setIsSubmitting(false);
    }
  }
  return <AuthFrame headerHref="/login" headerText={ru.auth.backToLogin}><Card className="rounded-xl border-border/80 bg-card shadow-sm"><CardHeader className="px-6 pb-3 pt-7"><CardTitle className="text-[22px] tracking-tight">{ru.auth.forgotTitle}</CardTitle><CardDescription>{ru.auth.forgotDescription}</CardDescription></CardHeader><CardContent className="px-6 pb-7"><form className="grid gap-4" onSubmit={(event) => { void submit(event); }}><Field id="email" label={ru.auth.email}><Input id="email" autoComplete="email" name="email" type="email" required/></Field>{sent ? <p className="text-sm text-muted-foreground" role="status" aria-live="polite">{ru.auth.forgotSent}</p> : null}<AuthError>{error}</AuthError><Button className="w-full" type="submit" disabled={isSubmitting || sent}>{isSubmitting ? '…' : ru.auth.forgotSubmit}</Button><Link className="inline-flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground" to="/login"><FontAwesomeIcon icon={faArrowLeft} aria-hidden="true"/>{ru.auth.backToLogin}</Link></form></CardContent></Card></AuthFrame>;
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const parsed = ResetPasswordSchema.safeParse({ token: params.get('token'), password: data.get('password') });
    if (!parsed.success) { setError(ru.errors.VALIDATION_ERROR); return; }
    setIsSubmitting(true);
    try {
      await apiRequest('/api/auth/reset-password', { method: 'POST', body: parsed.data, redirectOnUnauthorized: false });
      navigate('/login', { replace: true, state: { notice: ru.auth.resetSuccess } satisfies AuthLocationState });
    } catch (reason: unknown) {
      setError(reason instanceof ApiClientError ? reason.message : ru.errors.INTERNAL);
    } finally {
      setIsSubmitting(false);
    }
  }
  return <AuthFrame headerHref="/login" headerText={ru.auth.backToLogin}><Card className="rounded-xl border-border/80 bg-card shadow-sm"><CardHeader className="px-6 pb-3 pt-7"><CardTitle className="text-[22px] tracking-tight">{ru.auth.resetTitle}</CardTitle><CardDescription>{ru.auth.resetDescription}</CardDescription></CardHeader><CardContent className="px-6 pb-7"><form className="grid gap-4" onSubmit={(event) => { void submit(event); }}><Field id="password" label={ru.auth.password} hint={ru.auth.passwordRequirement}><Input id="password" autoComplete="new-password" name="password" type="password" minLength={10} maxLength={128} required/></Field><AuthError>{error}</AuthError><Button className="w-full" type="submit" disabled={isSubmitting}>{isSubmitting ? '…' : ru.auth.resetSubmit}</Button><Link className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" to="/login">{ru.auth.backToLogin}</Link></form></CardContent></Card></AuthFrame>;
}

function AcceptInvitePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const token = new URLSearchParams(location.search).get('token') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const parsed = AcceptInviteSchema.safeParse({ token, name: form.get('name'), password: form.get('password') });
    if (!parsed.success) { setError(ru.errors.VALIDATION_ERROR); return; }
    setSubmitting(true);
    try {
      await apiRequest('/api/auth/accept-invite', { method: 'POST', body: parsed.data, redirectOnUnauthorized: false });
      await queryClient.resetQueries({ queryKey: ['session'] });
      navigate('/app', { replace: true });
    } catch (reason: unknown) {
      setError(reason instanceof ApiClientError ? reason.message : ru.errors.INTERNAL);
    } finally {
      setSubmitting(false);
    }
  }
  return <AuthFrame headerHref="/login" headerText={ru.auth.backToLogin}><Card className="rounded-xl border-border/80 bg-card shadow-sm"><CardHeader className="px-6 pb-3 pt-7"><CardTitle className="text-[22px] tracking-tight">Принять приглашение</CardTitle><CardDescription>Укажите имя и задайте пароль для входа в BeautyFlow.</CardDescription></CardHeader><CardContent className="px-6 pb-7"><form className="grid gap-4" onSubmit={(event) => { void submit(event); }}><Field id="name" label="Ваше имя"><Input id="name" autoComplete="name" name="name" required minLength={2} maxLength={120}/></Field><Field id="password" label={ru.auth.password} hint={ru.auth.passwordRequirement}><Input id="password" autoComplete="new-password" name="password" type="password" minLength={10} maxLength={128} required/></Field><AuthError>{error}</AuthError><Button className="w-full" type="submit" disabled={submitting || !token}>{submitting ? 'Сохраняем…' : 'Создать пароль и войти'}</Button></form></CardContent></Card></AuthFrame>;
}

export function AuthPage({ register = false, mode }: { register?: boolean; mode?: AuthMode }) {
  if (mode === 'verify') return <VerificationPage/>;
  if (mode === 'forgot') return <ForgotPasswordPage/>;
  if (mode === 'reset') return <ResetPasswordPage/>;
  if (mode === 'accept-invite') return <AcceptInvitePage/>;
  return <AuthForm register={register}/>;
}
