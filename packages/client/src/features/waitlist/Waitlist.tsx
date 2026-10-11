import { useEffect, useState, type FormEvent } from 'react';
import { DateTime } from 'luxon';
import { ApiClientError, apiRequest } from '@/lib/api-client';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { DialogShell as Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type Customer = { id: string; firstName: string; lastName?: string; phone: string };
type Service = { id: string; name: string; staffIds: string[] };
type Staff = { id: string; displayName: string; serviceIds?: string[] };
type Entry = { id: string; customer: { id: string; name: string; phone: string }; service: { id: string; name: string }; staff: { id: string; name: string } | null; fromDate: string; toDate: string; preferredTimeStart?: string; preferredTimeEnd?: string; note?: string; status: 'active' | 'contacted' | 'booked' | 'paused'; lastOfferedStartAt?: string; createdAt: string };
function message(error: unknown) { return error instanceof ApiClientError ? error.message : 'Не удалось выполнить операцию.'; }
const statusLabel = { active: 'Ожидает', contacted: 'Связались', booked: 'Записан', paused: 'Приостановлен' } as const;

export function WaitlistPage() {
  const timezone = useSession().data?.active.business.timezone ?? 'Asia/Bishkek';
  const [rows, setRows] = useState<Entry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const today = DateTime.now().setZone(timezone).toISODate() ?? '';
  const [fromDate, setFromDate] = useState(today);

  async function load() {
    setLoading(true); setError('');
    try {
      const [list, customerList, serviceList, staffList] = await Promise.all([
        apiRequest<{ data: Entry[] }>('/api/waitlist'), apiRequest<{ data: Customer[] }>('/api/customers?limit=100&page=1'), apiRequest<Service[]>('/api/services?isActive=true'), apiRequest<Staff[]>('/api/staff'),
      ]);
      setRows(list.data); setCustomers(customerList.data); setServices(serviceList); setStaff(staffList);
    } catch (reason: unknown) { setError(message(reason)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const query = customerSearch.trim();
    if (query.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void apiRequest<{ data: Customer[] }>(`/api/customers?q=${encodeURIComponent(query)}&limit=50&page=1`, { signal: controller.signal }).then((result) => setCustomers(result.data)).catch((reason: unknown) => { if (!controller.signal.aborted) setError(message(reason)); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [customerSearch]);

  async function createEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest('/api/waitlist', { method: 'POST', body: { customerId: form.get('customerId'), serviceId: form.get('serviceId'), ...(form.get('staffId') ? { staffId: form.get('staffId') } : {}), fromDate: form.get('fromDate'), toDate: form.get('toDate'), ...(form.get('preferredTimeStart') ? { preferredTimeStart: form.get('preferredTimeStart'), preferredTimeEnd: form.get('preferredTimeEnd') } : {}), ...(form.get('note') ? { note: form.get('note') } : {}) } });
      setCreateOpen(false); setNotice('Клиент добавлен в лист ожидания.'); await load();
    } catch (reason: unknown) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  async function setStatus(entry: Entry, status: Entry['status']) {
    setError('');
    try { await apiRequest(`/api/waitlist/${entry.id}`, { method: 'PATCH', body: { status } }); setRows((current) => current.map((row) => row.id === entry.id ? { ...row, status } : row)); }
    catch (reason: unknown) { setError(message(reason)); }
  }
  const availableCustomers = customerSearch.trim().length < 2 ? customers.filter((customer) => `${customer.firstName} ${customer.lastName ?? ''} ${customer.phone}`.toLocaleLowerCase('ru').includes(customerSearch.toLocaleLowerCase('ru'))) : customers;
  const selectedService = services.find((service) => service.id === selectedServiceId);
  const eligibleStaff = selectedService ? staff.filter((person) => selectedService.staffIds.includes(person.id)) : [];
  return <main className="mx-auto w-full max-w-[1440px] px-5 py-6 md:px-8">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Лист ожидания</h1><p className="mt-1 text-sm text-neutral-600">При отмене записи менеджеры получат список клиентов, которым подходит освободившееся время.</p></div><Button disabled={!customers.length || !services.length} onClick={() => { setFromDate(today); setCustomerSearch(''); setSelectedServiceId(''); setCreateOpen(true); }}>＋ Добавить клиента</Button></header>
    {error ? <p className="mt-4 text-sm text-danger-fg" role="alert">{error}</p> : null}{notice ? <p className="mt-4 text-sm text-success-fg" role="status">{notice}</p> : null}
    {loading ? <p className="mt-5 text-sm text-neutral-500" role="status">Загружаем лист ожидания…</p> : rows.length ? <div className="mt-5 overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-0"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-neutral-50 text-xs text-neutral-500"><tr><th className="px-4 py-3">Клиент</th><th className="px-4 py-3">Услуга и мастер</th><th className="px-4 py-3">Период</th><th className="px-4 py-3">Время</th><th className="px-4 py-3">Статус</th><th className="px-4 py-3">Действие</th></tr></thead><tbody>{rows.map((entry) => <tr className="border-t border-neutral-100" key={entry.id}><td className="px-4 py-3"><strong className="block">{entry.customer.name}</strong><span className="text-xs text-neutral-500">{entry.customer.phone}</span></td><td className="px-4 py-3">{entry.service.name}<span className="block text-xs text-neutral-500">{entry.staff?.name ?? 'Любой мастер'}</span></td><td className="whitespace-nowrap px-4 py-3">{entry.fromDate} — {entry.toDate}</td><td className="px-4 py-3">{entry.preferredTimeStart ? `${entry.preferredTimeStart}–${entry.preferredTimeEnd}` : 'Любое'}</td><td className="px-4 py-3">{statusLabel[entry.status]}{entry.lastOfferedStartAt ? <span className="block text-xs text-neutral-500">Предложено: {new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: timezone }).format(new Date(entry.lastOfferedStartAt))}</span> : null}</td><td className="px-4 py-3"><select aria-label={`Статус для ${entry.customer.name}`} className="h-9 rounded-md border border-neutral-300 bg-neutral-0 px-2 text-sm" value={entry.status} onChange={(event) => { void setStatus(entry, event.target.value as Entry['status']); }}><option value="active">Ожидает</option><option value="contacted">Связались</option><option value="booked">Записан</option><option value="paused">Приостановлен</option></select></td></tr>)}</tbody></table></div> : <section className="mt-5 rounded-lg border border-neutral-200 bg-neutral-0 p-6 text-center"><h2 className="font-medium">Лист ожидания пуст</h2><p className="mt-1 text-sm text-neutral-600">Добавьте клиента, которому подойдёт освободившееся время.</p></section>}
    <Dialog open={createOpen} title="Добавить в лист ожидания" onClose={() => setCreateOpen(false)}><form className="grid gap-3" onSubmit={(event) => { void createEntry(event); }}><label className="grid gap-1 text-sm">Поиск клиента<Input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Имя или телефон" autoComplete="off"/></label><label className="grid gap-1 text-sm">Клиент<select className="h-10 rounded-md border border-neutral-300 bg-neutral-0 px-3" name="customerId" required defaultValue=""><option disabled value="">Выберите клиента</option>{availableCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.firstName} {customer.lastName ?? ''} · {customer.phone}</option>)}</select></label><label className="grid gap-1 text-sm">Услуга<select className="h-10 rounded-md border border-neutral-300 bg-neutral-0 px-3" name="serviceId" required defaultValue="" onChange={(event) => setSelectedServiceId(event.target.value)}><option disabled value="">Выберите услугу</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label><label className="grid gap-1 text-sm">Предпочтительный мастер<select className="h-10 rounded-md border border-neutral-300 bg-neutral-0 px-3" name="staffId" defaultValue=""><option value="">Любой мастер</option>{eligibleStaff.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm">С даты<Input name="fromDate" type="date" min={today} defaultValue={fromDate} required/></label><label className="grid gap-1 text-sm">По дату<Input name="toDate" type="date" min={today} defaultValue={DateTime.fromISO(fromDate).plus({ days: 14 }).toISODate() ?? fromDate} required/></label></div><div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm">Время с<Input name="preferredTimeStart" type="time"/></label><label className="grid gap-1 text-sm">Время до<Input name="preferredTimeEnd" type="time"/></label></div><label className="grid gap-1 text-sm">Заметка<Input name="note" maxLength={500} placeholder="Например, готов прийти в тот же день"/></label><p className="text-xs text-neutral-500">Когда подходящее окно освободится, уведомление увидят только владелец и менеджеры.</p><div className="flex justify-end gap-2 border-t pt-3"><Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>Отмена</Button><Button disabled={busy} type="submit">Добавить</Button></div></form></Dialog>
  </main>;
}
