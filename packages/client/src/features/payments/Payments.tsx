import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { DialogShell as Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect as Select } from '@/components/ui/native-select';
import { Badge } from '@/components/ui/badge';
import { apiRequest, ApiClientError } from '@/lib/api-client';
import { formatDateTime, formatMoney } from '@/lib/format';
import { downloadPdfDocument } from '@/lib/pdf-download';
import { useSession } from '@/hooks/use-session';
import type { Content } from 'pdfmake';

interface PaymentRow {
  id: string; appointmentId: string; customerId: string; staffId: string; amountMinor: number; refundedMinor: number;
  currency: string; method: 'cash' | 'card' | 'transfer' | 'online'; status: 'pending' | 'paid' | 'refunded' | 'cancelled';
  paidAt?: string; notes?: string; createdBy: { id: string; name: string }; createdAt: string;
  appointment?: AppointmentRow | null;
}
interface AppointmentRow {
  id: string; customer: { id: string; firstName: string; lastName?: string }; staff: { id: string; displayName: string };
  service: { name: string }; startAt: string; status: string; payment?: { balanceMinor: number };
}
interface PaymentsEnvelope { data: PaymentRow[]; meta: { total: number; page: number; limit: number; totals: { paidMinor: number; refundedMinor: number } } }
type Operation = 'create' | 'refund' | null;

const methodNames = { cash: 'Наличные', card: 'Карта', transfer: 'Перевод', online: 'Онлайн' };
const statusNames = { pending: 'Ожидает оплаты', paid: 'Оплачено', refunded: 'Возвращено', cancelled: 'Отменено' };
const statusTone = { pending: 'warning', paid: 'success', refunded: 'neutral', cancelled: 'danger' } as const;

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

async function fetchPayments(url: string, signal?: AbortSignal): Promise<PaymentsEnvelope> {
  const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' }, ...(signal ? { signal } : {}) });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = typeof payload === 'object' && payload !== null && 'error' in payload ? payload.error : undefined;
    throw new ApiClientError(typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'INTERNAL', response.status, typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' ? error.message : 'Не удалось загрузить оплаты', undefined, typeof error === 'object' && error !== null && 'requestId' in error && typeof error.requestId === 'string' ? error.requestId : response.headers.get('X-Request-Id') ?? undefined);
  }
  if (typeof payload !== 'object' || payload === null || !('data' in payload) || !Array.isArray(payload.data) || !('meta' in payload)) throw new Error('Некорректный ответ API оплат');
  return payload as PaymentsEnvelope;
}

