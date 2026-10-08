import { useEffect, useMemo, useRef, useState } from 'react';
import { DateTime } from 'luxon';
import { useLocation, useNavigate } from 'react-router';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { ru } from '@/shared/i18n/ru';
import { apiRequest, ApiClientError } from '@/lib/api-client';
import { useSession } from '@/hooks/use-session';
import { AppointmentCreateDialog, AppointmentDetailDialog } from '@/components/data/AppointmentDialogs';
import { assignCalendarLanes } from './appointment-lanes';

interface CalendarPayload {
  range: { from: string; to: string; timezone: string };
  staff: { id: string; displayName: string; color: string }[];
  appointments: { id: string; staff: { id: string; displayName: string; color: string }; customer: { firstName: string; lastName?: string }; service: { name: string }; startAt: string; endAt: string; blockedUntilAt: string; status: string }[];
  blockedPeriods: { id: string; staffId: string; startAt: string; endAt: string; reason?: string }[];
  workingIntervals: { staffId: string; date: string; intervals: { start: string; end: string }[] }[];
  load: { staffId: string; bookedMinutes: number; availableMinutes: number; loadPercent: number | null }[];
}

const slotMinutes = 15;
const slotCount = 52;
const dayStartMinute = 8 * 60;
const appointmentStatusLabel: Record<string, string> = { pending: 'Ожидает подтверждения', confirmed: 'Подтверждена', completed: 'Завершена', cancelled: 'Отменена', no_show: 'Неявка' };
const appointmentStatusDot: Record<string, string> = { pending: 'bg-warning-solid', confirmed: 'bg-success-solid', completed: 'bg-neutral-400', cancelled: 'bg-danger-solid', no_show: 'bg-danger-solid' };
const rowStartClasses = [
  'row-start-1',
  'row-start-2',
  'row-start-3',
  'row-start-4',
  'row-start-5',
  'row-start-6',
  'row-start-7',
  'row-start-8',
  'row-start-9',
  'row-start-10',
  'row-start-11',
  'row-start-12',
  'row-start-13',
  'row-start-14',
  'row-start-15',
  'row-start-16',
  'row-start-17',
  'row-start-18',
  'row-start-19',
  'row-start-20',
  'row-start-21',
  'row-start-22',
  'row-start-23',
  'row-start-24',
  'row-start-25',
  'row-start-26',
  'row-start-27',
  'row-start-28',
  'row-start-29',
  'row-start-30',
  'row-start-31',
  'row-start-32',
  'row-start-33',
  'row-start-34',
  'row-start-35',
  'row-start-36',
  'row-start-37',
  'row-start-38',
  'row-start-39',
  'row-start-40',
  'row-start-41',
  'row-start-42',
  'row-start-43',
  'row-start-44',
  'row-start-45',
  'row-start-46',
  'row-start-47',
  'row-start-48',
  'row-start-49',
  'row-start-50',
  'row-start-51',
  'row-start-52'
] as const;
const rowSpanClasses = [
  'row-span-1',
  'row-span-2',
  'row-span-3',
  'row-span-4',
  'row-span-5',
  'row-span-6',
  'row-span-7',
  'row-span-8',
  'row-span-9',
  'row-span-10',
  'row-span-11',
  'row-span-12',
  'row-span-13',
  'row-span-14',
  'row-span-15',
  'row-span-16',
  'row-span-17',
  'row-span-18',
  'row-span-19',
  'row-span-20',
  'row-span-21',
  'row-span-22',
  'row-span-23',
  'row-span-24',
  'row-span-25',
  'row-span-26',
  'row-span-27',
  'row-span-28',
  'row-span-29',
  'row-span-30',
  'row-span-31',
  'row-span-32',
  'row-span-33',
  'row-span-34',
  'row-span-35',
  'row-span-36',
  'row-span-37',
  'row-span-38',
  'row-span-39',
  'row-span-40',
  'row-span-41',
  'row-span-42',
  'row-span-43',
  'row-span-44',
  'row-span-45',
  'row-span-46',
  'row-span-47',
  'row-span-48',
  'row-span-49',
  'row-span-50',
  'row-span-51',
  'row-span-52'
] as const;
const laneGridClasses = ['grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-5', 'grid-cols-6', 'grid-cols-7', 'grid-cols-8', 'grid-cols-9', 'grid-cols-10', 'grid-cols-11', 'grid-cols-12'] as const;
const laneStartClasses = ['col-start-1', 'col-start-2', 'col-start-3', 'col-start-4', 'col-start-5', 'col-start-6', 'col-start-7', 'col-start-8', 'col-start-9', 'col-start-10', 'col-start-11', 'col-start-12'] as const;
const laneSpanClasses = ['col-span-1', 'col-span-2', 'col-span-3', 'col-span-4', 'col-span-5', 'col-span-6', 'col-span-7', 'col-span-8', 'col-span-9', 'col-span-10', 'col-span-11', 'col-span-12'] as const;
const timeLabel = (date: DateTime) => date.toFormat('HH:mm');
const staffClass: Record<string, string> = {
  violet: 'border-staff-violet bg-staff-violet/10 text-neutral-900 hover:bg-staff-violet/20 dark:bg-staff-violet/15 dark:hover:bg-staff-violet/25',
  teal: 'border-staff-teal bg-staff-teal/10 text-neutral-900 hover:bg-staff-teal/20 dark:bg-staff-teal/15 dark:hover:bg-staff-teal/25',
  blue: 'border-staff-blue bg-staff-blue/10 text-neutral-900 hover:bg-staff-blue/20 dark:bg-staff-blue/15 dark:hover:bg-staff-blue/25',
  green: 'border-staff-green bg-staff-green/10 text-neutral-900 hover:bg-staff-green/20 dark:bg-staff-green/15 dark:hover:bg-staff-green/25',
  amber: 'border-staff-amber bg-staff-amber/10 text-neutral-900 hover:bg-staff-amber/20 dark:bg-staff-amber/15 dark:hover:bg-staff-amber/25',
  rose: 'border-staff-rose bg-staff-rose/10 text-neutral-900 hover:bg-staff-rose/20 dark:bg-staff-rose/15 dark:hover:bg-staff-rose/25',
  orange: 'border-staff-orange bg-staff-orange/10 text-neutral-900 hover:bg-staff-orange/20 dark:bg-staff-orange/15 dark:hover:bg-staff-orange/25',
  slate: 'border-staff-slate bg-staff-slate/10 text-neutral-900 hover:bg-staff-slate/20 dark:bg-staff-slate/15 dark:hover:bg-staff-slate/25',
};
const staffDotClass: Record<string, string> = { violet: 'bg-staff-violet', teal: 'bg-staff-teal', blue: 'bg-staff-blue', green: 'bg-staff-green', amber: 'bg-staff-amber', rose: 'bg-staff-rose', orange: 'bg-staff-orange', slate: 'bg-staff-slate' };

