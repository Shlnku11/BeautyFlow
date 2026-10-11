import { useEffect, useState, type FormEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faArrowRight,
  faEnvelope,
  faMagnifyingGlass,
  faPaperPlane,
  faPhone,
  faScissors,
  faUserPlus,
} from '@fortawesome/free-solid-svg-icons';
import { Link, useParams } from 'react-router';
import { ApiClientError, apiRequest } from '@/lib/api-client';
import { useSession } from '@/hooks/use-session';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogDescription, DialogFooter, DialogHeader, DialogShell as Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

type ApiErrorState = string | null;
type UiMessage = { text: string; kind: 'success' | 'error' };
type Staff = { id: string; displayName: string; email?: string; phone?: string; bio?: string; color: string; isActive: boolean; acceptsOnlineBooking: boolean; hourlyRateMinor: number; serviceIds?: string[] };
type Service = { id: string; name: string; description?: string; durationMinutes: number; bufferMinutes: number; priceMinor: number; currency: string; onlineBookingEnabled: boolean; isActive: boolean; staffIds: string[] };
type Member = { id: string; user: { name: string; email: string }; role: string; status: string; staffId?: string };
interface WeeklyDay { isoWeekday: number; intervals: { start: string; end: string }[]; breaks: { start: string; end: string }[]; }
interface StaffException { date: string; kind: string; reason?: string; }

const staffColorDots: Record<string, string> = {
  violet: 'bg-staff-violet', teal: 'bg-staff-teal', blue: 'bg-staff-blue', green: 'bg-staff-green',
  amber: 'bg-staff-amber', rose: 'bg-staff-rose', orange: 'bg-staff-orange', slate: 'bg-staff-slate',
};
const staffColorLabels: Record<string, string> = { amber: 'Янтарный', blue: 'Синий', green: 'Зелёный', orange: 'Оранжевый', rose: 'Розовый', slate: 'Серый', teal: 'Бирюзовый', violet: 'Фиолетовый' };
const weekdays = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const tabs = [
  { value: 'profile', label: 'Профиль' },
  { value: 'schedule', label: 'Расписание' },
  { value: 'exceptions', label: 'Исключения' },
  { value: 'services', label: 'Услуги' },
  { value: 'access', label: 'Доступ' },
] as const;

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.message : 'Не удалось выполнить запрос. Проверьте соединение и повторите попытку.';
}

function useRemote<T>(path: string | null, fallback: T): [T, (value: T) => void, ApiErrorState, boolean, () => void] {
  const [data, setData] = useState(fallback);
  const [error, setError] = useState<ApiErrorState>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (!path) {
      setData(fallback);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void apiRequest<T>(path, { signal: controller.signal })
      .then(setData)
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(errorMessage(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, reloadKey]);
  return [data, setData, error, loading, () => setReloadKey((value) => value + 1)];
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.slice(0, 1).toLocaleUpperCase('ru-RU')).join('') || '?';
}

function staffCount(count: number): string {
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  const word = remainder100 >= 11 && remainder100 <= 14 ? 'сотрудников' : remainder10 === 1 ? 'сотрудник' : remainder10 >= 2 && remainder10 <= 4 ? 'сотрудника' : 'сотрудников';
  return `${count} ${word}`;
}

function serviceCount(count: number): string {
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  const word = remainder100 >= 11 && remainder100 <= 14 ? 'услуг' : remainder10 === 1 ? 'услуга' : remainder10 >= 2 && remainder10 <= 4 ? 'услуги' : 'услуг';
  return `${count} ${word}`;
}

function assignedServiceCount(staffId: string, services: Service[]): number {
  return services.filter((service) => service.staffIds.includes(staffId)).length;
}

function StaffAvatar({ staff, size = 'md' }: { staff: Pick<Staff, 'displayName' | 'color'>; size?: 'md' | 'lg' }) {
  return <Avatar className={size === 'lg' ? 'size-14 border-2 border-background ring-1 ring-border sm:size-16' : 'size-10'}>
    <AvatarFallback className="bg-muted text-sm font-semibold text-foreground">{initials(staff.displayName)}</AvatarFallback>
  </Avatar>;
}

function StatusBadge({ active }: { active: boolean }) {
  return <Badge tone={active ? 'success' : 'neutral'} className="gap-1.5 px-2.5">
    <span aria-hidden="true" className={`size-1.5 rounded-full ${active ? 'bg-success-solid' : 'bg-muted-foreground'}`} />
    {active ? 'Активен' : 'Неактивен'}
  </Badge>;
}

function StaffCard({ staff, services }: { staff: Staff; services: Service[] }) {
  const dot = staffColorDots[staff.color] ?? staffColorDots.slate;
  return <Card className="group min-w-0 overflow-hidden border-border bg-card shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/30">
    <Link aria-label={`Открыть профиль сотрудника ${staff.displayName}`} className="block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" to={`/app/staff/${staff.id}`}>
      <CardContent className="flex h-full min-h-[150px] min-w-0 flex-col p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className={`mt-1 size-2.5 shrink-0 rounded-full ${dot}`} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <h2 className="truncate text-[15px] font-semibold tracking-tight text-foreground">{staff.displayName}</h2>
              <StatusBadge active={staff.isActive} />
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">{staff.email ?? staff.phone ?? 'Контакты не добавлены'}</p>
          </div>
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-4">
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <FontAwesomeIcon aria-hidden="true" icon={faScissors} className="size-3.5" />
            {serviceCount(assignedServiceCount(staff.id, services))}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
            {staff.acceptsOnlineBooking ? 'Онлайн-запись' : 'Без онлайн-записи'}
            <FontAwesomeIcon aria-hidden="true" icon={faArrowRight} className="size-3 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </CardContent>
    </Link>
  </Card>;
}

