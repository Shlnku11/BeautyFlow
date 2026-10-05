import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { apiRequest, ApiClientError } from '@/lib/api-client';
import { formatDateTime, formatMoney } from '@/lib/format';

interface PaymentRow {
  id: string; appointmentId: string; customerId: string; staffId: string; amountMinor: number; refundedMinor: number;
  currency: string; method: 'cash' | 'card' | 'transfer' | 'online'; status: 'pending' | 'paid' | 'refunded' | 'cancelled';
  paidAt?: string; notes?: string; createdBy: { id: string; name: string }; createdAt: string;
}
interface AppointmentRow {
  id: string; customer: { id: string; firstName: string; lastName?: string }; staff: { id: string; displayName: string };
  service: { name: string }; startAt: string; status: string; payment?: { balanceMinor: number };
}
interface PaymentsEnvelope { data: PaymentRow[]; meta: { total: number; page: number; limit: number; totals: { paidMinor: number; refundedMinor: number } } }
type Operation = 'create' | 'refund' | null;

const methodNames = { cash: 'Наличные', card: 'Карта', transfer: 'Перевод', online: 'Онлайн' };
const statusNames = { pending: 'Ожидает оплаты', paid: 'Оплачено', refunded: 'Возвращено', cancelled: 'Отменено' };

function majorToMinor(value: string): number {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new RangeError('Введите сумму с точностью до копеек');
  const minor = BigInt(match[1] ?? '0') * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Сумма вне допустимого диапазона');
  return Number(minor);
}

function minorToMajor(value: number): string {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}

async function fetchPayments(url: string): Promise<PaymentsEnvelope> {
  const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = typeof payload === 'object' && payload !== null && 'error' in payload ? payload.error : undefined;
    throw new ApiClientError(typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'INTERNAL', response.status, typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' ? error.message : 'Не удалось загрузить оплаты');
  }
  if (typeof payload !== 'object' || payload === null || !('data' in payload) || !Array.isArray(payload.data) || !('meta' in payload)) throw new Error('Некорректный ответ API оплат');
  return payload as PaymentsEnvelope;
}

