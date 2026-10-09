import { useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowDown, faArrowUp, faCalendarDays, faChartLine, faUsers, faWallet } from '@fortawesome/free-solid-svg-icons';
import { Link } from 'react-router';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ApiClientError, apiRequest } from '@/lib/api-client';
import { useSession } from '@/hooks/use-session';
import { AppointmentDetailDialog } from '@/components/data/AppointmentDialogs';
import { Badge } from '@/components/ui/badge';

interface AppointmentRow { id: string; customer: { firstName: string; lastName?: string }; staff: { displayName: string }; service: { name: string }; serviceSnapshot?: { priceMinor: number }; startAt: string; status: string; }
interface Summary { period: { from: string; to: string; timezone: string }; revenue: { grossMinor: number; refundedMinor: number; netMinor: number; currency: string }; appointments: { total: number; cancelled: number; noShow: number }; newCustomers: number; previous?: { revenue: { netMinor: number }; appointments: { total: number; cancelled: number; noShow: number }; newCustomers: number }; }
interface RevenuePoint { month: string; netMinor: number; }
interface MasterData { date: string; today: AppointmentRow[]; upcoming: AppointmentRow[]; counts: { todayTotal: number; completedThisMonth: number; noShowThisMonth: number }; load: { bookedMinutes: number; availableMinutes: number; loadPercent: number | null }; }

const money = (minor: number, currency: string) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);
const appointmentTime = (value: string, timezone: string) => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(new Date(value));
const statusLabels: Record<string, string> = { pending: 'Ожидает', confirmed: 'Подтверждена', completed: 'Завершена', cancelled: 'Отменена', no_show: 'Неявка' };

function Metric({ title, value, displayValue, compactDisplayValue, previous, reverseTone = false }: { title: string; value: number; displayValue?: string; compactDisplayValue?: string; previous?: number | undefined; reverseTone?: boolean }) {
  const delta = previous === undefined ? null : value - previous;
  const percent = previous === undefined ? null : previous === 0 ? (value === 0 ? 0 : null) : Math.round(((value - previous) / previous) * 100);
  const positive = delta === null ? false : reverseTone ? delta < 0 : delta > 0;
  const negative = delta === null ? false : reverseTone ? delta > 0 : delta < 0;
  const icon = title.toLocaleLowerCase('ru-RU').includes('выруч') ? faWallet : title.toLocaleLowerCase('ru-RU').includes('клиент') ? faUsers : title.toLocaleLowerCase('ru-RU').includes('отмен') || title.toLocaleLowerCase('ru-RU').includes('неяв') ? faArrowDown : title.toLocaleLowerCase('ru-RU').includes('загруз') ? faChartLine : faCalendarDays;
  return <article className="metric-card min-w-0 rounded-xl border border-neutral-200 bg-neutral-0 px-5 py-4" aria-label={title}>
    <div className="flex items-center justify-between gap-3"><h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-neutral-500">{title}</h2><span aria-hidden="true" className="metric-icon"><FontAwesomeIcon className="size-3.5" icon={icon}/></span></div>
    <p aria-label={displayValue ?? value.toLocaleString('ru-RU')} className="mt-2 min-w-0 whitespace-nowrap text-[22px] font-semibold leading-7 tracking-tight tabular-nums text-neutral-900 sm:text-[28px] sm:leading-8" title={displayValue}>
      {compactDisplayValue ? <><span className="sm:hidden">{compactDisplayValue}</span><span className="hidden sm:inline">{displayValue ?? value.toLocaleString('ru-RU')}</span></> : displayValue ?? value.toLocaleString('ru-RU')}
    </p>
    <p className={`mt-1 flex items-center gap-1 text-xs ${positive ? 'text-success-fg' : negative ? 'text-danger-fg' : 'text-neutral-500'}`}>
      {delta !== null && delta !== 0 ? <FontAwesomeIcon aria-hidden="true" className="size-3" icon={positive ? faArrowUp : faArrowDown}/> : null}
      {percent === null ? null : `${percent > 0 ? '+' : ''}${percent}% к прошлому`}
    </p>
  </article>;
}

