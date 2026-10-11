import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEllipsis } from '@fortawesome/free-solid-svg-icons';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { ApiClientError, apiRequest } from '@/lib/api-client';
import { formatMoneySafe } from '@/lib/format';
import { useSession } from '@/hooks/use-session';
import { AppointmentDetailDialog } from '@/components/data/AppointmentDialogs';

interface AppointmentRow {
  id: string;
  customer: { firstName: string; lastName?: string };
  staff: { id: string; displayName: string };
  service: { name: string };
  startAt: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  source: 'internal' | 'public';
  serviceSnapshot?: { priceMinor?: number; currency?: string };
}

const statusLabels: Record<AppointmentRow['status'], string> = { pending: 'Ожидает', confirmed: 'Подтверждена', completed: 'Завершена', cancelled: 'Отменена', no_show: 'Неявка' };
const statusClasses: Record<AppointmentRow['status'], string> = { pending: 'border border-warning-fg/20 bg-warning-bg text-warning-fg', confirmed: 'border border-primary-600/20 bg-primary-50 text-primary-800', completed: 'border border-success-fg/20 bg-success-bg text-success-fg', cancelled: 'border border-neutral-200 bg-neutral-100 text-neutral-600', no_show: 'border border-danger-fg/20 bg-danger-bg text-danger-fg' };

