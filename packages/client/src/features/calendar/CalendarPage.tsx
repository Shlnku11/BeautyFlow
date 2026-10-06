import { useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { ru } from '@/shared/i18n/ru';
import { apiRequest, ApiClientError } from '@/lib/api-client';
import { useSession } from '@/hooks/use-session';
import { AppointmentCreateDialog, AppointmentDetailDialog } from '@/components/data/AppointmentDialogs';

interface CalendarPayload {
  range: { from: string; to: string; timezone: string };
  staff: { id: string; displayName: string; color: string }[];
  appointments: { id: string; staff: { id: string; displayName: string }; customer: { firstName: string; lastName?: string }; service: { name: string }; startAt: string; endAt: string; blockedUntilAt: string; status: string }[];
  blockedPeriods: { id: string; staffId: string; startAt: string; endAt: string; reason?: string }[];
  workingIntervals: { staffId: string; date: string; intervals: { start: string; end: string }[] }[];
  load: { staffId: string; bookedMinutes: number; availableMinutes: number; loadPercent: number | null }[];
}

const slotMinutes = 15;
const slotCount = 52;
const dayStartMinute = 8 * 60;
const timeLabel = (date: DateTime) => date.toFormat('HH:mm');

export function CalendarPage() {
  const session = useSession();
  const [date, setDate] = useState('');
  const [view, setView] = useState<'day' | 'week' | 'month'>('day');
  const [staffId, setStaffId] = useState('');
  const [data, setData] = useState<CalendarPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [createSlot, setCreateSlot] = useState<{ date: string; startAt: string; staffId: string } | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<string | null>(null);
  const activeDate = date || (data ? DateTime.fromISO(data.range.from).setZone(data.range.timezone).toISODate() ?? '' : '');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const calendarDate = date || DateTime.now().toISODate() || '';
    const loadWeek = (weekDate: string) => {
      const params = new URLSearchParams({ view: view === 'month' ? 'week' : view, date: weekDate });
      if (staffId) params.set('staffId', staffId);
      return apiRequest<CalendarPayload>(`/api/calendar?${params}`, { signal: controller.signal });
    };
    const request = view === 'month'
      ? (() => {
          const monthStart = DateTime.fromISO(calendarDate).startOf('month').startOf('week');
          return Promise.all(Array.from({ length: 5 }, (_, index) => loadWeek(monthStart.plus({ days: index * 7 }).toISODate() ?? calendarDate))).then((weeks): CalendarPayload => {
            const first = weeks[0];
            if (!first) throw new Error('Calendar month response is empty');
            const last = weeks.at(-1) ?? first;
            return { ...first, range: { ...first.range, to: last.range.to }, appointments: [...new Map(weeks.flatMap((week) => week.appointments).map((appointment) => [appointment.id, appointment])).values()], blockedPeriods: [...new Map(weeks.flatMap((week) => week.blockedPeriods).map((block) => [block.id, block])).values()], workingIntervals: weeks.flatMap((week) => week.workingIntervals) };
          });
        })()
      : loadWeek(calendarDate);
    void request.then(setData).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof ApiClientError ? reason.message : ru.errors.INTERNAL);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, view, staffId, refresh]);

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 767px)');
    if (mobile.matches && view !== 'day') setView('day');
  }, [view]);

  function shiftDate(amount: number) {
    const zone = data?.range.timezone ?? 'UTC';
    const current = DateTime.fromISO(activeDate || DateTime.now().setZone(zone).toISODate() || '', { zone });
    setDate(current.plus({ days: amount * (view === 'week' ? 7 : 1) }).toISODate() ?? '');
  }

  const canBook = session.data?.permissions.includes('appointments:create') ?? false;
  const isMaster = session.data?.active.role === 'master';
  const zone = data?.range.timezone ?? 'UTC';
  const day = DateTime.fromISO(activeDate || DateTime.now().setZone(zone).toISODate() || '', { zone });
  const firstDay = view === 'week' ? day.startOf('week') : day;
  const days = Array.from({ length: view === 'week' ? 7 : view === 'month' ? 35 : 1 }, (_, index) => (view === 'month' ? day.startOf('month').startOf('week') : firstDay).plus({ days: index }));
  const visibleStaff = (data?.staff ?? []).filter((item) => !staffId || item.id === staffId);
  const columnsClass = days.length === 7 ? 'grid-cols-[56px_repeat(7,minmax(130px,1fr))]' : 'grid-cols-[56px_minmax(300px,1fr)]';
  const createAt = (dayIso: string, staff: string, minute: number) => {
    const start = DateTime.fromISO(dayIso, { zone }).startOf('day').plus({ minutes: minute });
    setCreateSlot({ date: dayIso, startAt: start.toUTC().toISO() ?? '', staffId: staff });
  };

  return <main className="mx-auto w-full max-w-[1600px] p-4 md:p-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Рабочее пространство</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Календарь</h1></div>
      <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border border-neutral-300 p-0.5" aria-label="Вид календаря"><button className="rounded px-3 py-1.5 text-sm" onClick={() => setView('day')} aria-pressed={view === 'day'}>День</button><button className="rounded px-3 py-1.5 text-sm" onClick={() => setView('week')} aria-pressed={view === 'week'}>Неделя</button><button className="rounded px-3 py-1.5 text-sm" onClick={() => setView('month')} aria-pressed={view === 'month'}>Месяц</button></div>
        <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm" onClick={() => shiftDate(-1)} aria-label="Предыдущий период">Назад</button>
        <label className="sr-only" htmlFor="calendar-date">Дата</label><input id="calendar-date" className="h-9 rounded-md border border-neutral-300 bg-neutral-0 px-2 text-sm" type="date" value={activeDate} onChange={(event) => setDate(event.target.value)} />
        <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm" onClick={() => { setDate(DateTime.now().setZone(zone).toISODate() ?? ''); }}>Сегодня</button>
        <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm" onClick={() => shiftDate(1)} aria-label="Следующий период">Далее</button>
        {!isMaster ? <label className="sr-only" htmlFor="calendar-staff">Сотрудник</label> : null}
        {!isMaster ? <select id="calendar-staff" className="h-9 rounded-md border border-neutral-300 bg-neutral-0 px-2 text-sm" value={staffId} onChange={(event) => setStaffId(event.target.value)}><option value="">Все сотрудники</option>{data?.staff.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select> : null}
      </div>
    </div>
    {loading ? <p className="mt-5 text-sm text-neutral-500" role="status">Загружаем расписание…</p> : null}
    {error ? <p className="mt-5 rounded-md border border-danger-solid/30 bg-danger-bg p-3 text-sm text-danger-fg" role="alert">{error}</p> : null}
    {data ? <>
      {view === 'month' ? <MonthCalendar days={days} appointments={data.appointments.filter((item) => !staffId || item.staff.id === staffId)} timezone={zone} onDaySelect={(iso) => { setDate(iso); setView('day'); }} onAppointmentSelect={setSelectedAppointment} /> : null}
      {view !== 'month' ? <section className="mt-5 overflow-x-auto rounded-lg border border-neutral-300 bg-neutral-0" aria-label="Календарная сетка">
        <div className="min-w-[780px]">
          <div className={`grid ${columnsClass} border-b border-neutral-300`}>
            <div className="sticky top-0 z-10 bg-neutral-50 px-2 py-2 text-[10px] text-neutral-500">{DateTime.now().setZone(zone).toFormat('ZZ')}</div>
            {days.map((calendarDay) => <div className="sticky top-0 z-10 flex flex-col bg-neutral-50 px-2 py-2 text-xs" key={calendarDay.toISODate()}><span className="text-neutral-500">{calendarDay.toFormat('ccc', { locale: 'ru' })}</span><strong>{calendarDay.toFormat('d MMM', { locale: 'ru' })}</strong></div>)}
          </div>
          <div className={`grid ${columnsClass}`}>
            <div className="grid grid-rows-[repeat(13,80px)]">{Array.from({ length: 13 }, (_, index) => <span className="-mt-2 border-b border-neutral-200 pr-2 text-right text-[11px] text-neutral-500" key={index}>{String(index + 8).padStart(2, '0')}:00</span>)}</div>
            {days.map((calendarDay) => {
              const dayIso = calendarDay.toISODate() ?? '';
              const dateAppointments = data.appointments.filter((item) => DateTime.fromISO(item.startAt).setZone(zone).toISODate() === dayIso);
              const dateBlocks = data.blockedPeriods.filter((item) => DateTime.fromISO(item.startAt).setZone(zone).toISODate() === dayIso);
              return <div className="grid grid-rows-[repeat(52,20px)] border-l border-neutral-200" key={dayIso}>
                {Array.from({ length: slotCount }, (_, index) => {
                  const minute = dayStartMinute + index * slotMinutes;
                  const slotAt = calendarDay.startOf('day').plus({ minutes: minute });
                  const slotStart = slotAt.toMillis();
                  const slotEnd = slotStart + slotMinutes * 60_000;
                  const busy = dateAppointments.some((item) => ['pending', 'confirmed', 'completed'].includes(item.status) && DateTime.fromISO(item.startAt).toMillis() < slotEnd && DateTime.fromISO(item.blockedUntilAt).toMillis() > slotStart && (!staffId || item.staff.id === staffId));
                  const blocked = dateBlocks.some((item) => DateTime.fromISO(item.startAt).toMillis() < slotEnd && DateTime.fromISO(item.endAt).toMillis() > slotStart && (!staffId || item.staffId === staffId));
                  const availableStaff = visibleStaff.find((member) => data.workingIntervals.some((entry) => entry.staffId === member.id && entry.date === dayIso && entry.intervals.some((interval) => DateTime.fromISO(interval.start).toMillis() <= slotStart && DateTime.fromISO(interval.end).toMillis() >= slotEnd)));
                  const slotClass = index % 4 === 0 ? 'flex min-w-0 items-start gap-1 border-t border-neutral-300 px-0.5' : 'flex min-w-0 items-start gap-1 border-t border-neutral-100 px-0.5';
                  return <div className={`${slotClass} row-start-[${index + 1}]`} key={minute}>
                    {busy || blocked ? <span className="truncate px-1 text-[10px] text-neutral-400">{blocked ? 'Занято' : 'Запись'}</span> : canBook && availableStaff ? <button className="h-4 min-h-0 w-full rounded text-[10px] text-neutral-400 hover:bg-primary-50 hover:text-primary-700" aria-label={`Создать запись ${calendarDay.toFormat('d MMM', { locale: 'ru' })} ${timeLabel(slotAt)}`} onClick={() => createAt(dayIso, availableStaff.id, minute)}></button> : null}
                  </div>;
                })}
                {dateAppointments.map((appointment) => {
                  const startAt = DateTime.fromISO(appointment.startAt).setZone(zone);
                  const localMinute = startAt.hour * 60 + startAt.minute;
                  const startIndex = Math.floor((localMinute - dayStartMinute) / slotMinutes);
                  const span = Math.max(1, Math.min(slotCount - startIndex, Math.ceil(DateTime.fromISO(appointment.endAt).diff(startAt, 'minutes').minutes / slotMinutes)));
                  if (startIndex < 0 || startIndex >= slotCount || (staffId && appointment.staff.id !== staffId)) return null;
                  return <button className={`z-10 flex min-h-0 min-w-0 flex-col overflow-hidden rounded border-l-[3px] border-primary-600 bg-primary-50 px-1.5 py-0.5 text-left text-[10px] leading-4 text-primary-900 hover:bg-primary-100 row-start-[${startIndex + 1}] row-span-[${span}]`} key={appointment.id} onClick={() => setSelectedAppointment(appointment.id)} title={`${appointment.staff.displayName} · ${appointment.customer.firstName} · ${appointment.service.name}`}><strong className="truncate tabular-nums">{timeLabel(startAt)} · {appointment.staff.displayName}</strong><span className="truncate">{appointment.customer.firstName} {appointment.customer.lastName ?? ''}</span><span className="truncate text-primary-700">{appointment.service.name}</span></button>;
                })}
              </div>;
            })}
          </div>
        </div>
      </section> : null}
      <div className="mt-4 flex flex-wrap gap-2">{data.load.filter((item) => !staffId || item.staffId === staffId).map((item) => <div className="rounded-md border border-neutral-300 bg-neutral-0 px-3 py-2 text-sm" key={item.staffId}>{data.staff.find((member) => member.id === item.staffId)?.displayName ?? 'Мастер'} <span className="ml-2 text-neutral-500">{item.loadPercent === null ? '—' : `${item.loadPercent}% загрузка`}</span></div>)}</div>
      <section className="mt-6"><h2 className="text-sm font-semibold">Ближайшие записи</h2><ul className="mt-2 divide-y divide-neutral-200 rounded-lg border border-neutral-300 bg-neutral-0">{data.appointments.map((item) => <li className="grid gap-1 px-3 py-2.5 text-sm sm:grid-cols-[9rem_1fr_12rem_auto]" key={item.id}><time className="text-neutral-500" dateTime={item.startAt}>{new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: zone }).format(new Date(item.startAt))}</time><span className="font-medium">{item.customer.firstName} {item.customer.lastName ?? ''} · {item.service.name}</span><span className="text-neutral-500">{item.staff.displayName} · {item.status}</span>{session.data?.permissions.includes('payments:create') && item.status !== 'cancelled' ? <a className="text-primary-700" href={`/app/payments?appointmentId=${encodeURIComponent(item.id)}`}>＋ Принять оплату</a> : null}</li>)}</ul>{data.appointments.length === 0 ? <p className="mt-3 text-sm text-neutral-500">На этот период записей нет.</p> : null}</section>
    </> : null}
    {createSlot && data ? <AppointmentCreateDialog date={createSlot.date} startAt={createSlot.startAt} timezone={zone} staff={data.staff} preselectedStaffId={createSlot.staffId} onClose={() => setCreateSlot(null)} onCreated={() => setRefresh((value) => value + 1)} /> : null}
    {selectedAppointment && data ? <AppointmentDetailDialog id={selectedAppointment} timezone={zone} role={session.data?.active.role ?? 'owner'} permissions={session.data?.permissions ?? []} onClose={() => setSelectedAppointment(null)} onChanged={() => setRefresh((value) => value + 1)} /> : null}
  </main>;
}

