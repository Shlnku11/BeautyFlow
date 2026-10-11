import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { DateTime } from 'luxon';
import { Link } from 'react-router';
import { ApiClientError, apiRequest } from '@/lib/api-client';
import { DialogShell as AppDialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface Reference { id: string; name: string; }
interface StaffReference { id: string; displayName: string; }
interface CustomerReference { id: string; firstName: string; lastName?: string; phone: string; }
interface Appointment {
  id: string; startAt: string; endAt: string; status: 'pending'|'confirmed'|'completed'|'cancelled'|'no_show';
  customer: CustomerReference; staff: { id: string; displayName: string }; service: { id: string; name: string };
  customerNote?: string; internalNote?: string; visitNote?: string;
}
const field = 'h-9 w-full min-w-0 rounded-md border border-neutral-300 bg-neutral-0 px-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600';
const primary = 'inline-flex h-9 min-h-9 items-center justify-center rounded-md bg-primary-600 px-4 text-[13px] font-medium text-on-accent transition-colors hover:bg-primary-700 disabled:opacity-50';
const secondary = 'inline-flex h-9 min-h-9 items-center justify-center rounded-md border border-neutral-200 bg-neutral-0 px-4 text-[13px] font-medium text-neutral-900 transition-colors hover:bg-neutral-50 disabled:opacity-50';
function messageOf(error: unknown) {
  if (!(error instanceof ApiClientError)) return 'Не удалось связаться с сервером. Проверьте соединение и повторите попытку.';
  if (error.code === 'SLOT_UNAVAILABLE') return 'Это время уже заняли или оно вне графика. Выберите другой свободный слот.';
  if (error.code === 'STAFF_DOES_NOT_PROVIDE_SERVICE') return 'Выбранный мастер не оказывает эту услугу. Выберите другого мастера.';
  if (error.status >= 500 && error.requestId) return `${error.message} Код обращения: ${error.requestId}`;
  return error.message;
}

function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return <AppDialog open title={title} onClose={onClose} footer={footer}>{children}</AppDialog>;
}