export function PaymentsPage() {
  const location = useLocation();
  const presetAppointmentId = useMemo(() => new URLSearchParams(location.search).get('appointmentId') ?? '', [location.search]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [details, setDetails] = useState<Record<string, AppointmentRow>>({});
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [currency, setCurrency] = useState('KGS');
  const [meta, setMeta] = useState<PaymentsEnvelope['meta'] | null>(null);
  const [filters, setFilters] = useState({ from: '', to: '', method: '', status: '', staffId: '', customerId: '', q: '' });
  const [operation, setOperation] = useState<Operation>(null);
  const [activePayment, setActivePayment] = useState<PaymentRow | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState(presetAppointmentId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const params = new URLSearchParams({ page: '1', limit: '100' });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    try {
      setError(null);
      const result = await fetchPayments(`/api/payments?${params}`);
      setPayments(result.data);
      setMeta(result.meta);
      const resolved = await Promise.all(result.data.map(async (row) => {
        try { return [row.appointmentId, await apiRequest<AppointmentRow>(`/api/appointments/${row.appointmentId}`)] as const; }
        catch { return null; }
      }));
      setDetails(Object.fromEntries(resolved.filter((item): item is readonly [string, AppointmentRow] => item !== null)));
    } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : 'Не удалось загрузить оплаты'); }
  }

  useEffect(() => { void reload(); }, [filters.from, filters.to, filters.method, filters.status, filters.staffId, filters.customerId, filters.q]);
  useEffect(() => {
    void apiRequest<AppointmentRow[]>('/api/appointments?page=1&limit=100').then(setAppointments).catch(() => setAppointments([]));
    void apiRequest<{ business: { currency: string } }>('/api/settings').then((settings) => setCurrency(settings.business.currency)).catch(() => undefined);
  }, []);
  useEffect(() => {
    setSelectedAppointmentId(presetAppointmentId);
    if (presetAppointmentId) {
      setOperation('create');
      void apiRequest<AppointmentRow>(`/api/appointments/${presetAppointmentId}`).then((appointment) => setAppointments((rows) => rows.some((row) => row.id === appointment.id) ? rows : [appointment, ...rows])).catch(() => undefined);
    }
  }, [presetAppointmentId]);

  const staffOptions = [...new Map(appointments.map((appointment) => [appointment.staff.id, appointment.staff])).values()];
  const customerOptions = [...new Map(appointments.map((appointment) => [appointment.customer.id, appointment.customer])).values()];
  const selectedAppointment = appointments.find((appointment) => appointment.id === selectedAppointmentId);

  async function submitOperation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      if (operation === 'create') {
        await apiRequest('/api/payments', { method: 'POST', idempotencyKey: crypto.randomUUID(), body: {
          appointmentId: selectedAppointmentId,
          amountMinor: majorToMinor(String(fields.get('amount') ?? '')),
          method: fields.get('method'),
          status: fields.get('status'),
          ...(String(fields.get('notes') ?? '').trim() ? { notes: String(fields.get('notes')).trim() } : {}),
        } });
      } else if (operation === 'refund' && activePayment) {
        await apiRequest(`/api/payments/${activePayment.id}/refund`, { method: 'POST', body: { amountMinor: majorToMinor(String(fields.get('amount') ?? '')), note: String(fields.get('note') ?? '').trim() } });
      }
      setOperation(null); setActivePayment(null); await reload();
    } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : 'Не удалось выполнить операцию'); }
    finally { setBusy(false); }
  }

  async function act(payment: PaymentRow, action: 'mark-paid' | 'cancel') {
    setBusy(true); setError(null);
    try { await apiRequest(`/api/payments/${payment.id}/${action}`, { method: 'POST', body: {} }); await reload(); }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : 'Не удалось выполнить операцию'); }
    finally { setBusy(false); }
  }

  function beginCreate() { setSelectedAppointmentId(''); setActivePayment(null); setOperation('create'); }

  return <main className="mx-auto w-full max-w-7xl p-4 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Оплаты</h1><p className="mt-1 text-sm text-neutral-600">Ручной учёт оплат и возвратов</p></div><Button onClick={beginCreate}>＋ Принять оплату</Button></div>
    <form className="mt-5 grid gap-3 rounded-xl border border-neutral-200 p-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => { event.preventDefault(); void reload(); }}>
      <label className="grid gap-1 text-sm">С даты<Input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })}/></label>
      <label className="grid gap-1 text-sm">По дату<Input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })}/></label>
      <label className="grid gap-1 text-sm">Метод<Select value={filters.method} onChange={(event) => setFilters({ ...filters, method: event.target.value })}><option value="">Все методы</option>{Object.entries(methodNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</Select></label>
      <label className="grid gap-1 text-sm">Статус<Select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Все статусы</option>{Object.entries(statusNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</Select></label>
      <label className="grid gap-1 text-sm">Мастер<Select value={filters.staffId} onChange={(event) => setFilters({ ...filters, staffId: event.target.value })}><option value="">Все мастера</option>{staffOptions.map((staff) => <option key={staff.id} value={staff.id}>{staff.displayName}</option>)}</Select></label>
      <label className="grid gap-1 text-sm">Клиент<Select value={filters.customerId} onChange={(event) => setFilters({ ...filters, customerId: event.target.value })}><option value="">Все клиенты</option>{customerOptions.map((customer) => <option key={customer.id} value={customer.id}>{customer.firstName} {customer.lastName ?? ''}</option>)}</Select></label>
      <label className="grid gap-1 text-sm sm:col-span-2">Поиск клиента<Input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Имя или телефон"/></label>
    </form>
    {meta ? <section aria-label="Итоги оплат" className="mt-5 grid gap-3 sm:grid-cols-2"><article className="rounded-xl border border-neutral-200 p-4"><p className="text-sm text-neutral-600">Оплачено по выборке</p><p className="mt-1 text-xl font-semibold">{formatMoney(meta.totals.paidMinor, currency)}</p></article><article className="rounded-xl border border-neutral-200 p-4"><p className="text-sm text-neutral-600">Возвращено по выборке</p><p className="mt-1 text-xl font-semibold">{formatMoney(meta.totals.refundedMinor, currency)}</p></article></section> : null}
    {error ? <p className="mt-4 text-danger-fg" role="alert">{error}</p> : null}
    <div className="mt-5 hidden overflow-x-auto rounded-xl border border-neutral-200 md:block"><table className="w-full border-collapse text-left"><caption className="sr-only">История платежей</caption><thead><tr>{['Дата', 'Клиент', 'Запись', 'Метод', 'Сумма', 'Возвращено', 'Статус', 'Принял', 'Действия'].map((label) => <th className="border-b bg-neutral-100 px-3 py-3 text-sm font-semibold" key={label} scope="col">{label}</th>)}</tr></thead><tbody>
      {payments.map((payment) => { const appointment = details[payment.appointmentId]; const date = payment.paidAt ?? payment.createdAt; return <tr className="border-b last:border-0" key={payment.id}>
        <td className="whitespace-nowrap px-3 py-3">{formatDateTime(date, Intl.DateTimeFormat().resolvedOptions().timeZone)}</td>
        <td className="px-3 py-3">{appointment ? `${appointment.customer.firstName} ${appointment.customer.lastName ?? ''}` : payment.customerId}</td>
        <td className="px-3 py-3">{appointment ? `${appointment.service.name} · ${formatDateTime(appointment.startAt, Intl.DateTimeFormat().resolvedOptions().timeZone)}` : payment.appointmentId}</td>
        <td className="px-3 py-3">{methodNames[payment.method]}</td><td className="whitespace-nowrap px-3 py-3">{formatMoney(payment.amountMinor, payment.currency)}</td>
        <td className="whitespace-nowrap px-3 py-3">{formatMoney(payment.refundedMinor, payment.currency)}</td><td className="px-3 py-3">{statusNames[payment.status]}</td><td className="px-3 py-3">{payment.createdBy.name}</td>
        <td className="px-3 py-3"><div className="flex flex-wrap gap-2">{payment.status === 'pending' ? <><Button disabled={busy} onClick={() => { void act(payment, 'mark-paid'); }} variant="secondary">Отметить оплаченной</Button><Button disabled={busy} onClick={() => { void act(payment, 'cancel'); }} variant="danger">Отменить</Button></> : null}{payment.status === 'paid' ? <Button disabled={busy} onClick={() => { setActivePayment(payment); setOperation('refund'); }} variant="secondary">Вернуть</Button> : null}</div></td>
      </tr>; })}
      {payments.length === 0 ? <tr><td className="px-3 py-8 text-center text-neutral-600" colSpan={9}>Платежей по выбранным фильтрам нет.</td></tr> : null}
    </tbody></table></div>
    <ul className="mt-4 grid gap-2 md:hidden">{payments.map((payment) => { const appointment = details[payment.appointmentId]; return <li className="grid gap-1 rounded-xl border border-neutral-200 bg-neutral-0 p-4" key={payment.id}><strong>{appointment ? `${appointment.customer.firstName} ${appointment.customer.lastName ?? ''}` : payment.customerId}</strong><span>{appointment?.service.name ?? 'Запись'} · {formatDateTime(payment.paidAt ?? payment.createdAt, Intl.DateTimeFormat().resolvedOptions().timeZone)}</span><span>{methodNames[payment.method]} · {statusNames[payment.status]}</span><span>{formatMoney(payment.amountMinor, payment.currency)} · возвращено {formatMoney(payment.refundedMinor, payment.currency)}</span><div className="flex flex-wrap gap-2">{payment.status === 'pending' ? <><Button disabled={busy} onClick={() => { void act(payment, 'mark-paid'); }} variant="secondary">Отметить оплаченной</Button><Button disabled={busy} onClick={() => { void act(payment, 'cancel'); }} variant="danger">Отменить</Button></> : null}{payment.status === 'paid' ? <Button disabled={busy} onClick={() => { setActivePayment(payment); setOperation('refund'); }} variant="secondary">Вернуть</Button> : null}</div></li>; })}</ul>
    {meta ? <p className="mt-3 text-sm text-neutral-600">Показано {payments.length} из {meta.total}</p> : null}
    <Dialog open={operation !== null} title={operation === 'refund' ? 'Вернуть оплату' : 'Принять оплату'} onClose={() => { if (!busy) { setOperation(null); setActivePayment(null); } }}>
      {operation === 'create' ? <form className="grid gap-3" onSubmit={(event) => { void submitOperation(event); }}>
        <label className="grid gap-1 text-sm">Запись<Select required value={selectedAppointmentId} onChange={(event) => { setSelectedAppointmentId(event.target.value); }}><option value="">Выберите запись</option>{appointments.filter((item) => item.status !== 'cancelled').map((item) => <option key={item.id} value={item.id}>{item.customer.firstName} {item.customer.lastName ?? ''} · {item.service.name} · {formatDateTime(item.startAt, Intl.DateTimeFormat().resolvedOptions().timeZone)}</option>)}</Select></label>
        <label className="grid gap-1 text-sm">Сумма ({currency})<Input name="amount" type="text" inputMode="decimal" placeholder="0.00" required key={`${selectedAppointmentId}-${selectedAppointment?.payment?.balanceMinor ?? 0}`} defaultValue={selectedAppointment?.payment?.balanceMinor && selectedAppointment.payment.balanceMinor > 0 ? minorToMajor(selectedAppointment.payment.balanceMinor) : ''}/></label>
        <label className="grid gap-1 text-sm">Метод<Select name="method" defaultValue="cash">{Object.entries(methodNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</Select></label>
        <label className="grid gap-1 text-sm">Статус<Select name="status" defaultValue="paid"><option value="paid">Оплачено</option><option value="pending">Ожидает оплаты</option></Select></label>
        <label className="grid gap-1 text-sm">Заметка<Input name="notes" maxLength={500}/></label>
        {selectedAppointment ? <p className="text-sm text-neutral-600">Остаток по записи: {formatMoney(selectedAppointment.payment?.balanceMinor ?? 0, currency)}</p> : null}
        <Button disabled={busy || !selectedAppointmentId} type="submit">{busy ? 'Сохранение…' : 'Сохранить оплату'}</Button>
      </form> : null}
      {operation === 'refund' && activePayment ? <form className="grid gap-3" onSubmit={(event) => { void submitOperation(event); }}><p>Доступно к возврату: {formatMoney(activePayment.amountMinor - activePayment.refundedMinor, activePayment.currency)}</p><label className="grid gap-1 text-sm">Сумма возврата ({activePayment.currency})<Input name="amount" type="text" inputMode="decimal" placeholder="0.00" required defaultValue={minorToMajor(activePayment.amountMinor - activePayment.refundedMinor)}/></label><label className="grid gap-1 text-sm">Причина возврата<Input name="note" minLength={1} maxLength={500} required/></label><Button disabled={busy} type="submit" variant="danger">{busy ? 'Сохранение…' : 'Оформить возврат'}</Button></form> : null}
    </Dialog>
  </main>;
}