export function DashboardPage() {
  const session = useSession();
  const [preset, setPreset] = useState<'today' | 'week' | 'month' | 'quarter'>('month');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenueTrend, setRevenueTrend] = useState<RevenuePoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const [upcoming, setUpcoming] = useState<AppointmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const timezone = session.data?.active.business.timezone ?? 'UTC';
  const currency = session.data?.active.business.currency ?? 'KGS';
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

  useEffect(() => {
    const controller = new AbortController();
    const currentMonth = DateTime.now().setZone(timezone).startOf('month');
    const months = Array.from({ length: 8 }, (_, index) => currentMonth.minus({ months: 7 - index }));
    setTrendLoading(true);
    void Promise.all(months.map((month) => {
      const query = new URLSearchParams({
        from: month.toISODate() ?? '',
        to: month.endOf('month').toISODate() ?? '',
      });
      return apiRequest<Summary>(`/api/dashboard/summary?${query.toString()}`, { signal: controller.signal });
    })).then((results) => {
      setRevenueTrend(results.map((result, index) => ({
        month: months[index]?.setLocale('ru').toFormat('LLL') ?? '',
        netMinor: result.revenue.netMinor,
      })));
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof ApiClientError ? reason.message : 'Не удалось загрузить выручку по месяцам');
    }).finally(() => {
      if (!controller.signal.aborted) setTrendLoading(false);
    });
    return () => controller.abort();
  }, [timezone, refresh]);

  const label = { today: 'Этот день', week: 'Неделя', month: 'Месяц', quarter: 'Квартал' }[preset];
  const periodLabel = summary ? `${DateTime.fromISO(summary.period.from, { zone: summary.period.timezone }).setLocale('ru').toFormat('d')} – ${DateTime.fromISO(summary.period.to, { zone: summary.period.timezone }).setLocale('ru').toFormat('d MMMM yyyy')}` : '';
  return <main className="mx-auto w-full max-w-[1440px] px-5 py-6 md:px-8">
    <div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold">Обзор</h1><div aria-label="Период" className="inline-flex rounded-md border border-neutral-200 bg-neutral-50 p-0.5" role="group">{(['today', 'week', 'month', 'quarter'] as const).map((item) => <button aria-pressed={preset === item} className={`h-8 min-h-8 rounded px-2.5 text-xs ${preset === item ? 'bg-neutral-0 font-medium text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`} key={item} onClick={() => setPreset(item)}>{item === 'today' ? 'День' : item === 'week' ? 'Неделя' : item === 'month' ? 'Месяц' : 'Квартал'}</button>)}</div></div>
    {periodLabel ? <p className="mt-1 text-[13px] text-neutral-500">{periodLabel} · {label}</p> : null}
    {loading ? <div role="status" aria-label="Загрузка показателей" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div aria-hidden="true" className="h-24 animate-pulse rounded-lg border border-neutral-200 bg-neutral-0" key={index}/>)}</div> : null}
    {error ? <p className="mt-5 text-sm text-danger-fg" role="alert">{error}</p> : null}
    {summary ? <section aria-label="Ключевые показатели" className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4" data-testid="dashboard-kpis">
      <Metric title="Выручка" value={summary.revenue.netMinor} displayValue={money(summary.revenue.netMinor, summary.revenue.currency)} compactDisplayValue={new Intl.NumberFormat('ru-RU', { style: 'currency', currency: summary.revenue.currency, currencyDisplay: 'code', notation: 'compact', maximumFractionDigits: 1 }).format(summary.revenue.netMinor / 100)} previous={summary.previous?.revenue.netMinor}/>
      <Metric title="Записи" value={summary.appointments.total} previous={summary.previous?.appointments.total}/>
      <Metric title="Отмены" value={summary.appointments.cancelled + summary.appointments.noShow} previous={summary.previous ? summary.previous.appointments.cancelled + summary.previous.appointments.noShow : undefined} reverseTone/>
      <Metric title="Новые клиенты" value={summary.newCustomers} previous={summary.previous?.newCustomers}/>
    </section> : null}
    {summary ? <section className="mt-5 rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm" aria-label="График выручки">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">Выручка</h2><p className="mt-0.5 text-xs text-neutral-500">Последние 8 месяцев</p></div><Badge>Нетто {money(summary.revenue.netMinor, summary.revenue.currency)}</Badge></div>
      {trendLoading ? <div aria-label="Загрузка выручки по месяцам" className="mt-4 h-56 animate-pulse rounded-md bg-neutral-50"/> : revenueTrend.some((point) => point.netMinor !== 0) ? <div className="mt-4 h-56 w-full" aria-label="Выручка по месяцам">
        <ResponsiveContainer width="100%" height="100%"><LineChart data={revenueTrend} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" vertical={false}/><XAxis axisLine={false} dataKey="month" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} tickLine={false}/><YAxis axisLine={false} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} tickFormatter={(value: number) => new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(value / 100)} tickLine={false} width={42}/><Tooltip formatter={(value) => money(Number(value), summary.revenue.currency)}/><Line activeDot={{ r: 3 }} dataKey="netMinor" dot={false} isAnimationActive={false} stroke="var(--color-primary-600)" strokeWidth={2} type="monotone"/>
        </LineChart></ResponsiveContainer>
      </div> : <div className="mt-4 grid h-56 place-items-center rounded-md bg-neutral-50 text-center"><div><FontAwesomeIcon aria-hidden="true" className="size-7 text-neutral-600" icon={faChartLine}/><p className="mt-2 text-sm text-neutral-600">Пока нет оплат за последние месяцы</p></div></div>}
    </section> : null}
    <section className="mt-5" aria-label="Ближайшие записи">
      <div className="flex items-center justify-between"><h2 className="text-base font-semibold">Ближайшие записи</h2>{upcoming.length ? <Link className="text-xs font-medium text-primary-700 hover:text-primary-800" to="/app/calendar">Открыть календарь</Link> : null}</div>
      {upcoming.length ? <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-0"><table className="w-full min-w-[680px] border-collapse text-left text-[13px]"><caption className="sr-only">Ближайшие записи</caption><thead><tr className="h-10 border-b border-neutral-200 bg-neutral-50 text-xs font-medium uppercase tracking-[0.05em] text-neutral-500"><th className="px-4" scope="col">Время</th><th className="px-4" scope="col">Клиент</th><th className="px-4" scope="col">Услуга</th><th className="px-4" scope="col">Мастер</th><th className="px-4 text-right" scope="col">Сумма</th></tr></thead><tbody>{upcoming.map((row) => <tr className="h-14 border-b border-neutral-100 last:border-0 hover:bg-neutral-50" key={row.id}><td className="px-4"><button className="font-medium tabular-nums text-neutral-900 hover:text-primary-700" onClick={() => setSelected(row.id)}><time dateTime={row.startAt}>{appointmentTime(row.startAt, timezone)}</time></button></td><td className="px-4"><span className="flex items-center gap-2 font-medium"><span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-[10px] font-semibold text-neutral-700">{`${row.customer.firstName.charAt(0)}${row.customer.lastName?.charAt(0) ?? ''}`}</span><span className="truncate">{row.customer.firstName} {row.customer.lastName ?? ''}</span></span></td><td className="px-4 text-neutral-600">{row.service.name}</td><td className="px-4"><span className="inline-flex rounded px-2 py-0.5 text-[11px] font-medium text-master-badge-fg bg-master-badge">{row.staff.displayName}</span></td><td className="px-4 text-right font-semibold tabular-nums">{typeof row.serviceSnapshot?.priceMinor === 'number' ? money(row.serviceSnapshot.priceMinor, currency) : '—'}</td></tr>)}</tbody></table></div> : <div className="mt-3 grid min-h-40 place-items-center rounded-lg border border-neutral-200 bg-neutral-0 text-center"><div><FontAwesomeIcon aria-hidden="true" className="size-7 text-neutral-600" icon={faCalendarDays}/><p className="mt-2 text-sm text-neutral-600">Пока записей нет</p><Link className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md bg-primary-600 px-3 text-[13px] font-medium text-on-accent hover:bg-primary-700" to="/app/calendar?create=1">Создать запись</Link></div></div>}
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
  return <main className="mx-auto w-full max-w-[1440px] px-5 py-6 md:px-8"><div className="flex flex-wrap items-end justify-between gap-3"><h1 className="text-2xl font-semibold">Мой день</h1><label className="grid gap-1 text-xs text-neutral-600">Дата<input className="h-9 rounded-md border border-neutral-200 bg-neutral-0 px-2 text-sm text-neutral-900" type="date" value={date || data?.date || DateTime.now().setZone(timezone).toISODate() || ''} onChange={(event) => setDate(event.target.value)}/></label></div>{error ? <p className="mt-4" role="alert">{error}</p> : null}
    {data ? <><section className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric title="Записей сегодня" value={data.counts.todayTotal}/><Metric title="Завершено в этом месяце" value={data.counts.completedThisMonth}/><Metric title="Неявок в этом месяце" value={data.counts.noShowThisMonth} reverseTone/><Metric title="Загрузка дня" value={data.load.loadPercent ?? 0} displayValue={data.load.loadPercent === null ? '—' : `${data.load.loadPercent}%`}/></section><section className="mt-6 rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm"><h2 className="text-base font-semibold">Записи на дату</h2>{rows(data.today)}</section><section className="mt-4 rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm"><h2 className="text-base font-semibold">Ближайшие 7 дней</h2>{rows(data.upcoming)}</section></> : <p className="mt-5 text-sm text-neutral-500" role="status">Загрузка дня…</p>}
  </main>;
}
