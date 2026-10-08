import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError, apiRequest } from '@/lib/api-client';
import { useSession } from '@/hooks/use-session';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { DialogShell as Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { NativeSelect as Select } from '@/components/ui/native-select';
import { formatDateTime } from '@/lib/format';

type ApiErrorState = string | null;
function errorMessage(error: unknown): string { return error instanceof ApiClientError ? error.message : 'Не удалось выполнить запрос'; }
function money(minor: number, currency = 'KGS'): string { return new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100); }
function useRemote<T>(path: string, fallback: T): [T, (value: T) => void, ApiErrorState, boolean] {
  const [data, setData] = useState(fallback);
  const [error, setError] = useState<ApiErrorState>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { const controller = new AbortController(); setLoading(true); void apiRequest<T>(path, { signal: controller.signal }).then(setData).catch((reason: unknown) => { if (!controller.signal.aborted) setError(errorMessage(reason)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [path]);
  return [data, setData, error, loading];
}
type Customer = { id: string; firstName: string; lastName?: string; phone: string; email?: string; notes?: string; source: string; createdAt: string };
type CustomerSummary = { visitsCount: number; lastVisitAt?: string; nextVisitAt?: string; totalPaidMinor: number; currency: string };
type CustomerAppointment = { id: string; startAt: string; status: string; service: { name: string } };
type CustomerPayment = { id: string; amountMinor: number; currency: string; method: 'cash' | 'card' | 'transfer' | 'online'; status: 'pending' | 'paid' | 'refunded' | 'cancelled'; paidAt?: string; createdAt: string };
const appointmentStatusLabels: Record<string, string> = { pending: 'Ожидает подтверждения', confirmed: 'Подтверждена', completed: 'Завершена', cancelled: 'Отменена', no_show: 'Неявка' };
const paymentMethodLabels: Record<CustomerPayment['method'], string> = { cash: 'Наличные', card: 'Карта', transfer: 'Перевод', online: 'Онлайн' };
const paymentStatusLabels: Record<CustomerPayment['status'], string> = { pending: 'Ожидает оплаты', paid: 'Оплачено', refunded: 'Возвращено', cancelled: 'Отменено' };
export function CustomersPage() {
  const navigate = useNavigate();
  const session = useSession(); const canWrite = session.data?.permissions.includes('customers:write') ?? false;
  const timezone = session.data?.active.business.timezone ?? 'UTC';
  const [query, setQuery] = useState(''); const [source, setSource] = useState(''); const path = `/api/customers?limit=100${query.length >= 2 ? `&q=${encodeURIComponent(query)}` : ''}${source ? `&source=${source}` : ''}`;
  const [rows, setRows, error, loading] = useRemote<Customer[]>(path, []); const [dialogOpen, setDialogOpen] = useState(false); const [message, setMessage] = useState<ApiErrorState>(null);
  async function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); try { const customer = await apiRequest<Customer>('/api/customers', { method: 'POST', body: { firstName: form.get('firstName'), lastName: form.get('lastName') || undefined, phone: form.get('phone'), email: form.get('email') || undefined, notes: form.get('notes') || undefined } }); setRows([customer, ...rows]); setDialogOpen(false); setMessage('Клиент добавлен.'); } catch (reason: unknown) { setMessage(errorMessage(reason)); } }
  return <main className="mx-auto w-full max-w-[1440px] px-5 py-6 md:px-8">
    <div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Клиенты</h1>{canWrite ? <Button size="small" onClick={() => setDialogOpen(true)}>＋ Клиент</Button> : null}</div>
    <div className="mt-5 flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor="customers-search">Поиск клиентов</label><Input className="max-w-[280px]" id="customers-search" placeholder="Имя, телефон или email" value={query} onChange={(event) => setQuery(event.target.value)}/><label className="sr-only" htmlFor="customers-source">Источник</label><Select className="w-auto min-w-36" id="customers-source" value={source} onChange={(event) => setSource(event.target.value)}><option value="">Все источники</option><option value="internal">Вручную</option><option value="public">Онлайн-запись</option></Select><span className="ml-auto text-xs text-neutral-500">{rows.length} клиентов</span></div>
    {message ? <p className="mt-3 text-sm text-success-fg" role="status">{message}</p> : null}{error ? <p className="mt-3 text-sm text-danger-fg" role="alert">{error}</p> : null}
    {loading ? <div aria-label="Загрузка клиентов" className="mt-4 grid gap-2">{Array.from({ length: 5 }, (_, index) => <div className="h-12 animate-pulse rounded bg-neutral-100" key={index}/>)}</div> : rows.length ? <>
      <div className="mt-4 hidden overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-0 md:block"><table className="w-full min-w-[720px] border-collapse text-left text-[13px] [&_td]:px-4 [&_th]:px-4"><caption className="sr-only">Список клиентов</caption><thead><tr className="h-10 border-b border-neutral-200 bg-neutral-50 text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-500"><th scope="col">Клиент</th><th scope="col">Телефон</th><th scope="col">Email</th><th scope="col">Добавлен</th><th scope="col">Источник</th></tr></thead><tbody>{rows.map((row) => <tr className="h-[52px] cursor-pointer border-b border-neutral-100 transition-colors hover:bg-neutral-50" key={row.id} onClick={() => navigate(`/app/customers/${row.id}`)}><td className="font-medium"><span className="mr-2 inline-grid size-7 place-items-center rounded-full bg-neutral-100 text-[10px] font-semibold">{row.firstName[0]?.toLocaleUpperCase('ru-RU') ?? '?'}</span><Link to={`/app/customers/${row.id}`}>{row.firstName} {row.lastName ?? ''}</Link></td><td className="tabular-nums text-neutral-600">{row.phone}</td><td className="text-neutral-600">{row.email ?? '—'}</td><td className="text-neutral-600">{new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeZone: timezone }).format(new Date(row.createdAt))}</td><td className="text-neutral-600">{row.source === 'public' ? 'Онлайн-запись' : 'Вручную'}</td></tr>)}</tbody></table></div>
      <ul aria-label="Карточки клиентов" className="mt-4 grid gap-2 md:hidden">{rows.map((row) => <li key={row.id}><Link className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-lg border border-neutral-200 bg-neutral-0 p-3 shadow-sm transition-colors hover:border-neutral-300 hover:bg-neutral-50" to={`/app/customers/${row.id}`}><span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-700">{row.firstName[0]?.toLocaleUpperCase('ru-RU') ?? '?'}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold">{row.firstName} {row.lastName ?? ''}</span><span className="mt-1 block break-words text-xs tabular-nums text-neutral-600">{row.phone}</span><span className="mt-0.5 block break-all text-xs text-neutral-500">{row.email ?? 'Email не указан'}</span></span><span className="col-span-2 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-2 text-[11px] text-neutral-500"><span className="rounded bg-neutral-100 px-2 py-1 font-medium text-neutral-700">{row.source === 'public' ? 'Онлайн-запись' : 'Вручную'}</span><span>Добавлен {new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeZone: timezone }).format(new Date(row.createdAt))}</span></span></Link></li>)}</ul>
    </> : <div className="mt-5"><EmptyState title={query ? 'Клиенты не найдены' : 'Клиентов пока нет'}>{canWrite ? <Button size="small" className="mt-3" onClick={() => setDialogOpen(true)}>＋ Клиент</Button> : null}</EmptyState></div>}
    <Dialog open={dialogOpen} title="Новый клиент" onClose={() => setDialogOpen(false)}><form className="grid gap-4" onSubmit={(event) => { void create(event); }}><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-[13px] font-medium text-neutral-600">Имя<Input name="firstName" required/></label><label className="grid gap-1 text-[13px] font-medium text-neutral-600">Фамилия<Input name="lastName"/></label></div><label className="grid gap-1 text-[13px] font-medium text-neutral-600">Телефон<Input name="phone" type="tel" minLength={5} required/></label><label className="grid gap-1 text-[13px] font-medium text-neutral-600">Email<Input name="email" type="email"/></label><label className="grid gap-1 text-[13px] font-medium text-neutral-600">Заметки<textarea className="min-h-20 rounded-md border border-neutral-300 bg-neutral-0 px-2.5 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600" name="notes"/></label><div className="flex justify-end gap-2 border-t border-neutral-200 pt-3"><Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>Отмена</Button><Button type="submit">Создать клиента</Button></div></form></Dialog>
  </main>;
}

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const session = useSession();
  const canWrite = session.data?.permissions.includes('customers:write') ?? false;
  const canReadPayments = session.data?.permissions.includes('payments:read') ?? false;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [appointments, setAppointments] = useState<CustomerAppointment[]>([]);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [message, setMessage] = useState<ApiErrorState>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const detailRequest = apiRequest<{ customer: Customer; summary?: CustomerSummary }>(`/api/customers/${id}`, { signal: controller.signal });
    const historyRequest = apiRequest<CustomerAppointment[]>(`/api/customers/${id}/appointments?limit=100`, { signal: controller.signal });
    const paymentsRequest = canReadPayments ? apiRequest<CustomerPayment[]>(`/api/payments?customerId=${id}&limit=100`, { signal: controller.signal }) : Promise.resolve([] as CustomerPayment[]);
    void Promise.all([detailRequest, historyRequest, paymentsRequest]).then(([detail, history, paymentRows]) => { setCustomer(detail.customer); setSummary(detail.summary ?? null); setAppointments(history); setPayments(paymentRows); }).catch((reason: unknown) => { if (!controller.signal.aborted) setMessage(errorMessage(reason)); });
    return () => controller.abort();
  }, [id, canReadPayments]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      const updated = await apiRequest<Customer>(`/api/customers/${id}`, { method: 'PATCH', body: { firstName: form.get('firstName'), lastName: form.get('lastName') || undefined, phone: form.get('phone'), email: form.get('email') || undefined, notes: form.get('notes') || undefined } });
      setCustomer(updated); setEditing(false); setMessage('Карточка сохранена.');
    } catch (reason: unknown) { setMessage(errorMessage(reason)); }
  }
  const timezone = session.data?.active.business.timezone ?? 'UTC';
  const currency = summary?.currency ?? session.data?.active.business.currency ?? 'KGS';
  return <main className="mx-auto w-full max-w-[1100px] px-5 py-6 md:px-8">
    <Link className="text-xs text-neutral-500 hover:text-neutral-900" to="/app/customers">Клиенты /</Link>
    <div className="mt-2 flex items-center justify-between gap-3"><h1 className="text-2xl font-semibold">{customer ? `${customer.firstName} ${customer.lastName ?? ''}` : 'Карточка клиента'}</h1>{customer && canWrite ? <Button size="small" variant="secondary" onClick={() => setEditing(true)}>Изменить</Button> : null}</div>
    {message ? <p role="status" className="mt-3 text-sm text-success-fg">{message}</p> : null}
    {customer ? <>
      <section className="mt-4 grid gap-3 sm:grid-cols-3"><article className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm"><p className="text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-500">Телефон</p><p className="mt-1 text-sm font-medium tabular-nums">{customer.phone}</p></article><article className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm"><p className="text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-500">Email</p><p className="mt-1 text-sm">{customer.email ?? '—'}</p></article><article className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm"><p className="text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-500">Клиент с</p><p className="mt-1 text-sm">{new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeZone: timezone }).format(new Date(customer.createdAt))}</p></article></section>
      {customer.notes ? <section className="mt-4 rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm"><h2 className="text-sm font-semibold">Заметки</h2><p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">{customer.notes}</p></section> : null}
      {summary ? <section aria-label="Показатели клиента" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
        { label: 'Завершённых визитов', value: String(summary.visitsCount) },
        { label: 'Последний визит', value: summary.lastVisitAt ? formatDateTime(summary.lastVisitAt, timezone) : 'Нет завершённых визитов' },
        { label: 'Следующая запись', value: summary.nextVisitAt ? formatDateTime(summary.nextVisitAt, timezone) : 'Не запланирована' },
        { label: 'Оплачено всего', value: money(summary.totalPaidMinor, currency) },
      ].map((item) => <article className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm" key={item.label}><p className="text-xs text-neutral-500">{item.label}</p><p className="mt-1 text-sm font-semibold tabular-nums">{item.value}</p></article>)}</section> : null}
      <section className="mt-6 rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm"><h2 className="text-base font-semibold">История визитов</h2>{appointments.length ? <ul className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200">{appointments.map((row) => <li className="grid gap-1 py-3 text-[13px] sm:min-h-[52px] sm:grid-cols-[140px_minmax(0,1fr)_auto] sm:items-center sm:gap-3 sm:py-0" key={row.id}><time className="tabular-nums text-neutral-600" dateTime={row.startAt}>{formatDateTime(row.startAt, timezone)}</time><span className="truncate">{row.service.name}</span><span className="text-neutral-500">{appointmentStatusLabels[row.status] ?? 'Статус обновлён'}</span></li>)}</ul> : <p className="mt-3 border-y border-neutral-200 py-6 text-center text-sm text-neutral-500">Истории пока нет.</p>}</section>
      {canReadPayments ? <section className="mt-4 rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm"><h2 className="text-base font-semibold">Оплаты</h2>{payments.length ? <ul className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200">{payments.map((row) => <li className="grid gap-1 py-3 text-[13px] sm:min-h-[52px] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-3 sm:py-0" key={row.id}><time className="text-neutral-600" dateTime={row.paidAt ?? row.createdAt}>{formatDateTime(row.paidAt ?? row.createdAt, timezone)}</time><span className="text-neutral-600">{paymentMethodLabels[row.method]} · {paymentStatusLabels[row.status]}</span><span className="tabular-nums font-medium">{money(row.amountMinor, row.currency)}</span></li>)}</ul> : <p className="mt-3 border-y border-neutral-200 py-6 text-center text-sm text-neutral-500">Оплат пока нет.</p>}</section> : null}
    </> : <p role="status" className="mt-6 text-sm text-neutral-500">Загрузка карточки…</p>}
    <Dialog open={editing} title="Изменить клиента" onClose={() => setEditing(false)}>{customer ? <form className="grid gap-4" onSubmit={(event) => { void save(event); }}><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-[13px] font-medium text-neutral-600">Имя<Input name="firstName" defaultValue={customer.firstName} required/></label><label className="grid gap-1 text-[13px] font-medium text-neutral-600">Фамилия<Input name="lastName" defaultValue={customer.lastName}/></label></div><label className="grid gap-1 text-[13px] font-medium text-neutral-600">Телефон<Input name="phone" defaultValue={customer.phone} required/></label><label className="grid gap-1 text-[13px] font-medium text-neutral-600">Email<Input name="email" type="email" defaultValue={customer.email}/></label><label className="grid gap-1 text-[13px] font-medium text-neutral-600">Заметки<textarea className="min-h-20 rounded-md border border-neutral-300 bg-neutral-0 px-2.5 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600" name="notes" defaultValue={customer.notes}/></label><div className="flex justify-end gap-2 border-t border-neutral-200 pt-3"><Button type="button" variant="secondary" onClick={() => setEditing(false)}>Отмена</Button><Button type="submit">Сохранить</Button></div></form> : null}</Dialog>
  </main>;
}

