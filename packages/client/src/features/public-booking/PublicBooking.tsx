import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { apiRequest, ApiClientError } from '@/lib/api-client';

interface PublicProfile { name: string; slug: string; timezone: string; address?: string; phone?: string; consent: { required: boolean; text?: string }; }
interface PublicService { id: string; name: string; durationMinutes: number; priceMinor: number; currency: string; }
interface PublicStaff { id: string; displayName: string; }
interface PublicSlot { startAt: string; }
interface PublicAppointment { id: string; business: { name: string; timezone: string }; service: { name: string }; staff: { displayName: string }; startAt: string; status: string; canCancel: boolean; canReschedule: boolean; }
const controlClass = 'h-9 w-full rounded-md border border-neutral-200 bg-neutral-0 px-3 text-sm text-neutral-900 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/20';
function displayError(error: unknown): string { return error instanceof ApiClientError ? error.message : 'Не удалось загрузить данные. Попробуйте ещё раз.'; }
export function PublicBooking() {
  const { slug = '' } = useParams();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [services, setServices] = useState<PublicService[]>([]);
  const [staff, setStaff] = useState<PublicStaff[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [staffId, setStaffId] = useState('any');
  const [date, setDate] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [result, setResult] = useState<{ appointment: PublicAppointment; manageUrl: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    void Promise.all([apiRequest<PublicProfile>(`/api/public/b/${encodeURIComponent(slug)}`), apiRequest<PublicService[]>(`/api/public/b/${encodeURIComponent(slug)}/services`)]).then(([nextProfile, nextServices]) => {
      if (current) { setProfile(nextProfile); setServices(nextServices); setServiceId(nextServices[0]?.id ?? ''); }
    }).catch((reason: unknown) => { if (current) setError(displayError(reason)); });
    return () => { current = false; };
  }, [slug]);
    if (!serviceId) return;
    void apiRequest<PublicStaff[]>(`/api/public/b/${encodeURIComponent(slug)}/staff?serviceId=${encodeURIComponent(serviceId)}`).then((nextStaff) => { if (current) setStaff(nextStaff); }).catch((reason: unknown) => { if (current) setError(displayError(reason)); });
  }, [slug, serviceId]);
  async function loadSlots() {
    if (!serviceId || !date) return;
    setError(''); setSelectedSlot('');
    try {
      const value = await apiRequest<{ slots: PublicSlot[] }>(`/api/public/b/${encodeURIComponent(slug)}/availability?serviceId=${encodeURIComponent(serviceId)}&staffId=${encodeURIComponent(staffId)}&date=${encodeURIComponent(date)}`);
      setSlots(value.slots);
    } catch (reason: unknown) { setError(displayError(reason)); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (!selectedSlot) { setError('Выберите время.'); return; }
    const values = new FormData(event.currentTarget);
    const lastName = String(values.get('lastName') ?? '').trim();
    const email = String(values.get('email') ?? '').trim();
    const payload = { serviceId, staffId, startAt: selectedSlot, customer: { firstName: String(values.get('firstName') ?? ''), ...(lastName ? { lastName } : {}), phone: String(values.get('phone') ?? ''), ...(email ? { email } : {}) }, customerNote: String(values.get('customerNote') ?? ''), acceptPrivacy: values.has('acceptPrivacy'), website: String(values.get('website') ?? '') };
      const created = await apiRequest<{ appointment: PublicAppointment; manageUrl: string }>(`/api/public/b/${encodeURIComponent(slug)}/appointments`, { method: 'POST', body: payload, idempotencyKey: crypto.randomUUID() });
      setResult(created);
    } catch (reason: unknown) { setError(reason instanceof ApiClientError && reason.code === 'SLOT_UNAVAILABLE' ? 'Это время только что заняли. Выберите другое.' : displayError(reason)); }
  if (result) return <main className="mx-auto grid min-h-screen w-full max-w-3xl content-center p-5 md:p-8"><section className="rounded-lg border border-neutral-200 bg-neutral-0 p-6 shadow-sm"><p className="text-sm font-medium text-success-fg">Готово</p><h1 className="mt-2 text-2xl font-semibold">Запись оформлена</h1><p className="mt-3 text-sm text-neutral-600">{profile?.name}: {result.appointment.service.name}, {new Date(result.appointment.startAt).toLocaleString('ru-RU', { timeZone: profile?.timezone ?? 'UTC' })}</p><Link className="mt-5 inline-flex h-9 items-center rounded-md bg-primary-600 px-4 text-[13px] font-medium text-on-accent hover:bg-primary-700" to={result.manageUrl}>Управлять записью</Link></section></main>;
  return <main className="mx-auto grid w-full max-w-3xl gap-4 p-4 sm:p-6"><header className="rounded-lg border border-neutral-200 bg-neutral-0 p-5 shadow-sm sm:p-6"><p className="text-[13px] font-medium text-primary-700">Онлайн-запись</p><h1 className="mt-2 text-2xl font-semibold">{profile?.name ?? 'Загрузка…'}</h1>{profile?.address ? <p className="mt-2 text-sm text-neutral-600">{profile.address}</p> : null}{profile?.phone ? <a className="mt-2 inline-block text-sm font-medium text-neutral-700 hover:text-primary-700" href={`tel:${profile.phone}`}>{profile.phone}</a> : null}</header>
    <form className="grid gap-5 rounded-lg border border-neutral-200 bg-neutral-0 p-5 shadow-sm sm:p-6" onSubmit={(event) => { void submit(event); }}>
      <h2 className="flex items-center gap-3 text-base font-semibold"><span className="grid size-7 place-items-center rounded-full bg-primary-100 text-xs font-semibold text-primary-800">1</span>Услуга и мастер</h2>
      <Label className="grid gap-1.5 text-[13px] font-medium text-neutral-600">Услуга<NativeSelect className={controlClass} value={serviceId} onChange={(event) => setServiceId(event.target.value)} required><option value="">Выберите услугу</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.durationMinutes} мин.</option>)}</NativeSelect></Label>
      <Label className="grid gap-1.5 text-[13px] font-medium text-neutral-600">Мастер<NativeSelect className={controlClass} value={staffId} onChange={(event) => setStaffId(event.target.value)}><option value="any">Любой мастер</option>{staff.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</NativeSelect></Label>
      <h2 className="flex items-center gap-3 border-t border-neutral-200 pt-5 text-base font-semibold"><span className="grid size-7 place-items-center rounded-full bg-primary-100 text-xs font-semibold text-primary-800">2</span>Дата и время</h2>
      <Label className="grid gap-1.5 text-[13px] font-medium text-neutral-600">Дата<Input className={controlClass} type="date" value={date} onChange={(event) => setDate(event.target.value)} required/></Label>
      <Button className="h-9 w-fit rounded-md border border-neutral-200 px-3 text-[13px] font-medium text-neutral-800 hover:bg-neutral-50" type="button" onClick={() => { void loadSlots(); }}>Показать время</Button>
      <div role="group" aria-label="Доступное время" className="flex flex-wrap gap-2">{slots.map((slot) => <Button aria-pressed={selectedSlot === slot.startAt} className={`h-9 min-h-9 rounded-md border px-3 text-[13px] font-medium ${selectedSlot === slot.startAt ? 'border-primary-600 bg-primary-100 text-primary-800' : 'border-neutral-200 bg-neutral-0 text-neutral-700 hover:bg-neutral-50'}`} key={slot.startAt} type="button" onClick={() => setSelectedSlot(slot.startAt)}>{new Date(slot.startAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: profile?.timezone ?? 'UTC' })}</Button>)}</div>
      <h2 className="flex items-center gap-3 border-t border-neutral-200 pt-5 text-base font-semibold"><span className="grid size-7 place-items-center rounded-full bg-primary-100 text-xs font-semibold text-primary-800">3</span>Контакты</h2>
      <div className="grid gap-4 sm:grid-cols-2"><Label className="grid gap-1.5 text-[13px] font-medium text-neutral-600">Имя<Input autoComplete="given-name" className={controlClass} name="firstName" required maxLength={80}/></Label><Label className="grid gap-1.5 text-[13px] font-medium text-neutral-600">Фамилия<Input autoComplete="family-name" className={controlClass} name="lastName" maxLength={80}/></Label><Label className="grid gap-1.5 text-[13px] font-medium text-neutral-600">Телефон<Input autoComplete="tel" className={controlClass} name="phone" required minLength={5} maxLength={64}/></Label><Label className="grid gap-1.5 text-[13px] font-medium text-neutral-600">Email<Input autoComplete="email" className={controlClass} name="email" type="email"/></Label></div>
      <Label className="grid gap-1.5 text-[13px] font-medium text-neutral-600">Комментарий<Textarea className="min-h-20 w-full rounded-md border border-neutral-200 bg-neutral-0 px-3 py-2 text-sm text-neutral-900 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/20" name="customerNote" maxLength={500}/></Label>
      <Label aria-hidden="true" className="hidden">Website<Input autoComplete="off" name="website" tabIndex={-1}/></Label>
      {profile?.consent.required ? <Label className="flex items-start gap-2"><Input className="mt-1" name="acceptPrivacy" required type="checkbox"/><span>{profile.consent.text || 'Согласен(на) на обработку персональных данных.'}</span></Label> : null}
      {error ? <p className="text-danger-fg" role="alert">{error}</p> : null}
      <Button className="h-9 w-fit rounded-md bg-primary-600 px-4 text-[13px] font-medium text-on-accent transition-colors hover:bg-primary-700" type="submit">Подтвердить запись</Button>
    </form>
  </main>;
}
export function PublicManage() {
  const { token = '' } = useParams();
  const [appointment, setAppointment] = useState<PublicAppointment | null>(null);
  useEffect(() => { let current = true; void apiRequest<PublicAppointment>(`/api/public/manage/${encodeURIComponent(token)}`).then((value) => { if (current) setAppointment(value); }).catch((reason: unknown) => { if (current) setError(displayError(reason)); }); return () => { current = false; }; }, [token]);
  async function cancel() { try { setAppointment(await apiRequest<PublicAppointment>(`/api/public/manage/${encodeURIComponent(token)}/cancel`, { method: 'POST', body: {} })); } catch (reason: unknown) { setError(displayError(reason)); } }
  async function findSlots() { try { const value = await apiRequest<{ slots: PublicSlot[] }>(`/api/public/manage/${encodeURIComponent(token)}/availability?date=${encodeURIComponent(date)}`); setSlots(value.slots); } catch (reason: unknown) { setError(displayError(reason)); } }
  async function move(startAt: string) { try { setAppointment(await apiRequest<PublicAppointment>(`/api/public/manage/${encodeURIComponent(token)}/reschedule`, { method: 'POST', body: { startAt } })); setSlots([]); } catch (reason: unknown) { setError(displayError(reason)); } }
  return <main className="mx-auto grid w-full max-w-2xl gap-4 p-4 sm:p-6"><h1 className="text-2xl font-semibold">Управление записью</h1>{appointment ? <><section className="rounded-lg border border-neutral-200 bg-neutral-0 p-5 shadow-sm"><p className="text-[13px] font-medium text-neutral-500">{appointment.business.name}</p><h2 className="mt-1 text-lg font-semibold">{appointment.service.name}</h2><p className="mt-2 text-sm tabular-nums text-neutral-600">{new Date(appointment.startAt).toLocaleString('ru-RU', { timeZone: appointment.business.timezone })} · {appointment.staff.displayName}</p></section>{appointment.canReschedule ? <section className="grid gap-3 rounded-lg border border-neutral-200 bg-neutral-0 p-5 shadow-sm"><h2 className="text-base font-semibold">Перенести запись</h2><Label className="grid gap-1.5 text-[13px] font-medium text-neutral-600">Новая дата<Input className={controlClass} type="date" value={date} onChange={(event) => setDate(event.target.value)}/></Label><Button className="h-9 w-fit rounded-md border border-neutral-200 px-3 text-[13px] font-medium hover:bg-neutral-50" type="button" onClick={() => { void findSlots(); }}>Показать время</Button><div className="flex flex-wrap gap-2">{slots.map((slot) => <Button className="h-9 rounded-md border border-neutral-200 px-3 text-[13px] hover:bg-neutral-50" key={slot.startAt} type="button" onClick={() => { void move(slot.startAt); }}>{new Date(slot.startAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: appointment.business.timezone })}</Button>)}</div></section> : null}{appointment.canCancel ? <Button className="h-9 w-fit rounded-md border border-danger-fg px-4 text-[13px] font-medium text-danger-fg hover:bg-danger-bg" type="button" onClick={() => { void cancel(); }}>Отменить запись</Button> : null}</> : null}{error ? <p className="text-sm text-danger-fg" role="alert">{error === 'Не найдено' ? 'Ссылка недействительна.' : error}</p> : null}</main>;