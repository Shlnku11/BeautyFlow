import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError, apiRequest } from '@/lib/api-client';
import { useSession } from '@/hooks/use-session';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { DialogShell as Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { NativeSelect as Select } from '@/components/ui/native-select';

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
export function CustomersPage() {
  const navigate = useNavigate();
  const session = useSession(); const canWrite = session.data?.permissions.includes('customers:write') ?? false;
  const [query, setQuery] = useState(''); const [source, setSource] = useState(''); const path = `/api/customers?limit=100${query.length >= 2 ? `&q=${encodeURIComponent(query)}` : ''}${source ? `&source=${source}` : ''}`;
  const [rows, setRows, error, loading] = useRemote<Customer[]>(path, []); const [dialogOpen, setDialogOpen] = useState(false); const [message, setMessage] = useState<ApiErrorState>(null);
  async function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); try { const customer = await apiRequest<Customer>('/api/customers', { method: 'POST', body: { firstName: form.get('firstName'), lastName: form.get('lastName') || undefined, phone: form.get('phone'), email: form.get('email') || undefined, notes: form.get('notes') || undefined } }); setRows([customer, ...rows]); setDialogOpen(false); setMessage('Клиент добавлен.'); } catch (reason: unknown) { setMessage(errorMessage(reason)); } }
  return <main className="mx-auto w-full max-w-[1440px] px-5 py-6 md:px-8">
    <div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Клиенты</h1>{canWrite ? <Button size="small" onClick={() => setDialogOpen(true)}>＋ Клиент</Button> : null}</div>
    <div className="mt-5 flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor="customers-search">Поиск клиентов</label><Input className="max-w-[280px]" id="customers-search" placeholder="Имя, телефон или email" value={query} onChange={(event) => setQuery(event.target.value)}/><label className="sr-only" htmlFor="customers-source">Источник</label><Select className="w-auto min-w-36" id="customers-source" value={source} onChange={(event) => setSource(event.target.value)}><option value="">Все источники</option><option value="internal">Вручную</option><option value="public">Онлайн-запись</option></Select><span className="ml-auto text-xs text-neutral-500">{rows.length} клиентов</span></div>
    {message ? <p className="mt-3 text-sm text-success-fg" role="status">{message}</p> : null}{error ? <p className="mt-3 text-sm text-danger-fg" role="alert">{error}</p> : null}
    {loading ? <div aria-label="Загрузка клиентов" className="mt-4 grid gap-2">{Array.from({ length: 5 }, (_, index) => <div className="h-12 animate-pulse rounded bg-neutral-100" key={index}/>)}</div> : rows.length ? <>
      <div className="mt-4 hidden overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-0 md:block"><table className="w-full min-w-[720px] border-collapse text-left text-[13px] [&_td]:px-4 [&_th]:px-4"><caption className="sr-only">Список клиентов</caption><thead><tr className="h-10 border-b border-neutral-200 bg-neutral-50 text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-500"><th scope="col">Клиент</th><th scope="col">Телефон</th><th scope="col">Email</th><th scope="col">Добавлен</th><th scope="col">Источник</th></tr></thead><tbody>{rows.map((row) => <tr className="h-[52px] cursor-pointer border-b border-neutral-100 transition-colors hover:bg-neutral-50" key={row.id} onClick={() => navigate(`/app/customers/${row.id}`)}><td className="font-medium"><span className="mr-2 inline-grid size-7 place-items-center rounded-full bg-neutral-100 text-[10px] font-semibold">{row.firstName[0]?.toLocaleUpperCase('ru-RU') ?? '?'}</span><Link to={`/app/customers/${row.id}`}>{row.firstName} {row.lastName ?? ''}</Link></td><td className="tabular-nums text-neutral-600">{row.phone}</td><td className="text-neutral-600">{row.email ?? '—'}</td><td className="text-neutral-600">{new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(new Date(row.createdAt))}</td><td className="text-neutral-600">{row.source === 'public' ? 'Онлайн' : 'Вручную'}</td></tr>)}</tbody></table></div>
      <ul className="mt-4 divide-y divide-neutral-200 border-y border-neutral-200 md:hidden">{rows.map((row) => <li className="py-3" key={row.id}><Link className="block" to={`/app/customers/${row.id}`}><span className="text-sm font-medium">{row.firstName} {row.lastName ?? ''}</span><span className="mt-0.5 block text-xs text-neutral-500">{row.phone} · {row.email ?? 'Email не указан'}</span></Link></li>)}</ul>
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
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [appointments, setAppointments] = useState<Record<string, unknown>[]>([]);
  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);
  const [message, setMessage] = useState<ApiErrorState>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const detailRequest = apiRequest<{ customer: Customer; summary?: Record<string, unknown> }>(`/api/customers/${id}`, { signal: controller.signal });
    const historyRequest = apiRequest<Record<string, unknown>[]>(`/api/customers/${id}/appointments?limit=100`, { signal: controller.signal });
    const paymentsRequest = canReadPayments ? apiRequest<Record<string, unknown>[]>(`/api/payments?customerId=${id}&limit=100`, { signal: controller.signal }) : Promise.resolve([] as Record<string, unknown>[]);
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
  return <main className="mx-auto w-full max-w-[1100px] px-5 py-6 md:px-8">
    <Link className="text-xs text-neutral-500 hover:text-neutral-900" to="/app/customers">Клиенты /</Link>
    <div className="mt-2 flex items-center justify-between gap-3"><h1 className="text-2xl font-semibold">{customer ? `${customer.firstName} ${customer.lastName ?? ''}` : 'Карточка клиента'}</h1>{customer && canWrite ? <Button size="small" variant="secondary" onClick={() => setEditing(true)}>Изменить</Button> : null}</div>
    {message ? <p role="status" className="mt-3 text-sm text-success-fg">{message}</p> : null}
    {customer ? <>
      <section className="mt-4 grid gap-3 sm:grid-cols-3"><article className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm"><p className="text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-500">Телефон</p><p className="mt-1 text-sm font-medium tabular-nums">{customer.phone}</p></article><article className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm"><p className="text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-500">Email</p><p className="mt-1 text-sm">{customer.email ?? '—'}</p></article><article className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm"><p className="text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-500">Клиент с</p><p className="mt-1 text-sm">{new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(new Date(customer.createdAt))}</p></article></section>
      {customer.notes ? <section className="mt-4 rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm"><h2 className="text-sm font-semibold">Заметки</h2><p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">{customer.notes}</p></section> : null}
      {summary ? <section className="mt-4 grid gap-3 sm:grid-cols-3">{Object.entries(summary).map(([key, value]) => <article className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm" key={key}><p className="text-xs text-neutral-500">{key}</p><p className="mt-1 text-sm font-semibold">{String(value)}</p></article>)}</section> : null}
      <section className="mt-6 rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm"><h2 className="text-base font-semibold">История визитов</h2>{appointments.length ? <ul className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200">{appointments.map((row, index) => <li className="grid min-h-[52px] grid-cols-[140px_minmax(0,1fr)_auto] items-center gap-3 text-[13px]" key={String(row.id ?? index)}><time className="tabular-nums text-neutral-600">{String(row.startAt ?? '')}</time><span className="truncate">{String((row.service as { name?: string } | undefined)?.name ?? 'Запись')}</span><span className="text-neutral-500">{String(row.status ?? '')}</span></li>)}</ul> : <p className="mt-3 border-y border-neutral-200 py-6 text-center text-sm text-neutral-500">Истории пока нет.</p>}</section>
      {canReadPayments ? <section className="mt-4 rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm"><h2 className="text-base font-semibold">Оплаты</h2>{payments.length ? <ul className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200">{payments.map((row, index) => <li className="grid min-h-[52px] grid-cols-[140px_1fr_auto] items-center gap-3 text-[13px]" key={String(row.id ?? index)}><span>{String(row.method ?? '')}</span><span>{String(row.status ?? '')}</span><span className="tabular-nums font-medium">{money(Number(row.amountMinor ?? 0), String(row.currency ?? 'KGS'))}</span></li>)}</ul> : <p className="mt-3 border-y border-neutral-200 py-6 text-center text-sm text-neutral-500">Оплат пока нет.</p>}</section> : null}
    </> : <p role="status" className="mt-6 text-sm text-neutral-500">Загрузка карточки…</p>}
    <Dialog open={editing} title="Изменить клиента" onClose={() => setEditing(false)}>{customer ? <form className="grid gap-4" onSubmit={(event) => { void save(event); }}><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-[13px] font-medium text-neutral-600">Имя<Input name="firstName" defaultValue={customer.firstName} required/></label><label className="grid gap-1 text-[13px] font-medium text-neutral-600">Фамилия<Input name="lastName" defaultValue={customer.lastName}/></label></div><label className="grid gap-1 text-[13px] font-medium text-neutral-600">Телефон<Input name="phone" defaultValue={customer.phone} required/></label><label className="grid gap-1 text-[13px] font-medium text-neutral-600">Email<Input name="email" type="email" defaultValue={customer.email}/></label><label className="grid gap-1 text-[13px] font-medium text-neutral-600">Заметки<textarea className="min-h-20 rounded-md border border-neutral-300 bg-neutral-0 px-2.5 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600" name="notes" defaultValue={customer.notes}/></label><div className="flex justify-end gap-2 border-t border-neutral-200 pt-3"><Button type="button" variant="secondary" onClick={() => setEditing(false)}>Отмена</Button><Button type="submit">Сохранить</Button></div></form> : null}</Dialog>
  </main>;
}