function FormMessage({ message }: { message: UiMessage }) {
  const error = message.kind === 'error';
  return <p aria-live="polite" className={`rounded-md border px-3 py-2 text-sm ${error ? 'border-danger-bg bg-danger-bg text-danger-fg' : 'border-success-bg bg-success-bg text-success-fg'}`} role={error ? 'alert' : 'status'}>{message.text}</p>;
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <Card className="mt-5 border-danger-bg bg-card">
    <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="font-medium text-foreground">Не удалось загрузить данные</h2><p className="mt-1 text-sm text-muted-foreground">{message}</p></div>
      <Button type="button" variant="outline" onClick={onRetry}>Повторить</Button>
    </CardContent>
  </Card>;
}

export function StaffPage() {
  const session = useSession();
  const canWrite = session.data?.permissions.includes('staff:write') ?? false;
  const [includeInactive, setIncludeInactive] = useState(false);
  const [rows, setRows, error, loading, reload] = useRemote<Staff[]>(`/api/staff?includeInactive=${includeInactive}`, []);
  const [services, , servicesError, servicesLoading, reloadServices] = useRemote<Service[]>('/api/services', []);
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<UiMessage | null>(null);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const staff = await apiRequest<Staff & { accessInvite: string }>('/api/staff', {
        method: 'POST',
        body: {
          displayName: form.get('displayName'), email: form.get('email') || undefined,
          phone: form.get('phone') || undefined, color: form.get('color'),
          acceptsOnlineBooking: form.has('acceptsOnlineBooking'),
          hourlyRateMinor: Math.round(Number(form.get('hourlyRate')) * 100),
        },
      });
      setRows([staff, ...rows]);
      setDialogOpen(false);
      setMessage({ text: staff.accessInvite === 'sent' ? 'Сотрудник добавлен, приглашение отправлено.' : 'Сотрудник добавлен.', kind: 'success' });
    } catch (reason: unknown) {
      setMessage({ text: errorMessage(reason), kind: 'error' });
    } finally {
      setSaving(false);
    }
  }

  const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
  const visibleRows = rows.filter((row) => [row.displayName, row.email ?? '', row.phone ?? ''].some((value) => value.toLocaleLowerCase('ru-RU').includes(normalizedQuery)));
  const activeCount = rows.filter((row) => row.isActive).length;

  return <main className="mx-auto w-full max-w-[1440px] px-4 pb-24 pt-5 sm:px-6 md:pb-7 md:pt-7 xl:px-8">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">КОМАНДА</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Сотрудники</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Профили специалистов, услуги и доступ к расписанию.</p>
      </div>
      {canWrite ? <Button onClick={() => { setMessage(null); setDialogOpen(true); }}>
        <FontAwesomeIcon aria-hidden="true" icon={faUserPlus} /> Добавить сотрудника
      </Button> : null}
    </header>

    <section aria-label="Сводка команды" className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-border py-3 text-sm">
      <span className="font-medium tabular-nums text-foreground">{staffCount(rows.length)}</span>
      <span className="text-muted-foreground">{activeCount} активны</span>
      <span className="text-muted-foreground">{rows.filter((row) => row.acceptsOnlineBooking).length} принимают онлайн-запись</span>
    </section>

    <section aria-label="Фильтры сотрудников" className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative w-full sm:max-w-sm">
        <FontAwesomeIcon aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" icon={faMagnifyingGlass} />
        <Label className="sr-only" htmlFor="staff-search">Поиск сотрудников</Label>
        <Input autoComplete="off" className="pl-9" id="staff-search" placeholder="Имя, email или телефон" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm text-muted-foreground" htmlFor="staff-inactive">
        <Checkbox checked={includeInactive} id="staff-inactive" onCheckedChange={(checked) => setIncludeInactive(checked === true)} />
        Показывать неактивных
      </label>
      <p aria-live="polite" className="text-xs text-muted-foreground sm:ml-auto">Показано {visibleRows.length} из {rows.length}</p>
    </section>

    {message ? <div className="mt-4"><FormMessage message={message} /></div> : null}
    {error || servicesError ? <LoadError message={error ?? servicesError ?? 'Не удалось загрузить данные.'} onRetry={() => { if (error) reload(); if (servicesError) reloadServices(); }} /> : loading || servicesLoading ? <div aria-label="Загрузка сотрудников" className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="status">
      <span className="sr-only">Загружаем список сотрудников</span>
      {Array.from({ length: 6 }, (_, index) => <Card aria-hidden="true" className="h-[150px]" key={index}><CardContent className="flex h-full flex-col justify-between p-4"><div className="flex gap-3"><Skeleton className="size-10 rounded-full"/><div className="grid flex-1 content-start gap-2"><Skeleton className="h-4 w-2/3"/><Skeleton className="h-3 w-1/2"/></div></div><Skeleton className="h-4 w-3/4"/></CardContent></Card>)}
    </div> : visibleRows.length > 0 ? <>
      <ul aria-label="Карточки сотрудников" className="mt-4 grid gap-3 sm:grid-cols-2 xl:hidden">
        {visibleRows.map((staff) => <li key={staff.id}><StaffCard staff={staff} services={services} /></li>)}
      </ul>
      <section aria-label="Таблица сотрудников" className="mt-4 hidden overflow-hidden rounded-lg border border-border bg-card xl:block">
        <Table className="min-w-[760px] text-[13px]">
          <TableCaption className="sr-only">Сотрудники команды, услуги и способы записи</TableCaption>
          <TableHeader className="bg-muted/60">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[34%] pl-5">Специалист</TableHead>
              <TableHead>Контакты</TableHead>
              <TableHead>Услуги</TableHead>
              <TableHead>Запись</TableHead>
              <TableHead className="pr-5 text-right">Статус</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((staff) => <TableRow key={staff.id} className="h-[68px]">
              <TableCell className="pl-5">
                <Link aria-label={`Открыть профиль сотрудника ${staff.displayName}`} className="group flex w-fit items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" to={`/app/staff/${staff.id}`}>
                  <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${staffColorDots[staff.color] ?? staffColorDots.slate}`} />
                  <span className="font-medium text-foreground group-hover:text-primary">{staff.displayName}</span>
                </Link>
              </TableCell>
              <TableCell className="max-w-[250px] truncate text-muted-foreground">{staff.email ?? staff.phone ?? 'Контакты не добавлены'}</TableCell>
              <TableCell className="tabular-nums text-muted-foreground">{serviceCount(assignedServiceCount(staff.id, services))}</TableCell>
              <TableCell><Badge variant="outline" className="font-normal">{staff.acceptsOnlineBooking ? 'Онлайн' : 'По телефону'}</Badge></TableCell>
              <TableCell className="pr-5 text-right"><span className="inline-flex justify-end"><StatusBadge active={staff.isActive} /></span></TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </section>
    </> : <Card className="mt-5 border-dashed bg-card">
      <CardContent className="grid min-h-56 place-items-center px-5 py-10 text-center">
        <div className="max-w-sm">
          <span className="mx-auto grid size-10 place-items-center rounded-full bg-muted text-muted-foreground"><FontAwesomeIcon aria-hidden="true" icon={faMagnifyingGlass} /></span>
          <h2 className="mt-3 text-base font-semibold text-foreground">{normalizedQuery ? 'Ничего не найдено' : includeInactive ? 'Сотрудников пока нет' : 'Нет активных сотрудников'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{normalizedQuery ? 'Попробуйте изменить запрос или проверить телефон и email.' : includeInactive ? 'Добавьте специалиста, чтобы назначать услуги и записи.' : 'Покажите неактивных сотрудников или добавьте нового специалиста.'}</p>
          {normalizedQuery ? <Button className="mt-4" variant="outline" onClick={() => setQuery('')}>Очистить поиск</Button> : canWrite ? <Button className="mt-4" onClick={() => setDialogOpen(true)}><FontAwesomeIcon aria-hidden="true" icon={faUserPlus} /> Добавить сотрудника</Button> : null}
        </div>
      </CardContent>
    </Card>}

    <Dialog open={dialogOpen} title="Новый сотрудник" onClose={() => setDialogOpen(false)}>
      <DialogHeader><DialogDescription>Добавьте специалиста в команду. Email можно указать сейчас или позже на вкладке доступа.</DialogDescription></DialogHeader>
      <form className="grid gap-4" onSubmit={(event) => { void create(event); }}>
        <div className="grid gap-1.5"><Label htmlFor="new-staff-name">Имя сотрудника</Label><Input autoFocus id="new-staff-name" name="displayName" autoComplete="name" required minLength={2} placeholder="Например, Алия Садыкова" /></div>
        <div className="grid gap-1.5"><Label htmlFor="new-staff-email">Email для доступа <span className="font-normal text-muted-foreground">(необязательно)</span></Label><Input id="new-staff-email" name="email" type="email" autoComplete="email" placeholder="name@example.com" /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5"><Label htmlFor="new-staff-phone">Телефон</Label><Input id="new-staff-phone" name="phone" type="tel" autoComplete="tel" placeholder="+996 …" /></div>
          <div className="grid gap-1.5"><Label htmlFor="new-staff-color">Цвет календаря</Label><NativeSelect className="w-full" defaultValue="violet" id="new-staff-color" name="color"><NativeSelectOption value="violet">Фиолетовый</NativeSelectOption><NativeSelectOption value="teal">Бирюзовый</NativeSelectOption><NativeSelectOption value="blue">Синий</NativeSelectOption><NativeSelectOption value="green">Зелёный</NativeSelectOption><NativeSelectOption value="amber">Янтарный</NativeSelectOption><NativeSelectOption value="rose">Розовый</NativeSelectOption><NativeSelectOption value="orange">Оранжевый</NativeSelectOption><NativeSelectOption value="slate">Серый</NativeSelectOption></NativeSelect></div>
        </div>
        <div className="grid gap-1.5"><Label htmlFor="new-staff-hourly-rate">Оплата за час ({session.data?.active.business.currency ?? 'KGS'})</Label><Input id="new-staff-hourly-rate" name="hourlyRate" type="number" min="0" step="0.01" defaultValue="0" inputMode="decimal"/><p className="text-xs text-muted-foreground">Начисление считается по фактическому времени открытой смены.</p></div>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border p-3" htmlFor="new-staff-online">
          <Checkbox defaultChecked id="new-staff-online" name="acceptsOnlineBooking" />
          <span><span className="block text-sm font-medium">Принимает онлайн-запись</span><span className="mt-0.5 block text-xs text-muted-foreground">Клиенты смогут выбрать специалиста на странице записи.</span></span>
        </label>
        {message ? <FormMessage message={message} /> : null}
        <DialogFooter className="border-t border-border pt-4">
          <Button disabled={saving} type="button" variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
          <Button disabled={saving} type="submit">{saving ? 'Добавляем…' : 'Добавить сотрудника'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  </main>;
}

export function StaffDetailPage() {
  const { id = '' } = useParams();
  const [tab, setTab] = useState<(typeof tabs)[number]['value']>('profile');
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const session = useSession();
  const permissions = session.data?.permissions ?? [];
  const canWrite = permissions.includes('staff:write');
  const canDeactivate = permissions.includes('staff:deactivate');
  const [staff, setStaff, error, loading, reload] = useRemote<Staff | null>(`/api/staff/${id}`, null);
  const [serviceCatalog] = useRemote<Service[]>(permissions.includes('services:read') ? '/api/services' : null, []);
  const [profileRevision, setProfileRevision] = useState(0);
  const [message, setMessage] = useState<UiMessage | null>(null);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const body = {
      displayName: form.get('displayName'), email: form.get('email') || undefined,
      phone: form.get('phone') || undefined, bio: form.get('bio') || undefined,
      color: form.get('color'), acceptsOnlineBooking: form.has('acceptsOnlineBooking'),
      hourlyRateMinor: Math.round(Number(form.get('hourlyRate')) * 100),
      ...(canDeactivate ? { isActive: form.has('isActive') } : {}),
    };
    try {
      const updated = await apiRequest<Staff>(`/api/staff/${id}`, { method: 'PATCH', body });
      setStaff(updated);
      setProfileRevision((revision) => revision + 1);
      setMessage({ text: 'Профиль сохранён.', kind: 'success' });
    } catch (reason: unknown) {
      if (reason instanceof ApiClientError && reason.code === 'STAFF_HAS_UPCOMING_APPOINTMENTS') setConfirmDeactivate(true);
      else setMessage({ text: errorMessage(reason), kind: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function confirmStaffDeactivation() {
    setSaving(true);
    try {
      const updated = await apiRequest<Staff>(`/api/staff/${id}`, { method: 'PATCH', body: { isActive: false, confirm: true } });
      setStaff(updated);
      setMessage({ text: 'Сотрудник деактивирован. Его будущие записи сохранены, доступ к кабинету отключён.', kind: 'success' });
      setConfirmDeactivate(false);
    } catch (reason: unknown) {
      setMessage({ text: errorMessage(reason), kind: 'error' });
    } finally {
      setSaving(false);
    }
  }

  const visibleTabs = tabs.filter((item) => item.value !== 'access' || permissions.includes('members:read'));

  return <main className="mx-auto w-full max-w-[1180px] px-4 pb-24 pt-5 sm:px-6 md:pb-7 md:pt-7 xl:px-8">
    <Link className="inline-flex min-h-8 items-center gap-2 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" to="/app/staff">
      <FontAwesomeIcon aria-hidden="true" icon={faArrowLeft} className="size-3.5" /> Команда сотрудников
    </Link>

    {loading ? <div className="mt-4 grid gap-3" role="status" aria-label="Загрузка профиля сотрудника"><Skeleton className="h-28 w-full"/><Skeleton className="h-10 w-full"/><Skeleton className="h-72 w-full"/></div> : error || !staff ? <Card className="mt-5 border-danger-bg">
      <CardContent className="p-5"><h1 className="text-xl font-semibold">Профиль недоступен</h1><p className="mt-2 text-sm text-muted-foreground">{error ?? 'Сотрудник не найден или у вас нет доступа к этому профилю.'}</p><div className="mt-4 flex gap-2"><Button variant="outline" onClick={reload}>Повторить</Button><Button asChild variant="secondary"><Link to="/app/staff">Вернуться к команде</Link></Button></div></CardContent>
    </Card> : <>
      <Card className="mt-4 overflow-hidden border-border bg-card shadow-sm">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
          <div className="relative mx-auto shrink-0 sm:mx-0"><StaffAvatar staff={staff} size="lg"/><span aria-hidden="true" className={`absolute bottom-0 right-0 size-3 rounded-full border-2 border-card ${staffColorDots[staff.color] ?? staffColorDots.slate}`} /></div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start"><h1 className="text-2xl font-semibold tracking-tight text-foreground">{staff.displayName}</h1><StatusBadge active={staff.isActive} /></div>
            <p className="mt-1 text-sm text-muted-foreground">Профиль специалиста · {staff.acceptsOnlineBooking ? 'принимает онлайн-запись' : 'запись по телефону'}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground sm:justify-start">
              {staff.email ? <a className="inline-flex min-w-0 items-center gap-2 hover:text-foreground" href={`mailto:${staff.email}`}><FontAwesomeIcon aria-hidden="true" icon={faEnvelope} className="size-3.5 shrink-0"/><span className="truncate">{staff.email}</span></a> : null}
              {staff.phone ? <a className="inline-flex items-center gap-2 hover:text-foreground" href={`tel:${staff.phone}`}><FontAwesomeIcon aria-hidden="true" icon={faPhone} className="size-3.5 shrink-0"/>{staff.phone}</a> : null}
              {!staff.email && !staff.phone ? <span>Контакты не добавлены</span> : null}
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 border-t border-border pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
            <span aria-hidden="true" className={`size-2.5 rounded-full ${staffColorDots[staff.color] ?? staffColorDots.slate}`} />
            <span className="text-sm text-muted-foreground">{serviceCount(assignedServiceCount(staff.id, serviceCatalog))}</span>
          </div>
        </CardContent>
      </Card>

      <Tabs className="mt-5 block" value={tab} onValueChange={(value) => { setTab(value as (typeof tabs)[number]['value']); setMessage(null); }}>
        <TabsList aria-label="Разделы профиля сотрудника" variant="line" className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-transparent p-0">
          {visibleTabs.map((item) => <TabsTrigger className="min-h-10 shrink-0 rounded-none border-b-2 border-transparent px-3 text-sm text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none" key={item.value} value={item.value}>{item.label}</TabsTrigger>)}
        </TabsList>

        {message ? <div className="mt-4"><FormMessage message={message} /></div> : null}

        <TabsContent value="profile" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(240px,0.85fr)]">
            <Card className="border-border bg-card shadow-sm">
              <CardHeader className="pb-4"><CardTitle className="text-base">Данные профиля</CardTitle><CardDescription>Контакты и информация, которую видит команда.</CardDescription></CardHeader>
              <CardContent>
                <form className="grid gap-4" key={profileRevision} onSubmit={(event) => { void saveProfile(event); }}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5"><Label htmlFor="staff-name">Имя</Label><Input autoComplete="name" defaultValue={staff.displayName} disabled={!canWrite} id="staff-name" minLength={2} name="displayName" required /></div>
                    <div className="grid gap-1.5"><Label htmlFor="staff-email">Email</Label><Input autoComplete="email" defaultValue={staff.email} disabled={!canWrite} id="staff-email" name="email" type="email" placeholder="name@example.com" /></div>
                    <div className="grid gap-1.5"><Label htmlFor="staff-phone">Телефон</Label><Input autoComplete="tel" defaultValue={staff.phone} disabled={!canWrite} id="staff-phone" name="phone" type="tel" placeholder="+996 …" /></div>
                    <div className="grid gap-1.5"><Label htmlFor="staff-color">Цвет в календаре</Label><NativeSelect className="w-full" defaultValue={staff.color} disabled={!canWrite} id="staff-color" name="color">{['amber','blue','green','orange','rose','slate','teal','violet'].map((color) => <NativeSelectOption key={color} value={color}>{staffColorLabels[color]}</NativeSelectOption>)}</NativeSelect></div>
                    <div className="grid gap-1.5"><Label htmlFor="staff-hourly-rate">Оплата за час ({session.data?.active.business.currency ?? 'KGS'})</Label><Input id="staff-hourly-rate" name="hourlyRate" type="number" min="0" step="0.01" defaultValue={(staff.hourlyRateMinor / 100).toFixed(2)} disabled={!canWrite} inputMode="decimal"/></div>
                  </div>
                  <div className="grid gap-1.5"><Label htmlFor="staff-bio">О специалисте</Label><Textarea defaultValue={staff.bio} disabled={!canWrite} id="staff-bio" name="bio" placeholder="Опыт, специализация и важная информация для клиентов." rows={4} /></div>
                  <div className="grid gap-2 rounded-md border border-border p-3">
                    <label className="flex cursor-pointer items-start gap-2.5" htmlFor="staff-online"><Checkbox defaultChecked={staff.acceptsOnlineBooking} disabled={!canWrite} id="staff-online" name="acceptsOnlineBooking"/><span><span className="block text-sm font-medium">Онлайн-запись доступна</span><span className="mt-0.5 block text-xs text-muted-foreground">Клиенты могут выбрать этого специалиста при бронировании.</span></span></label>
                    {canDeactivate ? <label className="flex cursor-pointer items-start gap-2.5 border-t border-border pt-2" htmlFor="staff-active"><Checkbox defaultChecked={staff.isActive} id="staff-active" name="isActive"/><span><span className="block text-sm font-medium">Сотрудник активен</span><span className="mt-0.5 block text-xs text-muted-foreground">Неактивный профиль скрыт из онлайн-записи.</span></span></label> : null}
                  </div>
                  {canWrite ? <div className="flex justify-end border-t border-border pt-4"><Button disabled={saving} type="submit">{saving ? 'Сохраняем…' : 'Сохранить изменения'}</Button></div> : null}
                </form>
              </CardContent>
            </Card>
            <Card className="h-fit border-border bg-card shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">Сводка</CardTitle><CardDescription>Текущее состояние специалиста.</CardDescription></CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex items-center justify-between gap-4"><span className="text-sm text-muted-foreground">Статус</span><StatusBadge active={staff.isActive} /></div>
                <div className="flex items-center justify-between gap-4"><span className="text-sm text-muted-foreground">Онлайн-запись</span><Badge variant="outline" className="font-normal">{staff.acceptsOnlineBooking ? 'Включена' : 'Выключена'}</Badge></div>
                <div className="flex items-center justify-between gap-4"><span className="text-sm text-muted-foreground">Назначено услуг</span><span className="font-medium tabular-nums text-foreground">{serviceCount(assignedServiceCount(staff.id, serviceCatalog))}</span></div>
                <div className="border-t border-border pt-3"><p className="text-xs leading-5 text-muted-foreground">Расписание, исключения и услуги редактируются в соседних разделах профиля.</p></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="schedule" className="mt-4"><StaffScheduleTab id={id} writable={permissions.includes('staff:schedule_write')} /></TabsContent>
        <TabsContent value="exceptions" className="mt-4"><StaffExceptionsTab id={id} writable={permissions.includes('staff:schedule_write')} /></TabsContent>
        <TabsContent value="services" className="mt-4"><StaffServicesTab id={id} writable={canWrite} /></TabsContent>
        {visibleTabs.some((item) => item.value === 'access') ? <TabsContent value="access" className="mt-4"><StaffAccessTab id={id} canManage={permissions.includes('members:manage_role')} canInvite={permissions.includes('members:invite')} /></TabsContent> : null}
      </Tabs>
    </>}

    <Dialog open={confirmDeactivate} title="Деактивировать сотрудника?" onClose={() => setConfirmDeactivate(false)}>
      <DialogHeader><DialogDescription>У сотрудника есть будущие записи. Подтвердите деактивацию — записи сохранятся, а доступ к кабинету будет отключён.</DialogDescription></DialogHeader>
      <DialogFooter className="border-t border-border pt-4"><Button disabled={saving} variant="outline" onClick={() => setConfirmDeactivate(false)}>Оставить активным</Button><Button disabled={saving} variant="destructive" onClick={() => { void confirmStaffDeactivation(); }}>{saving ? 'Деактивируем…' : 'Деактивировать'}</Button></DialogFooter>
    </Dialog>
  </main>;
}

function StaffScheduleTab({ id, writable }: { id: string; writable: boolean }) {
  const [result, setResult, error, loading, reload] = useRemote<{ weekly: WeeklyDay[] }>(`/api/staff/${id}/schedule`, { weekly: [] });
  const [message, setMessage] = useState<UiMessage | null>(null);
  const [saving, setSaving] = useState(false);
  const schedule = result.weekly;

  function updateDay(day: number, enabled: boolean) {
    const existing = schedule.find((item) => item.isoWeekday === day);
    const next = schedule.filter((item) => item.isoWeekday !== day);
    if (enabled) next.push(existing ?? { isoWeekday: day, intervals: [{ start: '09:00', end: '18:00' }], breaks: [] });
    setResult({ weekly: next.sort((a, b) => a.isoWeekday - b.isoWeekday) });
  }

  function patchDay(day: number, transform: (value: WeeklyDay) => WeeklyDay) {
    const existing = schedule.find((item) => item.isoWeekday === day);
    if (!existing) return;
    setResult({ weekly: schedule.map((item) => item.isoWeekday === day ? transform(item) : item) });
  }

  function addInterval(day: number) {
    patchDay(day, (value) => {
      if (value.intervals.length >= 3) return value;
      const interval = [...value.intervals].sort((a, b) => a.start.localeCompare(b.start)).find((item) => item.end > item.start);
      if (!interval) return value;
      const startMinutes = Number(interval.start.slice(0, 2)) * 60 + Number(interval.start.slice(3));
      const endMinutes = Number(interval.end.slice(0, 2)) * 60 + Number(interval.end.slice(3));
      const middle = Math.floor(((startMinutes + endMinutes) / 2) / 5) * 5;
      if (middle - startMinutes < 30 || endMinutes - middle < 30) return value;
      const time = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
      return { ...value, intervals: value.intervals.map((item) => item === interval ? { ...item, end: time(middle) } : item).concat({ start: time(middle), end: interval.end }) };
    });
  }

  function addBreak(day: number) {
    patchDay(day, (value) => {
      if (value.breaks.length >= 5) return value;
      const interval = value.intervals[0];
      if (!interval) return value;
      const startMinutes = Number(interval.start.slice(0, 2)) * 60 + Number(interval.start.slice(3));
      const endMinutes = Number(interval.end.slice(0, 2)) * 60 + Number(interval.end.slice(3));
      const middle = Math.floor(((startMinutes + endMinutes) / 2) / 5) * 5;
      if (middle - startMinutes < 15 || endMinutes - middle < 15) return value;
      const time = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
      return { ...value, breaks: [...value.breaks, { start: time(middle), end: time(Math.min(middle + 30, endMinutes)) }] };
    });
  }

  async function save() {
    if (!writable) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await apiRequest<{ affectedAppointmentsCount: number }>(`/api/staff/${id}/schedule`, { method: 'PUT', body: { weekly: schedule } });
      setMessage({ text: `Расписание сохранено. Будущих записей затронуто: ${response.affectedAppointmentsCount}.`, kind: 'success' });
    } catch (reason: unknown) {
      setMessage({ text: errorMessage(reason), kind: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return <Card className="border-border bg-card shadow-sm">
    <CardHeader className="pb-4"><CardTitle className="text-base">Недельный график</CardTitle><CardDescription>Укажите рабочие интервалы. Изменения сохраняются для выбранного специалиста.</CardDescription></CardHeader>
    <CardContent>
      {loading ? <div className="grid gap-3" role="status" aria-label="Загрузка расписания">{weekdays.slice(0, 5).map((day) => <Skeleton className="h-12" key={day} />)}</div> : error ? <LoadError message={error} onRetry={reload} /> : <div className="grid gap-2">
        {weekdays.map((name, index) => {
          const day = index + 1;
          const current = schedule.find((item) => item.isoWeekday === day);
          return <div className="grid gap-3 rounded-md border border-border px-3 py-3" key={day}>
            <label className="flex cursor-pointer items-center gap-3" htmlFor={`schedule-day-${day}`}><Checkbox checked={Boolean(current)} disabled={!writable} id={`schedule-day-${day}`} onCheckedChange={(checked) => updateDay(day, checked === true)} /><span className="text-sm font-medium text-foreground">{name}</span></label>
            {current ? <><div className="grid gap-2">{current.intervals.map((interval, intervalIndex) => <div className="grid items-end gap-2 sm:grid-cols-[minmax(100px,1fr)_minmax(120px,180px)_minmax(120px,180px)_auto]" key={`${day}-${intervalIndex}`}><span className="pb-2 text-xs text-muted-foreground">{current.intervals.length > 1 ? `Интервал ${intervalIndex + 1}` : 'Рабочее время'}</span><div className="grid gap-1"><Label className="text-xs text-muted-foreground" htmlFor={`start-${day}-${intervalIndex}`}>С</Label><Input aria-label={`${name}, интервал ${intervalIndex + 1}: начало`} className="tabular-nums" disabled={!writable} id={`start-${day}-${intervalIndex}`} type="time" value={interval.start} onChange={(event) => patchDay(day, (value) => ({ ...value, intervals: value.intervals.map((row, index) => index === intervalIndex ? { ...row, start: event.target.value } : row) }))} /></div><div className="grid gap-1"><Label className="text-xs text-muted-foreground" htmlFor={`end-${day}-${intervalIndex}`}>До</Label><Input aria-label={`${name}, интервал ${intervalIndex + 1}: конец`} className="tabular-nums" disabled={!writable} id={`end-${day}-${intervalIndex}`} type="time" value={interval.end} onChange={(event) => patchDay(day, (value) => ({ ...value, intervals: value.intervals.map((row, index) => index === intervalIndex ? { ...row, end: event.target.value } : row) }))} /></div><Button aria-label={`Удалить интервал ${intervalIndex + 1}, ${name}`} className="mb-0.5" disabled={!writable || current.intervals.length <= 1} size="icon-sm" type="button" variant="ghost" onClick={() => patchDay(day, (value) => ({ ...value, intervals: value.intervals.filter((_, index) => index !== intervalIndex), breaks: value.breaks.filter((item) => !(item.start >= interval.start && item.end <= interval.end)) }))}>×</Button></div>)}</div>
              <div className="grid gap-2 border-t border-border pt-2">{current.breaks.map((breakTime, breakIndex) => <div className="grid items-end gap-2 sm:grid-cols-[minmax(100px,1fr)_minmax(120px,180px)_minmax(120px,180px)_auto]" key={`${day}-break-${breakIndex}`}><span className="pb-2 text-xs text-muted-foreground">Перерыв {breakIndex + 1}</span><div className="grid gap-1"><Label className="text-xs text-muted-foreground" htmlFor={`break-start-${day}-${breakIndex}`}>С</Label><Input aria-label={`${name}, перерыв ${breakIndex + 1}: начало`} className="tabular-nums" disabled={!writable} id={`break-start-${day}-${breakIndex}`} type="time" value={breakTime.start} onChange={(event) => patchDay(day, (value) => ({ ...value, breaks: value.breaks.map((row, index) => index === breakIndex ? { ...row, start: event.target.value } : row) }))} /></div><div className="grid gap-1"><Label className="text-xs text-muted-foreground" htmlFor={`break-end-${day}-${breakIndex}`}>До</Label><Input aria-label={`${name}, перерыв ${breakIndex + 1}: конец`} className="tabular-nums" disabled={!writable} id={`break-end-${day}-${breakIndex}`} type="time" value={breakTime.end} onChange={(event) => patchDay(day, (value) => ({ ...value, breaks: value.breaks.map((row, index) => index === breakIndex ? { ...row, end: event.target.value } : row) }))} /></div><Button aria-label={`Удалить перерыв ${breakIndex + 1}, ${name}`} size="icon-sm" type="button" variant="ghost" disabled={!writable} onClick={() => patchDay(day, (value) => ({ ...value, breaks: value.breaks.filter((_, index) => index !== breakIndex) }))}>×</Button></div>)}</div>
              <div className="flex flex-wrap gap-2"><Button disabled={!writable || current.intervals.length >= 3} size="small" type="button" variant="outline" onClick={() => addInterval(day)}>Добавить интервал</Button><Button disabled={!writable || current.breaks.length >= 5 || current.intervals.length === 0} size="small" type="button" variant="outline" onClick={() => addBreak(day)}>Добавить перерыв</Button></div></> : <span className="text-sm text-muted-foreground">Выходной день</span>}
          </div>;
        })}
      </div>}
      {message ? <div className="mt-4"><FormMessage message={message} /></div> : null}
      {!loading && !error && writable ? <div className="mt-4 flex justify-end border-t border-border pt-4"><Button disabled={saving} onClick={() => { void save(); }}>{saving ? 'Сохраняем…' : 'Сохранить расписание'}</Button></div> : null}
      {!writable ? <p className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">У вас есть доступ только для просмотра расписания.</p> : null}
    </CardContent>
  </Card>;
}

function StaffExceptionsTab({ id, writable }: { id: string; writable: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  const [rows, setRows, error, loading, reload] = useRemote<StaffException[]>(`/api/staff/${id}/exceptions?from=${today}&to=${today.slice(0, 4)}-12-31`, []);
  const [message, setMessage] = useState<UiMessage | null>(null);
  const [saving, setSaving] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!writable) return;
    setSaving(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const kind = String(form.get('kind'));
    try {
      await apiRequest(`/api/staff/${id}/exceptions`, { method: 'POST', body: { date: form.get('date'), kind, intervals: kind === 'day_off' ? [] : [{ start: form.get('start'), end: form.get('end') }], breaks: [], reason: form.get('reason') || undefined } });
      setMessage({ text: 'Исключение сохранено.', kind: 'success' });
      reload();
    } catch (reason: unknown) {
      setMessage({ text: errorMessage(reason), kind: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function remove(date: string) {
    if (!writable) return;
    setMessage(null);
    try {
      await apiRequest(`/api/staff/${id}/exceptions/${date}`, { method: 'DELETE' });
      setRows(rows.filter((row) => row.date !== date));
      setMessage({ text: 'Исключение удалено.', kind: 'success' });
    } catch (reason: unknown) {
      setMessage({ text: errorMessage(reason), kind: 'error' });
    }
  }

  return <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
    <Card className="h-fit border-border bg-card shadow-sm">
      <CardHeader className="pb-4"><CardTitle className="text-base">Новое исключение</CardTitle><CardDescription>Выходной или особый график на выбранную дату.</CardDescription></CardHeader>
      <CardContent>
        <form className="grid gap-3" onSubmit={(event) => { void create(event); }}>
          <div className="grid gap-1.5"><Label htmlFor="exception-date">Дата</Label><Input disabled={!writable} id="exception-date" name="date" type="date" required min={today} /></div>
          <div className="grid gap-1.5"><Label htmlFor="exception-kind">Тип исключения</Label><NativeSelect className="w-full" disabled={!writable} id="exception-kind" name="kind"><NativeSelectOption value="day_off">Выходной</NativeSelectOption><NativeSelectOption value="custom">Особый график</NativeSelectOption></NativeSelect></div>
          <div className="grid grid-cols-2 gap-3"><div className="grid gap-1.5"><Label htmlFor="exception-start">Начало</Label><Input disabled={!writable} defaultValue="10:00" id="exception-start" name="start" type="time" /></div><div className="grid gap-1.5"><Label htmlFor="exception-end">Окончание</Label><Input disabled={!writable} defaultValue="16:00" id="exception-end" name="end" type="time" /></div></div>
          <div className="grid gap-1.5"><Label htmlFor="exception-reason">Причина <span className="font-normal text-muted-foreground">(необязательно)</span></Label><Input disabled={!writable} id="exception-reason" name="reason" placeholder="Например, обучение" /></div>
          {writable ? <Button disabled={saving} className="mt-1" type="submit">{saving ? 'Сохраняем…' : 'Добавить исключение'}</Button> : null}
        </form>
      </CardContent>
    </Card>
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="pb-4"><CardTitle className="text-base">Исключения</CardTitle><CardDescription>Запланированные изменения обычного графика.</CardDescription></CardHeader>
      <CardContent>
        {error ? <LoadError message={error} onRetry={reload} /> : loading ? <div className="grid gap-3" role="status" aria-label="Загрузка исключений"><Skeleton className="h-14"/><Skeleton className="h-14"/></div> : rows.length ? <ul className="divide-y divide-border border-y border-border">{rows.map((row) => <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between" key={row.date}>
          <div className="min-w-0"><p className="font-medium text-foreground">{new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${row.date}T12:00:00Z`))}</p><p className="mt-0.5 text-sm text-muted-foreground">{row.kind === 'day_off' ? 'Выходной' : 'Особый график'}{row.reason ? ` · ${row.reason}` : ''}</p></div>
          {writable ? <Button aria-label={`Удалить исключение: ${row.date}`} className="self-start sm:self-auto" size="small" variant="outline" onClick={() => { void remove(row.date); }}>Удалить</Button> : null}
        </li>)}</ul> : <div className="grid min-h-36 place-items-center text-center"><div><p className="font-medium text-foreground">Исключений пока нет</p><p className="mt-1 text-sm text-muted-foreground">Здесь появятся выходные и особые рабочие дни.</p></div></div>}
        {message ? <div className="mt-4"><FormMessage message={message} /></div> : null}
      </CardContent>
    </Card>
  </div>;
}

