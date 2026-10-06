import { useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowDown, faArrowUp, faCalendarDays, faChartLine } from '@fortawesome/free-solid-svg-icons';
import { Link } from 'react-router';
import { ApiClientError, apiRequest } from '@/lib/api-client';
import { useSession } from '@/hooks/use-session';
import { AppointmentDetailDialog } from '@/components/data/AppointmentDialogs';

interface AppointmentRow { id: string; customer: { firstName: string; lastName?: string }; staff: { displayName: string }; service: { name: string }; startAt: string; status: string; }
interface Summary { period: { from: string; to: string; timezone: string }; revenue: { netMinor: number; currency: string }; appointments: { total: number; cancelled: number; noShow: number }; newCustomers: number; previous?: { revenue: { netMinor: number }; appointments: { total: number; cancelled: number; noShow: number }; newCustomers: number }; }
interface MasterData { date: string; today: AppointmentRow[]; upcoming: AppointmentRow[]; counts: { todayTotal: number; completedThisMonth: number; noShowThisMonth: number }; load: { bookedMinutes: number; availableMinutes: number; loadPercent: number | null }; }

const money = (minor: number, currency: string) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);
const appointmentTime = (value: string, timezone: string) => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(new Date(value));
const statusLabels: Record<string, string> = { pending: 'Ожидает', confirmed: 'Подтверждена', completed: 'Завершена', cancelled: 'Отменена', no_show: 'Неявка' };

function Metric({ title, value, displayValue, previous, reverseTone = false }: { title: string; value: number; displayValue?: string; previous?: number | undefined; reverseTone?: boolean }) {
  const delta = previous === undefined ? null : value - previous;
  const percent = previous === undefined ? null : previous === 0 ? (value === 0 ? 0 : null) : Math.round(((value - previous) / previous) * 100);
  const positive = delta === null ? false : reverseTone ? delta < 0 : delta > 0;
  const negative = delta === null ? false : reverseTone ? delta > 0 : delta < 0;
  return <article className="min-w-0 py-3 sm:px-4 first:sm:pl-0" aria-label={title}>
    <h2 className="text-[13px] font-medium text-neutral-600">{title}</h2>
    <p className="mt-2 whitespace-nowrap text-[28px] font-semibold leading-8 tracking-tight tabular-nums text-neutral-900">{displayValue ?? value.toLocaleString('ru-RU')}</p>
    <p className={`mt-1 flex items-center gap-1 text-xs ${positive ? 'text-success-fg' : negative ? 'text-danger-fg' : 'text-neutral-500'}`}>
      {delta !== null && delta !== 0 ? <FontAwesomeIcon aria-hidden="true" className="size-3" icon={positive ? faArrowUp : faArrowDown}/> : null}
      {percent === null ? 'Новое значение к прошлому периоду' : `${percent > 0 ? '+' : ''}${percent}% к прошлому`}
    </p>
  </article>;
}