export function AppointmentCreateDialog({ date, startAt, timezone, staff: initialStaff, preselectedStaffId, onClose, onCreated }: { date: string; startAt: string; timezone: string; staff: StaffReference[]; preselectedStaffId?: string; onClose: () => void; onCreated: () => void }) {
  const [services, setServices] = useState<Reference[]>([]); const [customers, setCustomers] = useState<CustomerReference[]>([]); const [staff, setStaff] = useState(initialStaff); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [referencesLoading, setReferencesLoading] = useState(true);
  useEffect(() => { const controller = new AbortController(); void Promise.all([apiRequest<{ id: string; name: string }[]>('/api/services?isActive=true', { signal: controller.signal }), apiRequest<CustomerReference[]>('/api/customers?limit=100', { signal: controller.signal }), apiRequest<StaffReference[]>('/api/staff', { signal: controller.signal })]).then(([serviceRows, customerRows, staffRows]) => { setServices(serviceRows.map(({ id,name }) => ({ id,name }))); setCustomers(customerRows); setStaff(staffRows); }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(messageOf(reason)); }).finally(() => { if (!controller.signal.aborted) setReferencesLoading(false); }); return () => controller.abort(); }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); const data = new FormData(event.currentTarget);
    const localDateTime = `${String(data.get('date'))}T${String(data.get('time'))}`; const zoned = DateTime.fromISO(localDateTime, { zone: timezone });
    if (!zoned.isValid || zoned.toFormat('yyyy-MM-dd\'T\'HH:mm') !== localDateTime) { setError('Это местное время некорректно из-за перехода часового пояса.'); setBusy(false); return; }
    const customerId = String(data.get('customerId') ?? '');
    try { await apiRequest('/api/appointments', { method: 'POST', idempotencyKey: crypto.randomUUID(), body: { customerId, serviceId: String(data.get('serviceId')), staffId: String(data.get('staffId')), startAt: zoned.toUTC().toISO(), status: String(data.get('status')), customerNote: data.get('customerNote') || undefined, internalNote: data.get('internalNote') || undefined, notifyCustomer: data.has('notifyCustomer') } }); onCreated(); onClose(); }
    catch (reason: unknown) { setError(messageOf(reason)); } finally { setBusy(false); }
  }
  return <Modal title="Новая запись" onClose={onClose}><form className="grid min-w-0 gap-4 sm:grid-cols-2" onSubmit={(event) => { void create(event); }}>
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2"><label className="grid min-w-0 gap-1 text-[13px] font-medium text-neutral-600">Дата<input className={`${field} tabular-nums`} type="date" name="date" defaultValue={date} required/></label><label className="grid min-w-0 gap-1 text-[13px] font-medium text-neutral-600">Время<input className={`${field} tabular-nums`} type="time" name="time" defaultValue={DateTime.fromISO(startAt).setZone(timezone).toFormat('HH:mm')} required/></label></div>
    <label className="grid min-w-0 gap-1 text-[13px] font-medium text-neutral-600 sm:col-span-2"><span>Клиент <span aria-hidden="true" className="text-danger-fg">*</span></span><select className={field} name="customerId" required defaultValue=""><option value="" disabled>Выберите клиента</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.firstName} {customer.lastName ?? ''} · {customer.phone}</option>)}</select><Link className="text-xs font-medium text-primary-700 hover:text-primary-800" to="/app/customers">Добавить клиента</Link></label>
    <label className="grid min-w-0 gap-1 text-[13px] font-medium text-neutral-600"><span>Услуга <span aria-hidden="true" className="text-danger-fg">*</span></span><select className={field} name="serviceId" required defaultValue=""><option value="" disabled>Выберите услугу</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
    <label className="grid min-w-0 gap-1 text-[13px] font-medium text-neutral-600">Мастер<select className={field} name="staffId" required defaultValue={preselectedStaffId || 'any'}><option value="any">Любой мастер</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label>
    <label className="grid min-w-0 gap-1 text-[13px] font-medium text-neutral-600">Статус при создании<select className={field} name="status"><option value="pending">Ожидает подтверждения</option><option value="confirmed">Подтверждена</option></select></label><div className="flex items-center sm:pt-5"><label className="flex items-center gap-2 text-[13px] text-neutral-700"><input type="checkbox" name="notifyCustomer" defaultChecked/>Отправить уведомление</label></div>
    <label className="grid min-w-0 gap-1 text-[13px] font-medium text-neutral-600">Заметка для клиента<textarea className={`${field} h-auto min-h-20 py-2`} name="customerNote"/></label><label className="grid min-w-0 gap-1 text-[13px] font-medium text-neutral-600">Внутренняя заметка<textarea className={`${field} h-auto min-h-20 py-2`} name="internalNote"/></label>
    {referencesLoading ? <p role="status" className="text-xs text-neutral-500 sm:col-span-2">Загружаем клиентов и услуги…</p> : null}{!referencesLoading && (services.length === 0 || customers.length === 0) && !error ? <p role="status" className="text-sm text-neutral-500 sm:col-span-2">Чтобы создать запись, добавьте клиента и активную услугу.</p> : null}{error ? <p role="alert" className="text-sm text-danger-fg sm:col-span-2">{error}</p> : null}
    <div className="flex justify-end gap-2 border-t border-neutral-200 pt-3 sm:col-span-2"><button className={secondary} type="button" onClick={onClose}>Отмена</button><button className={primary} disabled={busy || referencesLoading || services.length === 0 || customers.length === 0}>{busy ? 'Сохранение…' : referencesLoading ? 'Загружаем…' : 'Создать запись'}</button></div>
  </form></Modal>;
}