function StaffServicesTab({ id, writable }: { id: string; writable: boolean }) {
  const [catalog, , error, loading, reload] = useRemote<Service[]>('/api/services', []);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<UiMessage | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<{ serviceIds: string[] }>(`/api/staff/${id}/services`, { signal: controller.signal }).then((result) => setSelected(result.serviceIds)).catch((reason: unknown) => { if (!controller.signal.aborted) setMessage({ text: errorMessage(reason), kind: 'error' }); });
    return () => controller.abort();
  }, [id]);

  async function save() {
    if (!writable) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiRequest(`/api/staff/${id}/services`, { method: 'PUT', body: { serviceIds: selected } });
      setMessage({ text: 'Список услуг сохранён.', kind: 'success' });
    } catch (reason: unknown) {
      setMessage({ text: errorMessage(reason), kind: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return <Card className="border-border bg-card shadow-sm">
    <CardHeader className="pb-4"><CardTitle className="text-base">Услуги специалиста</CardTitle><CardDescription>Выберите услуги, которые этот сотрудник может проводить.</CardDescription></CardHeader>
    <CardContent>
      {error ? <LoadError message={error} onRetry={reload} /> : loading ? <div className="grid gap-3 sm:grid-cols-2" role="status" aria-label="Загрузка каталога услуг">{Array.from({ length: 4 }, (_, index) => <Skeleton className="h-16" key={index} />)}</div> : catalog.length ? <ul className="grid gap-2 sm:grid-cols-2">{catalog.map((service) => <li key={service.id}>
        <label className="flex min-h-[68px] cursor-pointer items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-accent/50" htmlFor={`staff-service-${service.id}`}>
          <Checkbox checked={selected.includes(service.id)} disabled={!writable || !service.isActive} id={`staff-service-${service.id}`} onCheckedChange={(checked) => setSelected((current) => checked === true ? [...current, service.id] : current.filter((value) => value !== service.id))} />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{service.name}</span><span className="mt-1 block text-xs text-muted-foreground">{service.durationMinutes} мин{service.bufferMinutes ? ` · перерыв ${service.bufferMinutes} мин` : ''}{service.isActive ? '' : ' · услуга неактивна'}</span></span>
          {selected.includes(service.id) ? <Badge variant="outline" className="shrink-0 font-normal">Выбрана</Badge> : null}
        </label>
      </li>)}</ul> : <div className="grid min-h-36 place-items-center text-center"><p className="text-sm text-muted-foreground">В каталоге пока нет услуг. Сначала добавьте услугу в разделе «Услуги».</p></div>}
      {message ? <div className="mt-4"><FormMessage message={message} /></div> : null}
      {!loading && !error && writable && catalog.length ? <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4"><p aria-live="polite" className="text-xs text-muted-foreground">Выбрано: {selected.length}</p><Button disabled={saving} onClick={() => { void save(); }}>{saving ? 'Сохраняем…' : 'Сохранить услуги'}</Button></div> : null}
      {!writable ? <p className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">У вас есть доступ только для просмотра услуг специалиста.</p> : null}
    </CardContent>
  </Card>;
}

function StaffAccessTab({ id, canManage, canInvite }: { id: string; canManage: boolean; canInvite: boolean }) {
  const [members, setMembers, error, loading, reload] = useRemote<Member[]>('/api/members?limit=100', []);
  const [message, setMessage] = useState<UiMessage | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const rows = members.filter((member) => member.staffId === id);

  async function update(member: Member, status: 'active' | 'disabled') {
    setBusyId(member.id);
    setMessage(null);
    try {
      const updated = await apiRequest<Member>(`/api/members/${member.id}`, { method: 'PATCH', body: { status } });
      setMembers(members.map((row) => row.id === member.id ? updated : row));
      setMessage({ text: status === 'disabled' ? 'Доступ сотрудника отключён.' : 'Доступ сотрудника включён.', kind: 'success' });
    } catch (reason: unknown) {
      setMessage({ text: errorMessage(reason), kind: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function resend(member: Member) {
    setBusyId(member.id);
    setMessage(null);
    try {
      await apiRequest(`/api/members/${member.id}/resend-invite`, { method: 'POST' });
      setMessage({ text: 'Приглашение отправлено повторно.', kind: 'success' });
    } catch (reason: unknown) {
      setMessage({ text: errorMessage(reason), kind: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  const statusLabel: Record<string, string> = { active: 'Активен', invited: 'Ожидает приглашения', disabled: 'Доступ отключён' };

  return <Card className="border-border bg-card shadow-sm">
    <CardHeader className="pb-4"><CardTitle className="text-base">Доступ к кабинету</CardTitle><CardDescription>Приглашение и состояние учётной записи сотрудника.</CardDescription></CardHeader>
    <CardContent>
      {error ? <LoadError message={error} onRetry={reload} /> : loading ? <div className="grid gap-3" role="status" aria-label="Загрузка участников"><Skeleton className="h-16"/><Skeleton className="h-16"/></div> : rows.length ? <ul className="divide-y divide-border border-y border-border">{rows.map((member) => <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between" key={member.id}>
        <div className="flex min-w-0 items-center gap-3"><Avatar><AvatarFallback>{initials(member.user.name)}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{member.user.name}</p><p className="truncate text-xs text-muted-foreground">{member.user.email}</p><p className="mt-1 text-xs text-muted-foreground">{statusLabel[member.status] ?? member.status}</p></div></div>
        <div className="flex flex-wrap gap-2">{member.status === 'invited' && canInvite ? <Button disabled={busyId === member.id} size="small" variant="outline" onClick={() => { void resend(member); }}><FontAwesomeIcon aria-hidden="true" icon={faPaperPlane}/>{busyId === member.id ? 'Отправляем…' : 'Повторить приглашение'}</Button> : null}{canManage ? <Button disabled={busyId === member.id} size="small" variant={member.status === 'disabled' ? 'outline' : 'secondary'} onClick={() => { void update(member, member.status === 'disabled' ? 'active' : 'disabled'); }}>{busyId === member.id ? 'Обновляем…' : member.status === 'disabled' ? 'Включить доступ' : 'Отключить доступ'}</Button> : null}</div>
      </li>)}</ul> : <div className="grid min-h-36 place-items-center text-center"><div><p className="font-medium text-foreground">Доступ к кабинету не настроен</p><p className="mt-1 text-sm text-muted-foreground">{canInvite ? 'Добавьте email сотрудника в профиле, чтобы отправить приглашение.' : 'Для сотрудника пока нет отдельной учётной записи.'}</p></div></div>}
      {message ? <div className="mt-4"><FormMessage message={message} /></div> : null}
    </CardContent>
  </Card>;
}