export function DashboardPage() {
  const session = useSession();
  const [preset, setPreset] = useState<'today' | 'week' | 'month' | 'quarter'>('month');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [upcoming, setUpcoming] = useState<AppointmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const timezone = session.data?.active.business.timezone ?? 'UTC';
  const periodQuery = () => {
    const query = new URLSearchParams({ compare: 'true' });
    if (preset === 'quarter') {
      const start = DateTime.now().setZone(timezone).startOf('quarter');
      query.set('from', start.toISODate() ?? '');
      query.set('to', start.plus({ months: 3 }).minus({ days: 1 }).toISODate() ?? '');
    } else query.set('preset', preset);
    return query.toString();
  };
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(null);
    void Promise.all([
      apiRequest<Summary>(`/api/dashboard/summary?${periodQuery()}`, { signal: controller.signal }),
      apiRequest<AppointmentRow[]>('/api/dashboard/upcoming?limit=10', { signal: controller.signal }),
    ]).then(([summaryResult, upcomingResult]) => { setSummary(summaryResult); setUpcoming(upcomingResult); }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof ApiClientError ? reason.message : 'Не удалось загрузить обзор'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [preset, timezone, refresh]);

  const label = { today: 'Этот день', week: 'Неделя', month: 'Месяц', quarter: 'Квартал' }[preset];
  const periodLabel = summary ? `${DateTime.fromISO(summary.period.from, { zone: summary.period.timezone }).setLocale('ru').toFormat('d')} – ${DateTime.fromISO(summary.period.to, { zone: summary.period.timezone }).setLocale('ru').toFormat('d MMMM yyyy')}` : '';
  return <main className="mx-auto w-full max-w-[1440px] px-5 py-6 md:px-8">
    <div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-xl font-semibold">Обзор</h1><div aria-label="Период" className="inline-flex rounded-md border border-neutral-200 bg-neutral-50 p-0.5" role="group">{(['today', 'week', 'month', 'quarter'] as const).map((item) => <button aria-pressed={preset === item} className={`h-7 min-h-7 rounded px-2.5 text-xs ${preset === item ? 'bg-neutral-0 font-medium text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`} key={item} onClick={() => setPreset(item)}>{item === 'today' ? 'День' : item === 'week' ? 'Неделя' : item === 'month' ? 'Месяц' : 'Квартал'}</button>)}</div></div>
    {periodLabel ? <p className="mt-1 text-[13px] text-neutral-500">{periodLabel} · {label}</p> : null}
    {loading ? <div aria-label="Загрузка показателей" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="h-20 animate-pulse rounded bg-neutral-100"/><div className="h-20 animate-pulse rounded bg-neutral-100"/><div className="h-20 animate-pulse rounded bg-neutral-100"/><div className="h-20 animate-pulse rounded bg-neutral-100"/></div> : null}
    {error ? <p className="mt-5 text-sm text-danger-fg" role="alert">{error}</p> : null}
    {summary ? <section aria-label="Ключевые показатели" className="mt-5 grid gap-2 border-b border-neutral-200 pb-4 sm:grid-cols-4 sm:divide-x sm:divide-neutral-200" data-testid="dashboard-kpis">
      <Metric title="Выручка" value={summary.revenue.netMinor} displayValue={money(summary.revenue.netMinor, summary.revenue.currency)} previous={summary.previous?.revenue.netMinor}/>
      <Metric title="Записи" value={summary.appointments.total} previous={summary.previous?.appointments.total}/>
      <Metric title="Отмены" value={summary.appointments.cancelled + summary.appointments.noShow} previous={summary.previous ? summary.previous.appointments.cancelled + summary.previous.appointments.noShow : undefined} reverseTone/>
      <Metric title="Новые клиенты" value={summary.newCustomers} previous={summary.previous?.newCustomers}/>
    </section> : null}
    <section className="mt-5 border-b border-neutral-200 pb-5" aria-label="График выручки">
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Выручка за период</h2><span className="text-xs text-neutral-500">{label}</span></div>
      <div className="mt-3 grid min-h-32 place-items-center rounded-md bg-neutral-50 text-center">
        <div><FontAwesomeIcon aria-hidden="true" className="size-7 text-neutral-600" icon={faChartLine}/><p className="mt-2 text-sm text-neutral-600">Пока нет данных за период</p></div>
      </div>
    </section>
    <section className="mt-5" aria-label="Ближайшие записи">
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Ближайшие записи</h2>{upcoming.length ? <Link className="text-xs font-medium text-neutral-600 hover:text-neutral-900" to="/app/calendar">Открыть календарь</Link> : null}</div>
      {upcoming.length ? <ul className="mt-2 divide-y divide-neutral-200">{upcoming.map((row) => <li key={row.id}><button className="grid min-h-14 w-full grid-cols-[60px_minmax(0,1fr)_auto] items-center gap-3 rounded-none px-2 text-left hover:bg-neutral-50 sm:grid-cols-[60px_minmax(0,1fr)_minmax(120px,auto)_auto]" onClick={() => setSelected(row.id)}>
        <time className="text-sm font-semibold tabular-nums" dateTime={row.startAt}>{appointmentTime(row.startAt, timezone)}</time>
        <span className="min-w-0"><span className="block truncate text-sm font-medium">{row.customer.firstName} {row.customer.lastName ?? ''}</span><span className="block truncate text-[13px] text-neutral-500">{row.service.name}</span></span>
        <span className="hidden truncate text-xs text-neutral-600 sm:block">{row.staff.displayName}</span>
        <span className="rounded border border-neutral-200 px-1.5 py-0.5 text-[11px] text-neutral-600">{statusLabels[row.status] ?? row.status}</span>
      </button></li>)}</ul> : <div className="mt-2 grid min-h-40 place-items-center border-t border-neutral-200 text-center">
        <div><FontAwesomeIcon aria-hidden="true" className="size-7 text-neutral-600" icon={faCalendarDays}/><p className="mt-2 text-sm text-neutral-600">Пока записей нет</p><Link className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md bg-primary-600 px-3 text-[13px] font-medium text-white hover:bg-primary-700" to="/app/calendar?create=1">Создать запись</Link></div>
      </div>}
    </section>
    {selected && summary ? <AppointmentDetailDialog id={selected} timezone={timezone} role={session.data?.active.role ?? 'owner'} permissions={session.data?.permissions ?? []} onClose={() => setSelected(null)} onChanged={() => setRefresh((value) => value + 1)}/> : null}
  </main>;
}

