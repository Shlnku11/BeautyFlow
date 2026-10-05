import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { apiRequest, ApiClientError } from '@/lib/api-client';

interface PublicProfile { name: string; slug: string; timezone: string; address?: string; phone?: string; consent: { required: boolean; text?: string }; }
interface PublicService { id: string; name: string; durationMinutes: number; priceMinor: number; currency: string; }
interface PublicStaff { id: string; displayName: string; }
interface PublicSlot { startAt: string; }
interface PublicAppointment { id: string; business: { name: string; timezone: string }; service: { name: string }; staff: { displayName: string }; startAt: string; status: string; canCancel: boolean; canReschedule: boolean; }

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

  useEffect(() => {
    if (!serviceId) return;
    let current = true;
    void apiRequest<PublicStaff[]>(`/api/public/b/${encodeURIComponent(slug)}/staff?serviceId=${encodeURIComponent(serviceId)}`).then((nextStaff) => { if (current) setStaff(nextStaff); }).catch((reason: unknown) => { if (current) setError(displayError(reason)); });
    return () => { current = false; };
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
    try {
      const created = await apiRequest<{ appointment: PublicAppointment; manageUrl: string }>(`/api/public/b/${encodeURIComponent(slug)}/appointments`, { method: 'POST', body: payload, idempotencyKey: crypto.randomUUID() });
      setResult(created);
    } catch (reason: unknown) { setError(reason instanceof ApiClientError && reason.code === 'SLOT_UNAVAILABLE' ? 'Это время только что заняли. Выберите другое.' : displayError(reason)); }
  }

  if (result) return <main className="mx-auto max-w-2xl p-6"><h1 className="text-2xl font-semibold">Запись оформлена</h1><p className="mt-3">{profile?.name}: {result.appointment.service.name}, {new Date(result.appointment.startAt).toLocaleString('ru-RU', { timeZone: profile?.timezone ?? 'UTC' })}</p><Link className="mt-5 inline-block text-primary-700 underline" to={result.manageUrl}>Управлять записью</Link></main>;

  return <main className="mx-auto grid w-full max-w-3xl gap-6 p-6"><header className="glass-surface rounded-clay-card p-6"><p className="text-sm font-semibold text-primary-700">Онлайн-запись</p><h1 className="mt-2 text-3xl font-semibold">{profile?.name ?? 'Загрузка…'}</h1>{profile?.address ? <p className="mt-2 text-neutral-600">{profile.address}</p> : null}</header>
    <form className="grid gap-5 rounded-clay-card border border-white/80 bg-clay-raised p-6 shadow-clay" onSubmit={(event) => { void submit(event); }}>
      <h2 className="rounded-clay-control bg-clay px-4 py-3 text-xl font-semibold shadow-clay">1. Услуга и мастер</h2>
      <label className="grid gap-1">Услуга<select className="rounded-lg border border-neutral-300 px-3 py-2" value={serviceId} onChange={(event) => setServiceId(event.target.value)} required><option value="">Выберите услугу</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.durationMinutes} мин.</option>)}</select></label>
      <label className="grid gap-1">Мастер<select className="rounded-lg border border-neutral-300 px-3 py-2" value={staffId} onChange={(event) => setStaffId(event.target.value)}><option value="any">Любой мастер</option>{staff.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
      <h2 className="rounded-clay-control bg-clay px-4 py-3 text-xl font-semibold shadow-clay">2. Дата и время</h2>
      <label className="grid gap-1">Дата<input className="rounded-lg border border-neutral-300 px-3 py-2" type="date" value={date} onChange={(event) => setDate(event.target.value)} required/></label>
      <button className="w-fit rounded-lg border border-neutral-300 px-4 py-2" type="button" onClick={() => { void loadSlots(); }}>Показать время</button>
      <div role="group" aria-label="Доступное время" className="flex flex-wrap gap-2">{slots.map((slot) => <button aria-pressed={selectedSlot === slot.startAt} className={`rounded-lg border px-3 py-2 ${selectedSlot === slot.startAt ? 'border-primary-700 bg-primary-50' : 'border-neutral-300'}`} key={slot.startAt} type="button" onClick={() => setSelectedSlot(slot.startAt)}>{new Date(slot.startAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: profile?.timezone ?? 'UTC' })}</button>)}</div>
      <h2 className="rounded-clay-control bg-clay px-4 py-3 text-xl font-semibold shadow-clay">3. Контакты</h2>
      <label className="grid gap-1">Имя<input autoComplete="given-name" className="rounded-lg border border-neutral-300 px-3 py-2" name="firstName" required maxLength={80}/></label>
      <label className="grid gap-1">Фамилия<input autoComplete="family-name" className="rounded-lg border border-neutral-300 px-3 py-2" name="lastName" maxLength={80}/></label>
      <label className="grid gap-1">Телефон<input autoComplete="tel" className="rounded-lg border border-neutral-300 px-3 py-2" name="phone" required minLength={5} maxLength={64}/></label>
      <label className="grid gap-1">Email<input autoComplete="email" className="rounded-lg border border-neutral-300 px-3 py-2" name="email" type="email"/></label>
      <label className="grid gap-1">Комментарий<textarea className="rounded-lg border border-neutral-300 px-3 py-2" name="customerNote" maxLength={500}/></label>
      <label aria-hidden="true" className="hidden">Website<input autoComplete="off" name="website" tabIndex={-1}/></label>
      {profile?.consent.required ? <label className="flex items-start gap-2"><input className="mt-1" name="acceptPrivacy" required type="checkbox"/><span>{profile.consent.text || 'Согласен(на) на обработку персональных данных.'}</span></label> : null}
      {error ? <p className="text-danger-fg" role="alert">{error}</p> : null}
      <button className="w-fit rounded-lg bg-primary-600 px-5 py-3 font-medium text-neutral-0" type="submit">Подтвердить запись</button>
    </form>
  </main>;
}

