import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useEffect, useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEllipsis } from '@fortawesome/free-solid-svg-icons';
import { Link } from 'react-router';
import { ApiClientError, apiRequest } from '@/lib/api-client';
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
  serviceSnapshot: { priceMinor: number; currency: string };
}
const statusLabels: Record<AppointmentRow['status'], string> = { pending: 'Ожидает', confirmed: 'Подтверждена', completed: 'Завершена', cancelled: 'Отменена', no_show: 'Неявка' };
const statusClasses: Record<AppointmentRow['status'], string> = { pending: 'border border-warning-fg/20 bg-warning-bg text-warning-fg', confirmed: 'border border-primary-600/20 bg-primary-50 text-primary-800', completed: 'border border-success-fg/20 bg-success-bg text-success-fg', cancelled: 'border border-neutral-200 bg-neutral-100 text-neutral-600', no_show: 'border border-danger-fg/20 bg-danger-bg text-danger-fg' };
export function AppointmentsPage() {
  const session = useSession();
  const timezone = session.data?.active.business.timezone ?? 'UTC';
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [staff, setStaff] = useState<{ id: string; displayName: string }[]>([]);
  const [status, setStatus] = useState('');
  const [staffId, setStaffId] = useState('');
  const [source, setSource] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ limit: '100' });
    if (status) params.set('status', status);
    if (staffId) params.set('staffId', staffId);
    if (source) params.set('source', source);
    if (from) params.set('from', DateTime.fromISO(from, { zone: timezone }).startOf('day').toUTC().toISO() ?? '');
    if (to) params.set('to', DateTime.fromISO(to, { zone: timezone }).plus({ days: 1 }).startOf('day').toUTC().toISO() ?? '');
    void Promise.all([
      apiRequest<AppointmentRow[]>(`/api/appointments?${params}`, { signal: controller.signal }),
      apiRequest<{ id: string; displayName: string }[]>('/api/staff?limit=100', { signal: controller.signal }),
    ]).then(([appointments, members]) => { setRows(appointments); setStaff(members); setError(null); }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof ApiClientError ? reason.message : 'Не удалось загрузить записи.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [status, staffId, source, from, to, timezone, refresh]);
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
      <Label className="grid gap-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Поиск<Input aria-label="Поиск записей" className="h-8 w-56 rounded-md border border-neutral-200 bg-neutral-0 px-2.5 text-sm normal-case tracking-normal text-neutral-900" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Клиент, услуга или мастер"/></Label>
      <Label className="grid gap-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Статус<NativeSelect aria-label="Статус" className="h-8 rounded-md border border-neutral-200 bg-neutral-0 px-2 text-sm normal-case tracking-normal text-neutral-900" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Все</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelect></Label>
      {session.data?.active.role !== 'master' ? <Label className="grid gap-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Мастер<NativeSelect aria-label="Мастер" className="h-8 rounded-md border border-neutral-200 bg-neutral-0 px-2 text-sm normal-case tracking-normal text-neutral-900" value={staffId} onChange={(event) => setStaffId(event.target.value)}><option value="">Все</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</NativeSelect></Label> : null}
      <Label className="grid gap-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Источник<NativeSelect aria-label="Источник" className="h-8 rounded-md border border-neutral-200 bg-neutral-0 px-2 text-sm normal-case tracking-normal text-neutral-900" value={source} onChange={(event) => setSource(event.target.value)}><option value="">Все</option><option value="internal">Вручную</option><option value="public">Онлайн</option></NativeSelect></Label>
      <Label className="grid gap-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">С даты<Input aria-label="С даты" className="h-8 rounded-md border border-neutral-200 bg-neutral-0 px-2 text-sm normal-case tracking-normal text-neutral-900" type="date" value={from} onChange={(event) => setFrom(event.target.value)}/></Label>
      <Label className="grid gap-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">По дату<Input aria-label="По дату" className="h-8 rounded-md border border-neutral-200 bg-neutral-0 px-2 text-sm normal-case tracking-normal text-neutral-900" type="date" value={to} onChange={(event) => setTo(event.target.value)}/></Label>
    </section>
    {error ? <p className="mt-4 rounded-md border border-danger-solid/30 bg-danger-bg p-3 text-sm text-danger-fg" role="alert">{error}</p> : null}
    <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-0">
      <table className="w-full min-w-[760px] border-collapse text-left text-[13px]"><thead><tr className="h-10 border-b border-neutral-200 bg-neutral-50 text-[11px] font-medium uppercase tracking-wide text-neutral-500"><th className="w-28 px-3">Время</th><th className="px-3">Клиент</th><th className="px-3">Услуга</th><th className="px-3">Мастер</th><th className="px-3 text-right">Сумма</th><th className="px-3">Статус</th><th className="w-12 px-2"><span className="sr-only">Действия</span></th></tr></thead>
        {grouped.map(([date, appointments]) => <tbody key={date}><tr className="h-9 border-b border-neutral-200 bg-neutral-50"><th colSpan={7} className="px-3 text-xs font-semibold text-neutral-700">{DateTime.fromISO(date, { zone: timezone }).setLocale('ru').toFormat('dd.LL · ccc')}</th></tr>{appointments.map((row) => <tr key={row.id} className="h-[52px] border-b border-neutral-100 hover:bg-neutral-50"><td className="px-3 tabular-nums text-neutral-600">{DateTime.fromISO(row.startAt).setZone(timezone).toFormat('HH:mm')}</td><td className="px-3"><Button className="text-left font-medium text-neutral-900 hover:underline" onClick={() => setSelected(row.id)}>{row.customer.firstName} {row.customer.lastName ?? ''}</Button></td><td className="px-3 text-neutral-700">{row.service.name}</td><td className="px-3 text-neutral-600">{row.staff.displayName}</td><td className="px-3 text-right tabular-nums">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: row.serviceSnapshot.currency, maximumFractionDigits: 0 }).format(row.serviceSnapshot.priceMinor / 100)}</td><td className="px-3"><span className={`inline-flex rounded px-2 py-1 text-[11px] font-medium ${statusClasses[row.status]}`}>{statusLabels[row.status]}</span></td><td className="px-2"><details className="relative"><summary aria-label={`Действия: ${row.customer.firstName}`} className="grid size-8 cursor-pointer list-none place-items-center rounded hover:bg-neutral-100"><FontAwesomeIcon aria-hidden="true" className="size-3.5 text-neutral-500" icon={faEllipsis}/></summary><div className="absolute right-0 top-full z-10 grid min-w-40 gap-1 rounded-md border border-neutral-200 bg-neutral-0 p-1 shadow-sm"><Button className="rounded px-2 py-1.5 text-left hover:bg-neutral-50" onClick={() => setSelected(row.id)}>Открыть запись</Button>{canCreatePayment && row.status !== 'cancelled' ? <Link className="rounded px-2 py-1.5 hover:bg-neutral-50" to={`/app/payments?appointmentId=${encodeURIComponent(row.id)}`}>Принять оплату</Link> : null}</div></details></td></tr>)}</tbody>)}
        {loading ? <tbody><tr><td colSpan={7} className="py-16 text-center text-sm text-neutral-500" role="status">Загружаем записи…</td></tr></tbody> : null}
        {!loading && grouped.length === 0 ? <tbody><tr><td colSpan={7} className="py-16 text-center text-sm text-neutral-500">Записей по выбранным фильтрам нет.</td></tr></tbody> : null}
      </table>
    </div>
    {selected ? <AppointmentDetailDialog id={selected} timezone={timezone} role={session.data?.active.role ?? 'owner'} permissions={session.data?.permissions ?? []} onClose={() => setSelected(null)} onChanged={() => setRefresh((value) => value + 1)}/> : null}
  </main>;