function MonthCalendar({ days, appointments, timezone, onDaySelect, onAppointmentSelect }: { days: DateTime[]; appointments: CalendarPayload['appointments']; timezone: string; onDaySelect: (date: string) => void; onAppointmentSelect: (id: string) => void }) {
  const weekdays = days.slice(0, 7);
  const displayedMonth = days[10]?.month;
  return <section className="mt-5 overflow-x-auto rounded-lg border border-neutral-300 bg-neutral-0" aria-label="Календарь на месяц">
    <div className="grid min-w-[840px] grid-cols-7 border-b border-neutral-200 bg-neutral-50">{weekdays.map((date) => <div className="px-3 py-2 text-xs font-medium text-neutral-500" key={date.toISODate()}>{date.toFormat('ccc', { locale: 'ru' })}</div>)}</div>
    <div className="grid min-w-[840px] grid-cols-7">{days.map((date) => {
      const iso = date.toISODate() ?? '';
      const rows = appointments.filter((item) => DateTime.fromISO(item.startAt).setZone(timezone).toISODate() === iso);
      return <div className={`min-h-32 border-b border-r border-neutral-200 p-2 ${date.month === displayedMonth ? '' : 'bg-neutral-50 text-neutral-400'}`} key={iso}>
        <button className="h-7 min-h-0 rounded px-2 text-xs font-medium hover:bg-neutral-100" onClick={() => onDaySelect(iso)} aria-label={`Открыть ${date.toFormat('d MMMM', { locale: 'ru' })}`}>{date.toFormat('d')}</button>
        <ul className="mt-1 grid gap-1">{rows.slice(0, 3).map((appointment) => <li key={appointment.id}><button className="h-auto min-h-0 w-full truncate rounded border-l-2 border-primary-600 bg-primary-50 px-1.5 py-1 text-left text-[11px] leading-4 text-primary-900" onClick={() => onAppointmentSelect(appointment.id)}><time className="mr-1 tabular-nums">{DateTime.fromISO(appointment.startAt).setZone(timezone).toFormat('HH:mm')}</time>{appointment.customer.firstName} · {appointment.service.name}</button></li>)}</ul>
        {rows.length > 3 ? <button className="mt-1 h-auto min-h-0 px-1 text-[11px] text-neutral-500" onClick={() => onDaySelect(iso)}>+{rows.length - 3} ещё</button> : null}
      </div>;
    })}</div>
  </section>;
}
