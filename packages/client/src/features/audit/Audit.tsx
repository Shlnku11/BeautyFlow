import { useEffect, useState } from 'react';
import { ApiClientError, apiRequest } from '@/lib/api-client';
import { useSession } from '@/hooks/use-session';
import { Input } from '@/components/ui/input';

type AuditItem = { id: string; action: string; entityType: string; entityId: string; actor: { id: string; name: string; role: string }; createdAt: string; routeId?: string; method?: string; fieldNames?: string[] };
const actionLabels: Record<string, string> = { 'shift.started': 'Начал(а) смену', 'shift.closed': 'Завершил(а) смену', 'payment.created': 'Принял(а) оплату', 'payment.refunded': 'Оформил(а) возврат', 'payment.cancelled': 'Отменил(а) платёж', 'appointment.cancelled': 'Отменил(а) запись', 'member.invited': 'Пригласил(а) сотрудника', 'member.disabled': 'Изменил(а) доступ сотрудника', 'service.deleted': 'Удалил(а) услугу', 'customer.deleted': 'Удалил(а) клиента', 'settings.updated': 'Изменил(а) настройки', 'request.activity': 'Выполнил(а) действие в кабинете', 'account.profile_updated': 'Изменил(а) профиль аккаунта', 'auth.password_changed': 'Изменил(а) пароль' };
const routeLabels: Record<string, string> = { 'APT-02': 'создал(а) запись', 'APT-03': 'просмотрел(а) запись', 'APT-04': 'изменил(а) запись', 'APT-05': 'перенёс(ла) запись', 'APT-06': 'изменил(а) статус записи', 'STF-06': 'изменил(а) расписание', 'STF-07': 'добавил(а) исключение расписания', 'STF-08': 'изменил(а) исключение расписания', 'STF-09': 'удалил(а) исключение расписания', 'CUS-02': 'добавил(а) клиента', 'CUS-04': 'изменил(а) данные клиента', 'PAY-02': 'принял(а) оплату', 'PAY-06': 'оформил(а) возврат' };
function label(item: AuditItem) { return (item.routeId && routeLabels[item.routeId]) || actionLabels[item.action] || item.action; }
function formatDate(value: string, timezone: string) { return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(value)); }

export function AuditPage() {
  const timezone = useSession().data?.active.business.timezone ?? 'UTC';
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<AuditItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    const params = new URLSearchParams({ limit: '100' });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    void apiRequest<{ data: AuditItem[] }>(`/api/audit?${params}`, { signal: controller.signal }).then((result) => setRows(result.data)).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof ApiClientError ? reason.message : 'Не удалось загрузить историю действий.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [from, to]);
  const normalized = query.trim().toLocaleLowerCase('ru-RU');
  const visible = rows.filter((row) => [row.actor.name, row.actor.role, label(row), row.entityType].some((part) => part.toLocaleLowerCase('ru-RU').includes(normalized)));
  return <main className="mx-auto w-full max-w-[1440px] px-5 py-6 md:px-8"><header><h1 className="text-2xl font-semibold">История действий</h1><p className="mt-1 text-sm text-neutral-600">Кто и когда работал с записями, расписанием, клиентами и сменами.</p></header>
    <div className="mt-5 flex flex-wrap items-end gap-3"><label className="grid gap-1 text-xs text-neutral-600">С<Input type="date" value={from} onChange={(event) => setFrom(event.target.value)}/></label><label className="grid gap-1 text-xs text-neutral-600">По<Input type="date" value={to} onChange={(event) => setTo(event.target.value)}/></label><label className="grid min-w-52 flex-1 gap-1 text-xs text-neutral-600">Поиск сотрудника или действия<Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Например, Алия или смена"/></label></div>
    {error ? <p className="mt-4 text-sm text-danger-fg" role="alert">{error}</p> : null}{loading ? <p className="mt-4 text-sm text-neutral-500" role="status">Загружаем историю…</p> : null}
    {!loading && !error ? visible.length ? <ol className="mt-4 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-neutral-0">{visible.map((item) => <li className="grid gap-1 p-4 sm:grid-cols-[minmax(180px,0.75fr)_minmax(0,2fr)] sm:gap-4" key={item.id}><time className="text-xs tabular-nums text-neutral-500" dateTime={item.createdAt}>{formatDate(item.createdAt, timezone)}</time><div><p className="text-sm"><strong>{item.actor.name}</strong> · {label(item)}</p><p className="mt-1 text-xs text-neutral-500">{item.actor.role === 'master' ? 'Мастер' : item.actor.role === 'admin' ? 'Менеджер' : item.actor.role === 'owner' ? 'Владелец' : item.actor.role}{item.fieldNames?.length ? ` · поля: ${item.fieldNames.join(', ')}` : ''}{item.routeId ? ` · ${item.routeId}` : ''}</p></div></li>)}</ol> : <p className="mt-4 rounded-lg border border-neutral-200 bg-neutral-0 p-8 text-center text-sm text-neutral-500">Действий за этот период нет.</p> : null}
  </main>;
}