const allowedActions: Record<Appointment['status'], Record<string, Appointment['status'][]>> = {
  pending: { owner: ['confirmed','completed','cancelled','no_show'], admin: ['confirmed','completed','cancelled','no_show'], master: ['confirmed','cancelled'] },
  confirmed: { owner: ['completed','cancelled','no_show'], admin: ['completed','cancelled','no_show'], master: ['completed','cancelled','no_show'] },
  completed: { owner: ['confirmed'], admin: ['confirmed'] }, cancelled: { owner: ['confirmed'], admin: ['confirmed'] }, no_show: { owner: ['confirmed','completed'], admin: ['confirmed','completed'] },
};
const statusLabels: Record<Appointment['status'], string> = { pending: 'Ожидает', confirmed: 'Подтверждена', completed: 'Завершена', cancelled: 'Отменена', no_show: 'Неявка' };
const statusTone: Record<Appointment['status'], 'neutral' | 'success' | 'warning' | 'danger'> = { pending: 'warning', confirmed: 'neutral', completed: 'success', cancelled: 'danger', no_show: 'danger' };

export function AppointmentDetailDialog({ id, timezone, role, permissions, onClose, onChanged }: { id: string; timezone: string; role: string; permissions: string[]; onClose: () => void; onChanged: () => void }) {
  const [appointment, setAppointment] = useState<Appointment | null>(null); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { const controller = new AbortController(); void apiRequest<Appointment>(`/api/appointments/${id}`, { signal: controller.signal }).then((value) => { if (!controller.signal.aborted) { setAppointment(value); setError(null); } }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(messageOf(reason)); }); return () => controller.abort(); }, [id]);
  async function patch(path: string, body: unknown) { setBusy(true); setError(null); setNotice(null); try { const updated = await apiRequest<Appointment>(path, { method: path.endsWith('/status') || path.endsWith('/reschedule') ? 'POST' : 'PATCH', body }); setAppointment(updated); setNotice(path.endsWith('/reschedule') ? 'Запись перенесена.' : path.endsWith('/status') ? 'Статус записи обновлён.' : 'Изменения сохранены.'); onChanged(); } catch (reason: unknown) { setError(messageOf(reason)); } finally { setBusy(false); } }
  async function saveNotes(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); await patch(`/api/appointments/${id}`, role === 'master' ? { visitNote: data.get('visitNote') || '' } : { customerNote: data.get('customerNote') || '', internalNote: data.get('internalNote') || '' }); }
  async function changeStatus(status: Appointment['status']) { const cancelReason = status === 'cancelled' ? window.prompt('Причина отмены (необязательно)') ?? '' : undefined; await patch(`/api/appointments/${id}/status`, { status, ...(cancelReason ? { cancelReason } : {}), notifyCustomer: true }); }
  async function reschedule(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!appointment) return; const data = new FormData(event.currentTarget); const dateTime = `${String(data.get('date'))}T${String(data.get('time'))}`; const zoned = DateTime.fromISO(dateTime, { zone: timezone }); if (!zoned.isValid || zoned.toFormat('yyyy-MM-dd\'T\'HH:mm') !== dateTime) { setError('Некорректное локальное время.'); return; } await patch(`/api/appointments/${id}/reschedule`, { startAt: zoned.toUTC().toISO(), staffId: appointment.staff.id, notifyCustomer: true }); }
  const actions = appointment ? allowedActions[appointment.status][role] ?? [] : [];
  const primaryAction = actions[0];
  return <Modal title="Запись" onClose={onClose} footer={<><button className={secondary} onClick={onClose}>Закрыть</button>{primaryAction ? <button className={primary} disabled={busy} onClick={() => { void changeStatus(primaryAction); }}>{primaryAction === 'confirmed' ? 'Подтвердить' : statusLabels[primaryAction]}</button> : null}</>}>{!appointment ? <p role="status">Загрузка записи…</p> : <div className="grid gap-5">
    <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
      <div><dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-500">Клиент</dt><dd className="mt-1 text-sm font-medium">{appointment.customer.firstName} {appointment.customer.lastName ?? ''}</dd></div>
      <div><dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-500">Телефон</dt><dd className="mt-1 text-sm font-medium">{appointment.customer.phone}</dd></div>
      <div><dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-500">Услуга</dt><dd className="mt-1 text-sm font-medium">{appointment.service.name}</dd></div>
      <div><dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-500">Мастер</dt><dd className="mt-1 text-sm font-medium">{appointment.staff.displayName}</dd></div>
      <div><dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-500">Время</dt><dd className="mt-1 text-sm font-medium tabular-nums">{DateTime.fromISO(appointment.startAt).setZone(timezone).toFormat('dd.LL.yyyy HH:mm')}</dd></div>
      <div><dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-500">Статус</dt><dd className="mt-1"><Badge tone={statusTone[appointment.status]}>{statusLabels[appointment.status]}</Badge></dd></div>
    </dl>
    <div className="flex flex-wrap gap-2 border-y border-neutral-200 py-3">{actions.filter((status) => status !== primaryAction).map((status) => <button className={secondary} disabled={busy} key={status} onClick={() => { void changeStatus(status); }}>{statusLabels[status]}</button>)}{permissions.includes('payments:create') ? <Link className={secondary} to={`/app/payments?appointmentId=${id}`}>＋ Принять оплату</Link> : null}</div>
    {permissions.includes('appointments:update') || permissions.includes('appointments:visit_note') ? <form className="grid gap-3" onSubmit={(event) => { void saveNotes(event); }}><h3 className="text-sm font-semibold">Заметки</h3>{role === 'master' ? <label className="grid gap-1 text-[13px] font-medium text-neutral-600">Заметка о визите<textarea className={`${field} h-auto min-h-20 py-2`} name="visitNote" defaultValue={appointment.visitNote}/></label> : <><label className="grid gap-1 text-[13px] font-medium text-neutral-600">Для клиента<textarea className={`${field} h-auto min-h-16 py-2`} name="customerNote" defaultValue={appointment.customerNote}/></label><label className="grid gap-1 text-[13px] font-medium text-neutral-600">Внутренняя<textarea className={`${field} h-auto min-h-16 py-2`} name="internalNote" defaultValue={appointment.internalNote}/></label></>}<button className={`${secondary} justify-self-start`} disabled={busy}>Сохранить заметки</button></form> : null}
    {permissions.includes('appointments:reschedule') && ['pending','confirmed'].includes(appointment.status) ? <form key={appointment.startAt} className="grid min-w-0 grid-cols-1 gap-3 border-t border-neutral-200 pt-4 sm:grid-cols-2" onSubmit={(event) => { void reschedule(event); }}><h3 className="text-sm font-semibold sm:col-span-2">Перенести запись</h3><label className="grid min-w-0 gap-1 text-[13px] font-medium text-neutral-600">Дата<input className={`${field} tabular-nums`} type="date" name="date" defaultValue={DateTime.fromISO(appointment.startAt).setZone(timezone).toISODate() ?? ''}/></label><label className="grid min-w-0 gap-1 text-[13px] font-medium text-neutral-600">Время<input className={`${field} tabular-nums`} type="time" name="time" defaultValue={DateTime.fromISO(appointment.startAt).setZone(timezone).toFormat('HH:mm')}/></label><button className={`${secondary} justify-self-start sm:col-span-2`} disabled={busy}>{busy ? 'Переносим…' : 'Сохранить перенос'}</button></form> : null}
    {error ? <p role="alert" className="rounded-md border border-danger-solid/20 bg-danger-bg px-3 py-2 text-sm text-danger-fg">{error}</p> : null}{notice ? <p role="status" className="rounded-md border border-success-solid/20 bg-success-bg px-3 py-2 text-sm text-success-fg">{notice}</p> : null}</div>}</Modal>;
}
