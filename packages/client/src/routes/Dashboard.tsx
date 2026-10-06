import { useEffect, useState } from 'react';
import { ApiClientError, apiRequest } from '@/lib/api-client';
import { ArrowPathRoundedSquareIcon, CalendarDaysIcon, CurrencyDollarIcon, UserGroupIcon } from '@heroicons/react/24/outline';

interface AppointmentRow { id: string; customer: { firstName: string; lastName?: string }; staff: { displayName: string }; service: { name: string }; startAt: string; status: string; }
interface Summary { period: { from: string; to: string; timezone: string }; revenue: { netMinor: number; currency: string }; appointments: { total: number; cancelled: number; noShow: number }; newCustomers: number; previous?: { revenue: { netMinor: number }; appointments: { total: number; cancelled: number; noShow: number }; newCustomers: number }; }
interface MasterData { date: string; today: AppointmentRow[]; upcoming: AppointmentRow[]; counts: { todayTotal: number; completedThisMonth: number; noShowThisMonth: number }; load: { bookedMinutes: number; availableMinutes: number; loadPercent: number | null }; }

const rubles = (minor: number, currency: string) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);
const localDate = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const appointmentTime = (value: string) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

function AnimatedMetric({ value }: { value: string }) {
  const target = Number(value.replace(/\D/g, '')) || 0;
  const suffix = value.match(/\D*$/)?.[0] ?? '';
  const [current, setCurrent] = useState(0);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const node = document.querySelector('[data-testid="dashboard-kpis"]');
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || started) return;
      setStarted(true);
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setCurrent(target); observer.disconnect(); return; }
      const start = performance.now();
      const step = (now: number) => {
        const progress = Math.min((now - start) / 650, 1);
        setCurrent(Math.round(target * progress));
        if (progress < 1) requestAnimationFrame(step);
        else observer.disconnect();
      };
      requestAnimationFrame(step);
    }, { threshold: 0.15 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [started, target]);
  return <>{started && current >= target ? value : `${new Intl.NumberFormat('ru-RU').format(current)}${suffix}`}</>;
}

export function DashboardPage() {
  const [preset, setPreset] = useState('month');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [upcoming, setUpcoming] = useState<AppointmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(null);
    void Promise.all([
      apiRequest<Summary>(`/api/dashboard/summary?preset=${preset}&compare=true`, { signal: controller.signal }),
      apiRequest<AppointmentRow[]>('/api/dashboard/upcoming?limit=10', { signal: controller.signal }),
    ]).then(([summaryResult, upcomingResult]) => { setSummary(summaryResult); setUpcoming(upcomingResult); }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof ApiClientError ? reason.message : 'Не удалось загрузить обзор'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [preset]);
  const metric = (title: string, value: string, tone: string, Icon: typeof CurrencyDollarIcon, previous?: number, current?: number) => <article className={`clay-card rounded-clay-card border border-white/80 p-5 shadow-clay ${tone}`}><div className="flex items-start justify-between gap-3"><h2 className="text-sm font-medium text-neutral-700">{title}</h2><Icon aria-hidden="true" className="size-6 text-primary-700"/></div><p className="mt-3 text-3xl font-bold tracking-tight"><AnimatedMetric value={value}/></p>{previous !== undefined && current !== undefined ? <p className="mt-1 text-sm text-neutral-600">{previous === 0 ? 'Нет данных для сравнения' : `${(((current - previous) / previous) * 100).toFixed(0)}% к предыдущему периоду`}</p> : null}</article>;
  return <main className="mx-auto w-full max-w-7xl p-4 md:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Обзор</h1><label className="grid gap-1 text-sm">Период<select aria-label="Период" className="rounded border px-3 py-2" value={preset} onChange={(event) => setPreset(event.target.value)}><option value="today">Сегодня</option><option value="week">Эта неделя</option><option value="month">Этот месяц</option><option value="last_month">Прошлый месяц</option></select></label></div>
    {loading ? <p className="mt-6" role="status">Загрузка обзора…</p> : null}{error ? <p className="mt-6" role="alert">{error}</p> : null}
    {summary ? <><p className="mt-3 text-sm text-neutral-600">{summary.period.from} — {summary.period.to}</p><section aria-label="Ключевые показатели" className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="dashboard-kpis">
      {metric('Выручка нетто', rubles(summary.revenue.netMinor, summary.revenue.currency), 'clay-kpi-revenue', CurrencyDollarIcon, summary.previous?.revenue.netMinor, summary.revenue.netMinor)}
      {metric('Записи всего', String(summary.appointments.total), 'clay-kpi-appointments', CalendarDaysIcon, summary.previous?.appointments.total, summary.appointments.total)}
      {metric('Отмены и неявки', String(summary.appointments.cancelled + summary.appointments.noShow), 'clay-kpi-cancellations', ArrowPathRoundedSquareIcon, summary.previous ? summary.previous.appointments.cancelled + summary.previous.appointments.noShow : undefined, summary.appointments.cancelled + summary.appointments.noShow)}
      {metric('Новые клиенты', String(summary.newCustomers), 'clay-kpi-customers', UserGroupIcon, summary.previous?.newCustomers, summary.newCustomers)}
    </section></> : null}
    <section className="mt-8"><h2 className="text-lg font-semibold">Ближайшие записи</h2>{upcoming.length ? <ul className="mt-3 divide-y divide-primary-100 overflow-hidden rounded-clay-card border border-white/80 bg-clay-raised shadow-clay">{upcoming.map((row) => <li className="grid gap-1 p-4 sm:grid-cols-[12rem_1fr_14rem]" key={row.id}><time dateTime={row.startAt}>{appointmentTime(row.startAt)}</time><span>{row.customer.firstName} {row.customer.lastName ?? ''} · {row.service.name}</span><span>{row.staff.displayName} · {row.status}</span></li>)}</ul> : <p className="mt-3 rounded-clay-card border border-white/80 bg-clay-raised p-5 text-neutral-600 shadow-clay">Ближайших записей нет.</p>}</section>
  </main>;
}