export function PaymentsPage() {
  const location = useLocation();
  const session = useSession();
  const queryClient = useQueryClient();
  const timezone = session.data?.active.business.timezone ?? 'UTC';
  const businessId = session.data?.active.businessId ?? '';
  const presetAppointmentId = useMemo(() => new URLSearchParams(location.search).get('appointmentId') ?? '', [location.search]);
  const [filters, setFilters] = useState({ from: '', to: '', method: '', status: '', staffId: '', customerId: '', q: '' });
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [operation, setOperation] = useState<Operation>(null);
  const [activePayment, setActivePayment] = useState<PaymentRow | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState(presetAppointmentId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(filters.q), 250);
    return () => window.clearTimeout(timer);
  }, [filters.q]);

  const queryFilters = { ...filters, q: debouncedSearch };
  const paymentParams = useMemo(() => {
    const params = new URLSearchParams({ page: '1', limit: '100' });
    for (const [key, value] of Object.entries(queryFilters)) if (value) params.set(key, value);
    return params.toString();
  }, [queryFilters.from, queryFilters.to, queryFilters.method, queryFilters.status, queryFilters.staffId, queryFilters.customerId, queryFilters.q]);
  const paymentsQuery = useQuery({
    queryKey: ['payments', 'list', businessId, session.data?.active.role, paymentParams],
    enabled: Boolean(businessId),
    queryFn: ({ signal }) => fetchPayments(`/api/payments?${paymentParams}`, signal),
    staleTime: 15_000,
    retry: false,
  });
  const referencesQuery = useQuery({
    queryKey: ['payments', 'references', businessId, session.data?.active.role, session.data?.active.staffId ?? null],
    enabled: Boolean(businessId),
    queryFn: async ({ signal }) => {
      const [rows, settings] = await Promise.all([
        apiRequest<AppointmentRow[]>('/api/appointments?page=1&limit=100', { signal }),
        apiRequest<{ business: { currency: string } }>('/api/settings', { signal }),
      ]);
      return { appointments: rows, currency: settings.business.currency };
    },
    staleTime: 30_000,
    retry: false,
  });
  const presetAppointmentQuery = useQuery({
    queryKey: ['appointments', 'detail', businessId, presetAppointmentId],
    enabled: Boolean(businessId && presetAppointmentId),
    queryFn: ({ signal }) => apiRequest<AppointmentRow>(`/api/appointments/${encodeURIComponent(presetAppointmentId)}`, { signal }),
    staleTime: 60_000,
    retry: false,
  });
  const payments = paymentsQuery.data?.data ?? [];
  const details = Object.fromEntries(payments.flatMap((payment) => payment.appointment ? [[payment.appointmentId, payment.appointment] as const] : []));
  const appointments = referencesQuery.data?.appointments ?? [];
  const currency = referencesQuery.data?.currency ?? 'KGS';
  const meta = paymentsQuery.data?.meta ?? null;
  const loadError = paymentsQuery.error instanceof Error ? paymentsQuery.error.message : referencesQuery.error instanceof Error ? referencesQuery.error.message : null;

  async function reload() {
    await queryClient.invalidateQueries({ queryKey: ['payments', 'list', businessId] });
  }
  useEffect(() => {
    setSelectedAppointmentId(presetAppointmentId);
    if (presetAppointmentId) setOperation('create');
  }, [presetAppointmentId]);

  const staffOptions = [...new Map(appointments.map((appointment) => [appointment.staff.id, appointment.staff])).values()];
  const customerOptions = [...new Map(appointments.map((appointment) => [appointment.customer.id, appointment.customer])).values()];
  const selectedAppointment = appointments.find((appointment) => appointment.id === selectedAppointmentId) ?? (presetAppointmentQuery.data?.id === selectedAppointmentId ? presetAppointmentQuery.data : undefined);

  async function downloadReceipt(payment: PaymentRow, appointment?: AppointmentRow) {
    if (payment.status !== 'paid') return;
    setReceiptBusy(true);
    try {
    const paidAt = payment.paidAt ?? payment.createdAt;
    const businessName = session.data?.active.business.name ?? 'BeautyFlow';
    const customerName = appointment ? `${appointment.customer.firstName} ${appointment.customer.lastName ?? ''}`.trim() : 'Клиент';
    const details: Content[] = [
      { text: businessName, style: 'business' },
      { text: 'Квитанция об оплате', style: 'title' },
      { text: 'Подтверждение оплаты. Не является фискальным чеком.', style: 'hint', margin: [0, 0, 0, 16] },
      { text: `№ ${payment.id}`, margin: [0, 0, 0, 8] },
      { text: `Дата: ${formatDateTime(paidAt, timezone)}` },
      { text: `Клиент: ${customerName}` },
      { text: `Услуга: ${appointment?.service.name ?? 'Услуга по записи'}` },
      { text: `Мастер: ${appointment?.staff.displayName ?? '—'}` },
      { text: `Способ оплаты: ${methodNames[payment.method]}` },
      { text: `Сумма: ${formatMoney(payment.amountMinor, payment.currency)}`, style: 'amount', margin: [0, 12, 0, 8] },
      { text: `Принял оплату: ${payment.createdBy.name}` },
    ];
    await downloadPdfDocument(details, `kvitanciya-${payment.id.slice(-8)}.pdf`, { defaultStyle: { font: 'Roboto', fontSize: 11 }, styles: { business: { fontSize: 13, bold: true, margin: [0, 0, 0, 18] }, title: { fontSize: 19, bold: true, margin: [0, 0, 0, 6] }, hint: { fontSize: 9, color: '#606770' }, amount: { fontSize: 14, bold: true } }, pageMargins: [40, 40, 40, 40] });
    } catch {
      setError('Оплата сохранена, но квитанцию не удалось сформировать. Попробуйте скачать её из списка оплат.');
    } finally {
      setReceiptBusy(false);
    }
  }

  async function submitOperation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      if (operation === 'create') {
        const created = await apiRequest<PaymentRow>('/api/payments', { method: 'POST', idempotencyKey: crypto.randomUUID(), body: {
          appointmentId: selectedAppointmentId,
          amountMinor: majorToMinor(String(fields.get('amount') ?? '')),
          method: fields.get('method'),
          status: fields.get('status'),
          ...(String(fields.get('notes') ?? '').trim() ? { notes: String(fields.get('notes')).trim() } : {}),
        } });
        if (created.status === 'paid') await downloadReceipt(created, selectedAppointment);
      } else if (operation === 'refund' && activePayment) {
        await apiRequest(`/api/payments/${activePayment.id}/refund`, { method: 'POST', body: { amountMinor: majorToMinor(String(fields.get('amount') ?? '')), note: String(fields.get('note') ?? '').trim() } });
      }
      setOperation(null); setActivePayment(null); await reload();
    } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : 'Не удалось выполнить операцию'); }
    finally { setBusy(false); }
  }

  async function act(payment: PaymentRow, action: 'mark-paid' | 'cancel') {
    setBusy(true); setError(null);
    try { const updated = await apiRequest<PaymentRow>(`/api/payments/${payment.id}/${action}`, { method: 'POST', body: {} }); if (updated.status === 'paid') await downloadReceipt(updated, details[payment.appointmentId]); await reload(); }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : 'Не удалось выполнить операцию'); }
    finally { setBusy(false); }
  }

  function beginCreate() { setSelectedAppointmentId(''); setActivePayment(null); setOperation('create'); }

  return <main className="mx-auto w-full max-w-[1440px] px-5 py-6 md:px-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Оплаты</h1><p className="mt-1 text-[13px] text-neutral-500">Ручной учёт оплат и возвратов</p></div><Button size="small" onClick={beginCreate}>＋ Принять оплату</Button></div>
    <form className="mt-5 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm" onSubmit={(event) => { event.preventDefault(); void reload(); }}>
      <label className="grid gap-1 text-sm">С даты<Input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })}/></label>
      <label className="grid gap-1 text-sm">По дату<Input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })}/></label>
      <label className="grid gap-1 text-sm">Метод<Select value={filters.method} onChange={(event) => setFilters({ ...filters, method: event.target.value })}><option value="">Все методы</option>{Object.entries(methodNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</Select></label>
      <label className="grid gap-1 text-sm">Статус<Select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Все статусы</option>{Object.entries(statusNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</Select></label>
      <label className="grid gap-1 text-sm">Мастер<Select value={filters.staffId} onChange={(event) => setFilters({ ...filters, staffId: event.target.value })}><option value="">Все мастера</option>{staffOptions.map((staff) => <option key={staff.id} value={staff.id}>{staff.displayName}</option>)}</Select></label>
      <label className="grid gap-1 text-sm">Клиент<Select value={filters.customerId} onChange={(event) => setFilters({ ...filters, customerId: event.target.value })}><option value="">Все клиенты</option>{customerOptions.map((customer) => <option key={customer.id} value={customer.id}>{customer.firstName} {customer.lastName ?? ''}</option>)}</Select></label>
      <label className="grid gap-1 text-sm sm:col-span-2">Поиск клиента<Input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Имя или телефон"/></label>
    </form>
    {meta ? <section aria-label="Итоги оплат" className="mt-4 grid gap-3 sm:grid-cols-2"><article className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm"><p className="text-xs text-neutral-500">Оплачено по выборке</p><p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(meta.totals.paidMinor, currency)}</p></article><article className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm"><p className="text-xs text-neutral-500">Возвращено по выборке</p><p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(meta.totals.refundedMinor, currency)}</p></article></section> : null}
    {error || loadError ? <p className="mt-4 text-danger-fg" role="alert">{error ?? loadError}{paymentsQuery.error instanceof ApiClientError && paymentsQuery.error.requestId ? <span className="block text-xs">Код обращения: {paymentsQuery.error.requestId}</span> : null}</p> : null}
    <div aria-label="Таблица оплат" className="mt-4 hidden overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-0 min-[1536px]:block" role="region" tabIndex={0}><table className="w-full min-w-[1120px] border-collapse text-left text-[13px]"><caption className="sr-only">История платежей</caption><thead><tr className="h-10 border-b border-neutral-200 bg-neutral-50 text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-500">{['Дата', 'Клиент', 'Запись', 'Метод', 'Сумма', 'Возвращено', 'Статус', 'Принял', 'Действия'].map((label) => <th className="px-3" key={label} scope="col">{label}</th>)}</tr></thead><tbody>
      {payments.map((payment) => { const appointment = details[payment.appointmentId]; const date = payment.paidAt ?? payment.createdAt; return <tr className="h-[52px] border-b border-neutral-100 text-[13px] transition-colors hover:bg-neutral-50" key={payment.id}>
        <td className="whitespace-nowrap px-2 tabular-nums text-neutral-600">{formatDateTime(date, timezone)}</td>
        <td className="px-2 font-medium">{appointment ? `${appointment.customer.firstName} ${appointment.customer.lastName ?? ''}` : 'Клиент'}</td>
        <td className="px-2 text-neutral-600">{appointment ? `${appointment.service.name} · ${formatDateTime(appointment.startAt, timezone)}` : 'Запись недоступна'}</td>
        <td className="px-3 text-neutral-600">{methodNames[payment.method]}</td><td className="whitespace-nowrap px-3 font-medium tabular-nums">{formatMoney(payment.amountMinor, payment.currency)}</td>
        <td className="whitespace-nowrap px-3 tabular-nums text-neutral-600">{formatMoney(payment.refundedMinor, payment.currency)}</td><td className="px-3"><Badge tone={statusTone[payment.status]}>{statusNames[payment.status]}</Badge></td><td className="px-3 text-neutral-600">{payment.createdBy.name}</td>
        <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{payment.status === 'pending' ? <><Button size="small" disabled={busy || receiptBusy} onClick={() => { void act(payment, 'mark-paid'); }} variant="secondary">Оплатить</Button><Button size="small" disabled={busy || receiptBusy} onClick={() => { void act(payment, 'cancel'); }} variant="danger">Отменить</Button></> : null}{payment.status === 'paid' ? <><Button size="small" disabled={busy || receiptBusy} onClick={() => { void downloadReceipt(payment, appointment); }} variant="outline">{receiptBusy ? 'Формируем…' : 'Скачать чек'}</Button><Button size="small" disabled={busy || receiptBusy} onClick={() => { setActivePayment(payment); setOperation('refund'); }} variant="secondary">Вернуть</Button></> : null}</div></td>
      </tr>; })}
      {payments.length === 0 && !paymentsQuery.isPending ? <tr><td className="px-3 py-8 text-center text-neutral-600" colSpan={9}>Платежей по выбранным фильтрам нет.</td></tr> : null}
    </tbody></table></div>
    <ul aria-label="Карточки оплат" className="mt-4 grid gap-2 min-[1536px]:hidden">
      {payments.map((payment) => {
        const appointment = details[payment.appointmentId];
        const paymentDate = payment.paidAt ?? payment.createdAt;
        return <li className="grid min-w-0 gap-3 rounded-lg border border-neutral-200 bg-neutral-0 p-3 shadow-sm sm:p-4" key={payment.id}>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <strong className="block truncate text-sm">{appointment ? `${appointment.customer.firstName} ${appointment.customer.lastName ?? ''}` : 'Клиент'}</strong>
              <p className="mt-1 break-words text-xs text-neutral-600">{appointment ? `${appointment.service.name} · ${formatDateTime(appointment.startAt, timezone)}` : 'Запись недоступна'}</p>
            </div>
            <Badge tone={statusTone[payment.status]}>{statusNames[payment.status]}</Badge>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-y border-neutral-100 py-3 text-xs">
            <div><dt className="text-neutral-500">Дата оплаты</dt><dd className="mt-0.5 tabular-nums">{formatDateTime(paymentDate, timezone)}</dd></div>
            <div><dt className="text-neutral-500">Метод</dt><dd className="mt-0.5">{methodNames[payment.method]}</dd></div>
            <div><dt className="text-neutral-500">Сумма</dt><dd className="mt-0.5 font-semibold tabular-nums">{formatMoney(payment.amountMinor, payment.currency)}</dd></div>
            <div><dt className="text-neutral-500">Возвращено</dt><dd className="mt-0.5 tabular-nums">{formatMoney(payment.refundedMinor, payment.currency)}</dd></div>
            <div className="col-span-2"><dt className="text-neutral-500">Принял оплату</dt><dd className="mt-0.5">{payment.createdBy.name}</dd></div>
          </dl>
          <div className="flex flex-wrap gap-2">
            {payment.status === 'pending' ? <><Button size="small" disabled={busy} onClick={() => { void act(payment, 'mark-paid'); }} variant="secondary">Оплатить</Button><Button size="small" disabled={busy} onClick={() => { void act(payment, 'cancel'); }} variant="danger">Отменить</Button></> : null}
            {payment.status === 'paid' ? <><Button size="small" disabled={busy || receiptBusy} onClick={() => { void downloadReceipt(payment, appointment); }} variant="outline">{receiptBusy ? 'Формируем…' : 'Скачать чек'}</Button><Button size="small" disabled={busy || receiptBusy} onClick={() => { setActivePayment(payment); setOperation('refund'); }} variant="secondary">Вернуть</Button></> : null}
          </div>
        </li>;
      })}
      {payments.length === 0 && !paymentsQuery.isPending ? <li className="rounded-lg border border-neutral-200 bg-neutral-0 px-4 py-8 text-center text-sm text-neutral-600">Платежей по выбранным фильтрам нет.</li> : null}
    </ul>
    {paymentsQuery.isPending ? <p className="mt-4 text-sm text-neutral-500" role="status">Загружаем оплаты…</p> : null}
    {meta ? <p className="mt-3 text-sm text-neutral-600">Показано {payments.length} из {meta.total}</p> : null}
    <Dialog open={operation !== null} title={operation === 'refund' ? 'Вернуть оплату' : 'Принять оплату'} onClose={() => { if (!busy) { setOperation(null); setActivePayment(null); } }}>
      {operation === 'create' ? <form className="grid gap-3" onSubmit={(event) => { void submitOperation(event); }}>
        <label className="grid gap-1 text-sm">Запись<Select required value={selectedAppointmentId} onChange={(event) => { setSelectedAppointmentId(event.target.value); }}><option value="">Выберите запись</option>{appointments.filter((item) => item.status !== 'cancelled').map((item) => <option key={item.id} value={item.id}>{item.customer.firstName} {item.customer.lastName ?? ''} · {item.service.name} · {formatDateTime(item.startAt, timezone)}</option>)}</Select></label>
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