export function AppointmentsPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const timezone = session.data?.active.business.timezone ?? 'UTC';
  const businessId = session.data?.active.businessId ?? '';
  const isMaster = session.data?.active.role === 'master';
  const [status, setStatus] = useState('');
  const [staffId, setStaffId] = useState('');
  const [source, setSource] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const appointmentsQuery = useQuery({
    queryKey: ['appointments', 'list', businessId, session.data?.active.role, session.data?.active.staffId ?? null, { status, staffId, source, from, to, timezone }],
    enabled: Boolean(businessId),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ limit: '100' });
      if (status) params.set('status', status);
      if (staffId && !isMaster) params.set('staffId', staffId);
      if (source) params.set('source', source);
      if (from) params.set('from', DateTime.fromISO(from, { zone: timezone }).startOf('day').toUTC().toISO() ?? '');
      if (to) params.set('to', DateTime.fromISO(to, { zone: timezone }).plus({ days: 1 }).startOf('day').toUTC().toISO() ?? '');
      const [appointments, staff] = await Promise.all([
        apiRequest<AppointmentRow[]>(`/api/appointments?${params}`, { signal }),
        isMaster ? Promise.resolve([] as { id: string; displayName: string }[]) : apiRequest<{ id: string; displayName: string }[]>('/api/staff?limit=100', { signal }),
      ]);
      return { appointments, staff };
    },
    staleTime: 15_000,
    gcTime: 5 * 60_000,
  });
  const rows = appointmentsQuery.data?.appointments ?? [];
  const staff = appointmentsQuery.data?.staff ?? [];
  const error = appointmentsQuery.error ? appointmentsQuery.error instanceof ApiClientError ? appointmentsQuery.error.message : 'Не удалось загрузить записи.' : null;
  const loading = appointmentsQuery.isPending;

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru');
    return rows.filter((row) => !normalized || `${row.customer.firstName} ${row.customer.lastName ?? ''} ${row.service.name} ${row.staff.displayName}`.toLocaleLowerCase('ru').includes(normalized));
  }, [rows, query]);
  const grouped = useMemo(() => {
    const groups = new Map<string, AppointmentRow[]>();
    for (const row of visible) {
      const date = DateTime.fromISO(row.startAt).setZone(timezone).toISODate() ?? '';
      groups.set(date, [...(groups.get(date) ?? []), row]);
    }
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [visible, timezone]);
  const canCreatePayment = session.data?.permissions.includes('payments:create') ?? false;

  return <main className="mx-auto w-full max-w-[1440px] px-5 py-6 md:px-8">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">Записи</h1><p className="mt-1 text-[13px] text-neutral-500">Расписание визитов по дням</p></div><span className="text-xs tabular-nums text-neutral-500">{visible.length} записей</span></div>
    <section aria-label="Фильтры записей" className="mt-5 flex flex-wrap items-end gap-2 border-b border-neutral-200 pb-4">
      <label className="grid gap-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Поиск<input aria-label="Поиск записей" className="h-8 w-56 rounded-md border border-neutral-200 bg-neutral-0 px-2.5 text-sm normal-case tracking-normal text-neutral-900" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Клиент, услуга или мастер"/></label>
      <label className="grid gap-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Статус<select aria-label="Статус" className="h-8 rounded-md border border-neutral-200 bg-neutral-0 px-2 text-sm normal-case tracking-normal text-neutral-900" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Все</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {session.data?.active.role !== 'master' ? <label className="grid gap-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Мастер<select aria-label="Мастер" className="h-8 rounded-md border border-neutral-200 bg-neutral-0 px-2 text-sm normal-case tracking-normal text-neutral-900" value={staffId} onChange={(event) => setStaffId(event.target.value)}><option value="">Все</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label> : null}
      <label className="grid gap-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Источник<select aria-label="Источник" className="h-8 rounded-md border border-neutral-200 bg-neutral-0 px-2 text-sm normal-case tracking-normal text-neutral-900" value={source} onChange={(event) => setSource(event.target.value)}><option value="">Все</option><option value="internal">Вручную</option><option value="public">Онлайн</option></select></label>
      <label className="grid gap-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">С даты<input aria-label="С даты" className="h-8 rounded-md border border-neutral-200 bg-neutral-0 px-2 text-sm normal-case tracking-normal text-neutral-900" type="date" value={from} onChange={(event) => setFrom(event.target.value)}/></label>
      <label className="grid gap-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">По дату<input aria-label="По дату" className="h-8 rounded-md border border-neutral-200 bg-neutral-0 px-2 text-sm normal-case tracking-normal text-neutral-900" type="date" value={to} onChange={(event) => setTo(event.target.value)}/></label>
    </section>
    {error ? <p className="mt-4 rounded-md border border-danger-solid/30 bg-danger-bg p-3 text-sm text-danger-fg" role="alert">{error}</p> : null}
    <div aria-label="Таблица записей" className="mt-4 hidden overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-0 min-[1280px]:block" role="region" tabIndex={0}>
      <table className="w-full min-w-[760px] border-collapse text-left text-[13px]"><thead><tr className="h-10 border-b border-neutral-200 bg-neutral-50 text-[11px] font-medium uppercase tracking-wide text-neutral-500"><th className="w-28 px-3">Время</th><th className="px-3">Клиент</th><th className="px-3">Услуга</th><th className="px-3">Мастер</th><th className="px-3 text-right">Сумма</th><th className="px-3">Статус</th><th className="w-12 px-2"><span className="sr-only">Действия</span></th></tr></thead>
        {grouped.map(([date, appointments]) => <tbody key={date}><tr className="h-9 border-b border-neutral-200 bg-neutral-50"><th colSpan={7} className="px-3 text-xs font-semibold text-neutral-700">{DateTime.fromISO(date, { zone: timezone }).setLocale('ru').toFormat('dd.LL · ccc')}</th></tr>{appointments.map((row) => <tr key={row.id} className="h-[52px] border-b border-neutral-100 hover:bg-neutral-50"><td className="px-3 tabular-nums text-neutral-600">{DateTime.fromISO(row.startAt).setZone(timezone).toFormat('HH:mm')}</td><td className="px-3"><button className="text-left font-medium text-neutral-900 hover:underline" onClick={() => setSelected(row.id)}>{row.customer.firstName} {row.customer.lastName ?? ''}</button></td><td className="px-3 text-neutral-700">{row.service.name}</td><td className="px-3 text-neutral-600">{row.staff.displayName}</td><td className="px-3 text-right tabular-nums">{formatMoneySafe(row.serviceSnapshot?.priceMinor, row.serviceSnapshot?.currency)}</td><td className="px-3"><span className={`inline-flex rounded px-2 py-1 text-[11px] font-medium ${statusClasses[row.status]}`}>{statusLabels[row.status]}</span></td><td className="px-2"><details className="relative"><summary aria-label={`Действия: ${row.customer.firstName} ${row.customer.lastName ?? ''} · ${row.service.name} · ${DateTime.fromISO(row.startAt).setZone(timezone).toFormat('HH:mm')}`} className="grid size-8 cursor-pointer list-none place-items-center rounded hover:bg-neutral-100"><FontAwesomeIcon aria-hidden="true" className="size-3.5 text-neutral-500" icon={faEllipsis}/></summary><div className="absolute right-0 top-full z-10 grid min-w-40 gap-1 rounded-md border border-neutral-200 bg-neutral-0 p-1 shadow-sm"><button className="rounded px-2 py-1.5 text-left hover:bg-neutral-50" onClick={() => setSelected(row.id)}>Открыть запись</button>{canCreatePayment && row.status !== 'cancelled' ? <Link className="rounded px-2 py-1.5 hover:bg-neutral-50" to={`/app/payments?appointmentId=${encodeURIComponent(row.id)}`}>Принять оплату</Link> : null}</div></details></td></tr>)}</tbody>)}
        {loading ? <tbody><tr><td colSpan={7} className="py-16 text-center text-sm text-neutral-500" role="status">Загружаем записи…</td></tr></tbody> : null}
        {!loading && grouped.length === 0 ? <tbody><tr><td colSpan={7} className="py-16 text-center text-sm text-neutral-500">Записей по выбранным фильтрам нет.</td></tr></tbody> : null}
      </table>
    </div>
    <div aria-label="Карточки записей" className="mt-4 grid gap-4 min-[1280px]:hidden" role="region">
      {loading ? <p className="rounded-lg border border-neutral-200 bg-neutral-0 px-4 py-10 text-center text-sm text-neutral-500" role="status">Загружаем записи…</p> : null}
      {!loading && grouped.length === 0 ? <p className="rounded-lg border border-neutral-200 bg-neutral-0 px-4 py-10 text-center text-sm text-neutral-500">Записей по выбранным фильтрам нет.</p> : null}
      {!loading ? grouped.map(([date, appointments]) => <section aria-labelledby={`appointment-date-${date}`} className="min-w-0" key={date}>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500" id={`appointment-date-${date}`}>{DateTime.fromISO(date, { zone: timezone }).setLocale('ru').toFormat('dd.LL · cccc')}</h2>
        <ul className="grid gap-2">{appointments.map((row) => {
          const customerName = `${row.customer.firstName} ${row.customer.lastName ?? ''}`.trim();
          const appointmentTime = DateTime.fromISO(row.startAt).setZone(timezone).toFormat('HH:mm');
          const amount = formatMoneySafe(row.serviceSnapshot?.priceMinor, row.serviceSnapshot?.currency);
          return <li key={row.id}><article aria-label={`Запись: ${customerName} · ${row.service.name}`} className="grid min-w-0 gap-3 rounded-lg border border-neutral-200 bg-neutral-0 p-3 shadow-sm sm:p-4">
            <div className="flex min-w-0 items-start justify-between gap-3"><button className="min-w-0 truncate text-left text-sm font-semibold text-neutral-900 hover:underline" onClick={() => setSelected(row.id)}>{customerName}</button><span className={`inline-flex shrink-0 rounded px-2 py-1 text-[11px] font-medium ${statusClasses[row.status]}`}>{statusLabels[row.status]}</span></div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-y border-neutral-100 py-3 text-xs">
              <div><dt className="text-neutral-500">Время</dt><dd className="mt-0.5 tabular-nums">{appointmentTime}</dd></div>
              <div><dt className="text-neutral-500">Мастер</dt><dd className="mt-0.5 break-words">{row.staff.displayName}</dd></div>
              <div className="col-span-2"><dt className="text-neutral-500">Услуга</dt><dd className="mt-0.5 break-words">{row.service.name}</dd></div>
              <div><dt className="text-neutral-500">Стоимость</dt><dd className="mt-0.5 font-semibold tabular-nums">{amount}</dd></div>
              <div><dt className="text-neutral-500">Источник</dt><dd className="mt-0.5">{row.source === 'public' ? 'Онлайн-запись' : 'Вручную'}</dd></div>
            </dl>
            <div className="flex flex-wrap gap-2"><Button size="small" onClick={() => setSelected(row.id)} variant="secondary">Подробнее</Button>{canCreatePayment && row.status !== 'cancelled' ? <Link className="inline-flex h-8 items-center rounded-md bg-primary-600 px-3 text-[13px] font-medium text-on-accent hover:bg-primary-700" to={`/app/payments?appointmentId=${encodeURIComponent(row.id)}`}>Принять оплату</Link> : null}</div>
          </article></li>;
        })}</ul>
      </section>) : null}
    </div>
    {selected ? <AppointmentDetailDialog id={selected} timezone={timezone} role={session.data?.active.role ?? 'owner'} permissions={session.data?.permissions ?? []} onClose={() => setSelected(null)} onChanged={() => { void queryClient.invalidateQueries({ queryKey: ['appointments', 'list', businessId] }); void queryClient.invalidateQueries({ queryKey: ['calendar', businessId] }); }}/> : null}
  </main>;
}