export function MyDayPage() {
  const [date, setDate] = useState('');
  const [data, setData] = useState<MasterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { const controller = new AbortController(); setError(null); const query = date ? `?date=${date}` : ''; void apiRequest<MasterData>(`/api/master/dashboard${query}`, { signal: controller.signal }).then((result) => setData(result)).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof ApiClientError ? reason.message : 'Не удалось загрузить день'); }); return () => controller.abort(); }, [date]);
  const timezone = useSession().data?.active.business.timezone ?? 'UTC';
  const rows = (items: AppointmentRow[]) => items.length ? <ul className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200">{items.map((row) => <li className="grid min-h-14 grid-cols-[60px_minmax(0,1fr)_auto] items-center gap-3 px-2 text-sm" key={row.id}><time className="font-semibold tabular-nums text-neutral-900" dateTime={row.startAt}>{appointmentTime(row.startAt, timezone)}</time><span className="min-w-0"><span className="block truncate font-medium">{row.customer.firstName} {row.customer.lastName ?? ''} · {row.service.name}</span><span className="block truncate text-xs text-neutral-500">{row.staff.displayName}</span></span><span className="text-xs text-neutral-600">{statusLabels[row.status] ?? row.status}</span></li>)}</ul> : <p className="mt-3 border-y border-neutral-200 py-8 text-center text-sm text-neutral-500">Записей нет.</p>;
  return <main className="mx-auto w-full max-w-[1440px] px-5 py-6 md:px-8"><div className="flex flex-wrap items-end justify-between gap-3"><h1 className="text-xl font-semibold">Мой день</h1><label className="grid gap-1 text-xs text-neutral-600">Дата<input className="h-8 rounded-md border border-neutral-200 bg-neutral-0 px-2 text-sm text-neutral-900" type="date" value={date || data?.date || DateTime.now().setZone(timezone).toISODate() || ''} onChange={(event) => setDate(event.target.value)}/></label></div>{error ? <p className="mt-4" role="alert">{error}</p> : null}
    {data ? <><section className="mt-5 grid gap-2 border-b border-neutral-200 pb-4 sm:grid-cols-4 sm:divide-x sm:divide-neutral-200"><Metric title="Записей сегодня" value={data.counts.todayTotal}/><Metric title="Завершено в этом месяце" value={data.counts.completedThisMonth}/><Metric title="Неявок в этом месяце" value={data.counts.noShowThisMonth} reverseTone/><Metric title="Загрузка дня" value={data.load.loadPercent ?? 0}/></section><section className="mt-6"><h2 className="text-sm font-semibold">Записи на дату</h2>{rows(data.today)}</section><section className="mt-6"><h2 className="text-sm font-semibold">Ближайшие 7 дней</h2>{rows(data.upcoming)}</section></> : <p className="mt-5 text-sm text-neutral-500" role="status">Загрузка дня…</p>}
  </main>;
}