export function MyDayPage() {
  const [date, setDate] = useState('');
  const [data, setData] = useState<MasterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { const controller = new AbortController(); setError(null); const query = date ? `?date=${date}` : ''; void apiRequest<MasterData>(`/api/master/dashboard${query}`, { signal: controller.signal }).then((result) => setData(result)).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof ApiClientError ? reason.message : 'Не удалось загрузить день'); }); return () => controller.abort(); }, [date]);
  const rows = (items: AppointmentRow[]) => items.length ? <ul className="mt-3 divide-y divide-primary-100 overflow-hidden rounded-clay-card border border-white/80 bg-clay-raised shadow-clay">{items.map((row) => <li className="grid gap-1 p-4 sm:grid-cols-[12rem_1fr_auto]" key={row.id}><time dateTime={row.startAt}>{appointmentTime(row.startAt)}</time><span>{row.customer.firstName} {row.customer.lastName ?? ''} · {row.service.name}</span><span>{row.status}</span></li>)}</ul> : <p className="mt-3 rounded-clay-card border border-white/80 bg-clay-raised p-5 text-neutral-600 shadow-clay">Записей нет.</p>;
  return <main className="mx-auto w-full max-w-7xl p-4 md:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><h1 className="text-2xl font-semibold">Мой день</h1><label className="grid gap-1 text-sm">Дата<input className="rounded border px-3 py-2" type="date" value={date || data?.date || localDate()} onChange={(event) => setDate(event.target.value)} /></label></div>{error ? <p className="mt-4" role="alert">{error}</p> : null}
    {data ? <><section className="mt-5 grid gap-3 sm:grid-cols-4"><article className="rounded-clay-card border border-white/80 bg-clay-raised p-4 shadow-clay"><p>Записей сегодня</p><strong className="text-2xl">{data.counts.todayTotal}</strong></article><article className="rounded-clay-card border border-white/80 bg-clay-raised p-4 shadow-clay"><p>Завершено в этом месяце</p><strong className="text-2xl">{data.counts.completedThisMonth}</strong></article><article className="rounded-clay-card border border-white/80 bg-clay-raised p-4 shadow-clay"><p>Неявок в этом месяце</p><strong className="text-2xl">{data.counts.noShowThisMonth}</strong></article><article className="rounded-clay-card border border-white/80 bg-clay-raised p-4 shadow-clay"><p>Загрузка дня</p><strong className="text-2xl">{data.load.loadPercent === null ? '—' : `${data.load.loadPercent}%`}</strong><p className="text-sm text-neutral-600">{data.load.bookedMinutes} / {data.load.availableMinutes} мин</p></article></section><section className="mt-7"><h2 className="text-lg font-semibold">Записи на дату</h2>{rows(data.today)}</section><section className="mt-7"><h2 className="text-lg font-semibold">Ближайшие 7 дней</h2>{rows(data.upcoming)}</section></> : <p className="mt-5" role="status">Загрузка дня…</p>}</main>;
}