export function CalendarPage({ initialView = 'week' }: { initialView?: 'day' | 'week' | 'appointments' }) {
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [date, setDate] = useState('');
  const [view, setView] = useState<'day' | 'week' | 'month' | 'appointments'>(initialView);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const createQueryHandled = useRef(false);
  const [data, setData] = useState<CalendarPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [createSlot, setCreateSlot] = useState<{ date: string; startAt: string; staffId: string } | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<string | null>(null);
  const businessTimezone = session.data?.active.business.timezone ?? 'UTC';
  const activeDate = date || DateTime.now().setZone(businessTimezone).toISODate() || '';

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const calendarDate = date || DateTime.now().setZone(businessTimezone).toISODate() || '';
    const loadWeek = (weekDate: string) => {
      const params = new URLSearchParams({ view: view === 'month' || view === 'appointments' ? 'week' : view, date: weekDate });
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
  }, [date, view, refresh, businessTimezone]);

  function shiftDate(amount: number) {
    const zone = data?.range.timezone ?? 'UTC';
    const current = DateTime.fromISO(activeDate || DateTime.now().setZone(zone).toISODate() || '', { zone });
    setDate(current.plus({ days: amount * (view === 'week' || view === 'appointments' ? 7 : 1) }).toISODate() ?? '');
  }

  const canBook = session.data?.permissions.includes('appointments:create') ?? false;
  const isMaster = session.data?.active.role === 'master';
  const zone = data?.range.timezone ?? 'UTC';
  const day = DateTime.fromISO(activeDate || DateTime.now().setZone(zone).toISODate() || '', { zone });
  const firstDay = view === 'week' ? day.startOf('week') : day;
  const days = Array.from({ length: view === 'week' ? 7 : view === 'month' ? 35 : 1 }, (_, index) => (view === 'month' ? day.startOf('month').startOf('week') : firstDay).plus({ days: index }));
  const visibleStaff = useMemo(() => (data?.staff ?? []).filter((item) => selectedStaffIds.length === 0 || selectedStaffIds.includes(item.id)), [data?.staff, selectedStaffIds]);
  const columnsClass = days.length === 7 ? 'grid-cols-[56px_repeat(7,minmax(130px,1fr))]' : view === 'day' ? 'grid-cols-[44px_minmax(0,1fr)] sm:grid-cols-[56px_minmax(300px,1fr)]' : 'grid-cols-[56px_minmax(300px,1fr)]';
  const calendarContentWidth = view === 'day' ? 'w-full min-w-0 sm:min-w-[780px]' : 'w-full min-w-[780px]';
  const hasCreateQuery = new URLSearchParams(location.search).has('create');
  const createAt = (dayIso: string, staff: string, minute: number) => {
    const start = DateTime.fromISO(dayIso, { zone }).startOf('day').plus({ minutes: minute });
    setCreateSlot({ date: dayIso, startAt: start.toUTC().toISO() ?? '', staffId: staff });
  };
  function toggleStaff(id: string) { setSelectedStaffIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]); }
  useEffect(() => {
    if (!hasCreateQuery) {
      createQueryHandled.current = false;
      return;
    }
    if (!data || !canBook || createQueryHandled.current) return;
    createQueryHandled.current = true;
    const current = DateTime.now().setZone(zone);
    const roundedMinute = Math.ceil((current.hour * 60 + current.minute + 1) / 15) * 15;
    const minute = Math.min(20 * 60, Math.max(dayStartMinute, roundedMinute));
    const staff = visibleStaff[0];
    createAt(current.toISODate() ?? activeDate, staff?.id ?? '', minute);
    navigate('/app/calendar', { replace: true });
  }, [data, canBook, hasCreateQuery, zone, visibleStaff, activeDate, navigate]);

  return <main className="mx-auto w-full max-w-[1600px] p-4 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{view === 'appointments' ? 'Записи' : 'Календарь'}</h1>
      <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border border-neutral-200 bg-neutral-50 p-0.5" aria-label="Вид календаря"><button className={`h-8 min-h-8 rounded px-3 text-xs ${view === 'day' ? 'bg-neutral-0 font-medium text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`} onClick={() => setView('day')} aria-pressed={view === 'day'}>День</button><button className={`h-8 min-h-8 rounded px-3 text-xs ${view === 'week' ? 'bg-neutral-0 font-medium text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`} onClick={() => setView('week')} aria-pressed={view === 'week'}>Неделя</button><button className={`h-8 min-h-8 rounded px-3 text-xs ${view === 'month' ? 'bg-neutral-0 font-medium text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`} onClick={() => setView('month')} aria-pressed={view === 'month'}>Месяц</button></div>
        <button className="grid size-8 place-items-center rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-50" onClick={() => shiftDate(-1)} aria-label="Предыдущий период"><FontAwesomeIcon className="size-3.5" icon={faChevronLeft}/></button>
        <button className="h-8 min-h-8 rounded-md border border-neutral-200 px-2.5 text-xs font-medium hover:bg-neutral-50" onClick={() => { setDate(DateTime.now().setZone(zone).toISODate() ?? ''); }}>Сегодня</button>
        <label className="sr-only" htmlFor="calendar-date">Дата</label><input id="calendar-date" className="h-9 rounded-md border border-neutral-300 bg-neutral-0 px-2 text-sm" type="date" value={activeDate} onChange={(event) => setDate(event.target.value)} />
        <button className="grid size-8 place-items-center rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-50" onClick={() => shiftDate(1)} aria-label="Следующий период"><FontAwesomeIcon className="size-3.5" icon={faChevronRight}/></button>
      </div>
    </div>
    {!isMaster && data?.staff.length ? <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Фильтр мастеров">
      <span className="mr-1 text-xs text-neutral-500">Мастера</span>
      <button aria-pressed={selectedStaffIds.length === 0} className={`h-7 min-h-7 rounded-md border px-2 text-xs ${selectedStaffIds.length === 0 ? 'border-neutral-300 bg-neutral-100 font-medium text-neutral-900' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`} onClick={() => setSelectedStaffIds([])}>Все</button>
      {data.staff.map((member) => <button aria-pressed={selectedStaffIds.includes(member.id)} className={`inline-flex h-7 min-h-7 items-center gap-1.5 rounded-md border px-2 text-xs ${selectedStaffIds.includes(member.id) ? 'border-neutral-300 bg-neutral-100 font-medium text-neutral-900' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`} key={member.id} onClick={() => toggleStaff(member.id)}><span aria-hidden="true" className={`size-2 rounded-full ${staffDotClass[member.color] ?? 'bg-staff-slate'}`}/>{member.displayName}</button>)}
    </div> : null}
    {loading ? <p className="mt-5 text-sm text-neutral-500" role="status">Загружаем расписание…</p> : null}
    {error ? <p className="mt-5 rounded-md border border-danger-solid/30 bg-danger-bg p-3 text-sm text-danger-fg" role="alert">{error}</p> : null}
    {data ? <>
      {view === 'month' ? <MonthCalendar days={days} appointments={data.appointments.filter((item) => selectedStaffIds.length === 0 || selectedStaffIds.includes(item.staff.id))} timezone={zone} onDaySelect={(iso) => { setDate(iso); setView('day'); }} onAppointmentSelect={setSelectedAppointment} /> : null}
      {view !== 'month' && view !== 'appointments' ? <section className="calendar-grid mt-5 overflow-x-auto rounded-xl border border-neutral-300" aria-label="Календарная сетка">
        <div className={calendarContentWidth}>
          <div className={`grid ${columnsClass} border-b border-neutral-300`}>
            <div className="sticky left-0 top-0 z-20 bg-neutral-50 px-1 py-2 text-[10px] text-neutral-500 sm:px-2">{DateTime.now().setZone(zone).toFormat('ZZ')}</div>
            {days.map((calendarDay) => <div className={`sticky top-0 z-10 flex flex-col px-2 py-2 text-[13px] ${calendarDay.hasSame(DateTime.now().setZone(zone), 'day') ? 'bg-primary-50' : 'bg-neutral-50'}`} key={calendarDay.toISODate()}><strong className="font-medium">{calendarDay.toFormat('ccc d', { locale: 'ru' })}</strong></div>)}
          </div>
          <div className={`grid ${columnsClass}`}>
            <div className="sticky left-0 z-10 grid grid-rows-[repeat(13,80px)] bg-neutral-50">{Array.from({ length: 13 }, (_, index) => <span className={`${index === 0 ? '' : '-mt-2'} border-b border-neutral-200 pr-2 text-right text-[11px] text-neutral-500`} key={index}>{String(index + 8).padStart(2, '0')}:00</span>)}</div>
            {days.map((calendarDay) => {
              const dayIso = calendarDay.toISODate() ?? '';
              const dateAppointments = data.appointments.filter((item) => DateTime.fromISO(item.startAt).setZone(zone).toISODate() === dayIso && (selectedStaffIds.length === 0 || selectedStaffIds.includes(item.staff.id)));
              const appointmentLanes = assignCalendarLanes(dateAppointments.map((item) => ({ id: item.id, startAt: DateTime.fromISO(item.startAt).toMillis(), endAt: DateTime.fromISO(item.endAt).toMillis() })));
              const laneColumnCount = Math.min(12, Math.max(1, ...Array.from(appointmentLanes.values(), (position) => position.laneCount)));
              const laneGridClass = laneGridClasses[laneColumnCount - 1] ?? laneGridClasses[0];
              const dateBlocks = data.blockedPeriods.filter((item) => DateTime.fromISO(item.startAt).setZone(zone).toISODate() === dayIso && (selectedStaffIds.length === 0 || selectedStaffIds.includes(item.staffId)));
              const now = DateTime.now().setZone(zone);
              const nowSlotIndex = Math.floor((now.hour * 60 + now.minute - dayStartMinute) / slotMinutes);
              const showCurrentTime = dayIso === now.toISODate() && nowSlotIndex >= 0 && nowSlotIndex < slotCount;
              const slotAvailability = Array.from({ length: slotCount }, (_, index) => {
                  const minute = dayStartMinute + index * slotMinutes;
                  const slotAt = calendarDay.startOf('day').plus({ minutes: minute });
                  const slotStart = slotAt.toMillis();
                  const slotEnd = slotStart + slotMinutes * 60_000;
                  const workingStaff = visibleStaff.filter((member) => data.workingIntervals.some((entry) => entry.staffId === member.id && entry.date === dayIso && entry.intervals.some((interval) => DateTime.fromISO(interval.start).toMillis() <= slotStart && DateTime.fromISO(interval.end).toMillis() >= slotEnd)));
                  const availableStaff = workingStaff.find((member) => {
                    const hasAppointment = dateAppointments.some((item) => item.staff.id === member.id && ['pending', 'confirmed', 'completed'].includes(item.status) && DateTime.fromISO(item.startAt).toMillis() < slotEnd && DateTime.fromISO(item.blockedUntilAt).toMillis() > slotStart);
                    const hasBlock = dateBlocks.some((item) => item.staffId === member.id && DateTime.fromISO(item.startAt).toMillis() < slotEnd && DateTime.fromISO(item.endAt).toMillis() > slotStart);
                    return !hasAppointment && !hasBlock;
                  });
                  const working = workingStaff.length > 0;
                  const blocked = working && workingStaff.every((member) => dateBlocks.some((item) => item.staffId === member.id && DateTime.fromISO(item.startAt).toMillis() < slotEnd && DateTime.fromISO(item.endAt).toMillis() > slotStart));
                  const overlapsAppointment = dateAppointments.some((item) => DateTime.fromISO(item.startAt).toMillis() < slotEnd && DateTime.fromISO(item.endAt).toMillis() > slotStart);
                  return { minute, slotAt, working, blocked, availableStaff, overlapsAppointment };
              });
              return <div className={`relative grid min-w-0 ${laneGridClass} grid-rows-[repeat(52,20px)] border-l border-neutral-200`} key={dayIso}>
                <div className="pointer-events-none absolute inset-0 z-0 grid grid-rows-[repeat(52,20px)]">
                {slotAvailability.map(({ minute, slotAt, working, blocked, availableStaff, overlapsAppointment }, index) => {
                  const borderClass = index % 4 === 0 ? 'calendar-hour-line' : index % 2 === 0 ? 'calendar-half-hour-line' : 'calendar-quarter-line';
                  const slotClass = `calendar-slot flex min-w-0 items-start gap-1 border-t px-0.5 ${borderClass}`;
                  return <div className={slotClass} data-working={working} data-blocked={blocked} data-overlaps-appointment={overlapsAppointment} key={minute}>
                    {canBook && availableStaff && !overlapsAppointment ? <button className="pointer-events-auto h-full min-h-0 w-full rounded text-[10px] text-neutral-400 hover:bg-primary-50 hover:text-primary-700 focus-visible:z-10 focus-visible:outline" aria-label={`Создать запись ${calendarDay.toFormat('d MMM', { locale: 'ru' })} ${timeLabel(slotAt)} · ${availableStaff.displayName}`} onClick={() => createAt(dayIso, availableStaff.id, minute)}></button> : null}
                  </div>;
                })}
                </div>
                {dateAppointments.map((appointment) => {
                  const startAt = DateTime.fromISO(appointment.startAt).setZone(zone);
                  const localMinute = startAt.hour * 60 + startAt.minute;
                  const startIndex = Math.floor((localMinute - dayStartMinute) / slotMinutes);
                  const span = Math.max(1, Math.min(slotCount - startIndex, Math.ceil(DateTime.fromISO(appointment.endAt).diff(startAt, 'minutes').minutes / slotMinutes)));
                  if (startIndex < 0 || startIndex >= slotCount) return null;
                  const colorClass = staffClass[appointment.staff.color] ?? staffClass.slate;
                  const rowStartClass = rowStartClasses[startIndex] ?? 'row-start-1';
                  const rowSpanClass = rowSpanClasses[span - 1] ?? 'row-span-1';
                  const lane = appointmentLanes.get(appointment.id);
                  const laneIndex = Math.min(laneColumnCount - 1, lane?.lane ?? 0);
                  const laneStartClass = laneStartClasses[laneIndex] ?? laneStartClasses[0];
                  const laneSpanIndex = lane?.laneCount === 1 ? laneColumnCount - 1 : 0;
                  const laneSpanClass = laneSpanClasses[laneSpanIndex] ?? laneSpanClasses[0];
                  const customerName = `${appointment.customer.firstName} ${appointment.customer.lastName ?? ''}`.trim();
                  const statusLabel = appointmentStatusLabel[appointment.status] ?? appointment.status;
                  const appointmentLabel = `${timeLabel(startAt)} · ${customerName} · ${appointment.service.name} · ${appointment.staff.displayName} · ${statusLabel}`;
                  return <button aria-label={appointmentLabel} className={`z-10 ${laneStartClass} ${laneSpanClass} flex min-h-0 min-w-0 flex-col overflow-hidden rounded border-l-[3px] px-1.5 py-0.5 text-left text-[10px] leading-3 ${colorClass} ${rowStartClass} ${rowSpanClass}`} key={appointment.id} onClick={() => setSelectedAppointment(appointment.id)} title={appointmentLabel}><strong className="flex min-w-0 items-center gap-1 truncate tabular-nums"><span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${appointmentStatusDot[appointment.status] ?? 'bg-neutral-400'}`} title={statusLabel}/>{timeLabel(startAt)} · {appointment.customer.firstName}</strong><span className="truncate">{appointment.service.name}</span>{span >= 3 ? <span className="truncate text-neutral-600">{appointment.staff.displayName}</span> : <span className="sr-only">{appointment.staff.displayName}</span>}</button>;
                })}
                {canBook ? slotAvailability.map(({ minute, slotAt, availableStaff, overlapsAppointment }, index) => availableStaff && overlapsAppointment ? <button aria-label={`Создать запись ${calendarDay.toFormat('d MMM', { locale: 'ru' })} ${timeLabel(slotAt)} · ${availableStaff.displayName}`} className="absolute right-0 z-20 grid h-5 w-6 place-items-center rounded-l-md bg-neutral-0/90 text-primary-700 opacity-0 shadow-sm ring-1 ring-neutral-300 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline" key={minute} onClick={() => createAt(dayIso, availableStaff.id, minute)} style={{ top: index * 20 }} title={`Создать параллельную запись · ${availableStaff.displayName}`}><span aria-hidden="true" className="text-sm leading-none">+</span></button> : null) : null}
                {showCurrentTime ? <span aria-hidden="true" className={`pointer-events-none z-20 col-span-full h-px self-start bg-danger-solid ${rowStartClasses[nowSlotIndex] ?? 'row-start-1'}`} /> : null}
              </div>;
            })}
          </div>
        </div>
      </section> : null}
      {view !== 'appointments' ? <div className="mt-4 flex flex-wrap gap-2">{data.load.filter((item) => selectedStaffIds.length === 0 || selectedStaffIds.includes(item.staffId)).map((item) => <div className="rounded-md border border-neutral-200 bg-neutral-0 px-3 py-2 text-xs" key={item.staffId}>{data.staff.find((member) => member.id === item.staffId)?.displayName ?? 'Мастер'} <span className="ml-2 text-neutral-500">{item.loadPercent === null ? '—' : `${item.loadPercent}% загрузка`}</span></div>)}</div> : null}
      {(view === 'appointments' || view !== 'month') ? <section className="mt-5"><h2 className="text-sm font-semibold">{view === 'appointments' ? 'Все записи' : 'Ближайшие записи'}</h2><ul className="mt-2 divide-y divide-neutral-200 border-y border-neutral-200">{data.appointments.filter((item) => selectedStaffIds.length === 0 || selectedStaffIds.includes(item.staff.id)).map((item) => <li className="grid gap-1 px-2 py-3 text-[13px] sm:min-h-12 sm:grid-cols-[100px_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-3 sm:py-0" key={item.id}><time className="tabular-nums text-neutral-500" dateTime={item.startAt}>{new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: zone }).format(new Date(item.startAt))}</time><button className="min-w-0 truncate text-left font-medium hover:underline" onClick={() => setSelectedAppointment(item.id)}>{item.customer.firstName} {item.customer.lastName ?? ''} · {item.service.name}</button><span className="truncate text-neutral-500">{item.staff.displayName} · {item.status}</span>{session.data?.permissions.includes('payments:create') && item.status !== 'cancelled' ? <a className="whitespace-nowrap text-primary-700" href={`/app/payments?appointmentId=${encodeURIComponent(item.id)}`}>＋ Принять оплату</a> : null}</li>)}</ul>{data.appointments.length === 0 ? <p className="mt-3 text-sm text-neutral-500">На этот период записей нет.</p> : null}</section> : null}
    </> : null}
    {createSlot && data ? <AppointmentCreateDialog date={createSlot.date} startAt={createSlot.startAt} timezone={zone} staff={data.staff} preselectedStaffId={createSlot.staffId} onClose={() => setCreateSlot(null)} onCreated={() => setRefresh((value) => value + 1)} /> : null}
    {selectedAppointment && data ? <AppointmentDetailDialog id={selectedAppointment} timezone={zone} role={session.data?.active.role ?? 'owner'} permissions={session.data?.permissions ?? []} onClose={() => setSelectedAppointment(null)} onChanged={() => setRefresh((value) => value + 1)} /> : null}
  </main>;
}

function MonthCalendar({ days, appointments, timezone, onDaySelect, onAppointmentSelect }: { days: DateTime[]; appointments: CalendarPayload['appointments']; timezone: string; onDaySelect: (date: string) => void; onAppointmentSelect: (id: string) => void }) {
  const weekdays = days.slice(0, 7);
  const displayedMonth = days[10]?.month;
  return <section className="calendar-grid mt-5 overflow-x-auto rounded-xl border border-neutral-300" aria-label="Календарь на месяц">
    <div className="grid min-w-[840px] grid-cols-7 border-b border-neutral-200 bg-neutral-50">{weekdays.map((date) => <div className="px-3 py-2 text-xs font-medium text-neutral-500" key={date.toISODate()}>{date.toFormat('ccc', { locale: 'ru' })}</div>)}</div>
    <div className="grid min-w-[840px] grid-cols-7">{days.map((date) => {
      const iso = date.toISODate() ?? '';
      const rows = appointments.filter((item) => DateTime.fromISO(item.startAt).setZone(timezone).toISODate() === iso);
      return <div className={`calendar-month-cell min-h-32 border-b border-r border-neutral-200 p-2 ${date.month === displayedMonth ? '' : 'text-neutral-400'}`} data-outside={date.month !== displayedMonth} key={iso}>
        <button className="h-7 min-h-0 rounded px-2 text-xs font-medium hover:bg-neutral-100" onClick={() => onDaySelect(iso)} aria-label={`Открыть ${date.toFormat('d MMMM', { locale: 'ru' })}`}>{date.toFormat('d')}</button>
        <ul className="mt-1 grid gap-1">{rows.slice(0, 3).map((appointment) => <li key={appointment.id}><button className={`h-auto min-h-0 w-full truncate rounded border-l-2 px-1.5 py-1 text-left text-[11px] leading-4 ${staffClass[appointment.staff.color] ?? staffClass.slate}`} onClick={() => onAppointmentSelect(appointment.id)}><time className="mr-1 tabular-nums">{DateTime.fromISO(appointment.startAt).setZone(timezone).toFormat('HH:mm')}</time>{appointment.customer.firstName} · {appointment.service.name}</button></li>)}</ul>
        {rows.length > 3 ? <button className="mt-1 h-auto min-h-0 px-1 text-[11px] text-neutral-500" onClick={() => onDaySelect(iso)}>+{rows.length - 3} ещё</button> : null}
      </div>;
    })}</div>
  </section>;
}