export function PublicManage() {
  const { token = '' } = useParams();
  const [appointment, setAppointment] = useState<PublicAppointment | null>(null);
  const [date, setDate] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { let current = true; void apiRequest<PublicAppointment>(`/api/public/manage/${encodeURIComponent(token)}`).then((value) => { if (current) setAppointment(value); }).catch((reason: unknown) => { if (current) setError(displayError(reason)); }); return () => { current = false; }; }, [token]);
  async function cancel() { try { setAppointment(await apiRequest<PublicAppointment>(`/api/public/manage/${encodeURIComponent(token)}/cancel`, { method: 'POST', body: {} })); } catch (reason: unknown) { setError(displayError(reason)); } }
  async function findSlots() { try { const value = await apiRequest<{ slots: PublicSlot[] }>(`/api/public/manage/${encodeURIComponent(token)}/availability?date=${encodeURIComponent(date)}`); setSlots(value.slots); } catch (reason: unknown) { setError(displayError(reason)); } }
  async function move(startAt: string) { try { setAppointment(await apiRequest<PublicAppointment>(`/api/public/manage/${encodeURIComponent(token)}/reschedule`, { method: 'POST', body: { startAt } })); setSlots([]); } catch (reason: unknown) { setError(displayError(reason)); } }
  return <main className="mx-auto grid max-w-2xl gap-5 p-6"><h1 className="text-2xl font-semibold">Управление записью</h1>{appointment ? <><p>{appointment.business.name}: {appointment.service.name}, {new Date(appointment.startAt).toLocaleString('ru-RU', { timeZone: appointment.business.timezone })}</p>{appointment.canReschedule ? <section className="grid gap-3"><label className="grid gap-1">Новая дата<input className="rounded-lg border border-neutral-300 px-3 py-2" type="date" value={date} onChange={(event) => setDate(event.target.value)}/></label><button className="w-fit rounded-lg border border-neutral-300 px-4 py-2" type="button" onClick={() => { void findSlots(); }}>Показать время</button><div className="flex flex-wrap gap-2">{slots.map((slot) => <button className="rounded-lg border border-neutral-300 px-3 py-2" key={slot.startAt} type="button" onClick={() => { void move(slot.startAt); }}>{new Date(slot.startAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: appointment.business.timezone })}</button>)}</div></section> : null}{appointment.canCancel ? <button className="w-fit rounded-lg border border-danger-fg px-4 py-2 text-danger-fg" type="button" onClick={() => { void cancel(); }}>Отменить запись</button> : null}</> : null}{error ? <p className="text-danger-fg" role="alert">{error === 'Не найдено' ? 'Ссылка недействительна.' : error}</p> : null}</main>;
}
