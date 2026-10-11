import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError, apiRequest } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type NotificationPreferences = {
  appointmentAlerts: boolean;
  paymentAlerts: boolean;
  pushEnabled: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  quietHoursStart: string;
  quietHoursEnd: string;
};
type PreferenceEnvelope = {
  preferences: NotificationPreferences;
  pushConfigured: boolean;
  activeDevices: number;
  devices: { id: string; browser: string; createdAt: string; lastUsedAt: string | null }[];
  timezone: string;
  publicKey?: string;
};

function errorText(error: unknown) { return error instanceof ApiClientError ? error.message : 'Не удалось сохранить настройки уведомлений.'; }

function playNotificationTone(volume: number): boolean {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return false;
  try {
    const context = new window.AudioContext();
    void context.resume().then(() => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(Math.max(0.01, Math.min(1, volume)) * 0.16, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.18);
      window.setTimeout(() => { void context.close(); }, 400);
    }).catch(() => { void context.close(); });
    return true;
  } catch {
    return false;
  }
}

function decodeApplicationServerKey(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const raw = window.atob(padded);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function NotificationPreferencesCard() {
  const [data, setData] = useState<PreferenceEnvelope | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [revokingDevice, setRevokingDevice] = useState<string | null>(null);
  const [browserSubscribed, setBrowserSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<PreferenceEnvelope>('/api/notifications/preferences', { signal: controller.signal })
      .then(setData)
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(errorText(reason)); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistration('/').then((registration) => registration?.pushManager.getSubscription()).then((subscription) => {
        if (active) setBrowserSubscribed(Boolean(subscription));
      }).catch(() => { if (active) setBrowserSubscribed(false); });
    }
    return () => { active = false; };
  }, []);

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const form = new FormData(event.currentTarget);
    const quietHoursStart = String(form.get('quietHoursStart') ?? '');
    const quietHoursEnd = String(form.get('quietHoursEnd') ?? '');
    if (Boolean(quietHoursStart) !== Boolean(quietHoursEnd)) {
      setMessage('Для тихих часов укажите и начало, и конец.');
      return;
    }
    setBusy(true); setMessage(null); setError(null);
    try {
      const result = await apiRequest<PreferenceEnvelope>('/api/notifications/preferences', {
        method: 'PATCH',
        body: {
          appointmentAlerts: form.has('appointmentAlerts'),
          paymentAlerts: form.has('paymentAlerts'),
          soundEnabled: form.has('soundEnabled'),
          soundVolume: Number(form.get('soundVolume')),
          quietHoursStart,
          quietHoursEnd,
        },
      });
      setData(result);
      if (result.preferences.soundEnabled) playNotificationTone(result.preferences.soundVolume);
      setMessage('Настройки сохранены.');
    } catch (reason: unknown) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  async function enablePush() {
    if (!data?.pushConfigured || !data.publicKey) {
      setError('Push-уведомления требуют VAPID-ключи в настройках сервера.');
      return;
    }
    if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setError('Этот браузер не поддерживает push в текущем режиме. Используйте защищённый адрес сайта.');
      return;
    }
    setPushBusy(true); setError(null); setMessage(null);
    try {
      const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      if (permission !== 'granted') {
        setError(permission === 'denied' ? 'Разрешение отключено в настройках браузера. Разрешите уведомления для BeautyFlow и повторите.' : 'Браузер не разрешил уведомления.');
        return;
      }
      const registration = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
      const ready = await navigator.serviceWorker.ready;
      let subscription = await ready.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeApplicationServerKey(data.publicKey) as BufferSource });
      const result = await apiRequest<PreferenceEnvelope>('/api/notifications/push-subscription', { method: 'PUT', body: subscription.toJSON() });
      setData(result);
      setBrowserSubscribed(true);
      setMessage('Этот браузер подключён к push-уведомлениям.');
    } catch (reason: unknown) { setError(errorText(reason)); }
    finally { setPushBusy(false); }
  }

  async function disablePush() {
    setPushBusy(true); setError(null); setMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await apiRequest('/api/notifications/push-subscription', { method: 'DELETE', body: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
        setBrowserSubscribed(false);
      } else {
        await apiRequest<PreferenceEnvelope>('/api/notifications/preferences', { method: 'PATCH', body: { pushEnabled: false } });
      }
      setData(await apiRequest<PreferenceEnvelope>('/api/notifications/preferences'));
      setMessage('Push-уведомления отключены для этого браузера.');
    } catch (reason: unknown) { setError(errorText(reason)); }
    finally { setPushBusy(false); }
  }

  async function sendTest() {
    setTestBusy(true); setError(null); setMessage(null);
    try {
      await apiRequest('/api/notifications/push-test', { method: 'POST', body: {} });
      setMessage('Тест поставлен в очередь и придёт в этот браузер.');
    } catch (reason: unknown) { setError(errorText(reason)); }
    finally { setTestBusy(false); }
  }

  async function revokeDevice(id: string) {
    setRevokingDevice(id); setError(null); setMessage(null);
    try {
      const result = await apiRequest<PreferenceEnvelope>(`/api/notifications/push-subscriptions/${id}`, { method: 'DELETE' });
      setData(result);
      setMessage('Устройство отключено.');
    } catch (reason: unknown) { setError(errorText(reason)); }
    finally { setRevokingDevice(null); }
  }

  return <Card className="max-w-2xl">
    <CardHeader><CardTitle className="text-base">Уведомления</CardTitle><CardDescription>Настройки действуют только для вашего аккаунта в этом салоне.</CardDescription></CardHeader>
    <CardContent className="grid gap-5">
      {error ? <p className="text-sm text-danger-fg" role="alert">{error}</p> : null}
      {message ? <p className="text-sm" role="status">{message}</p> : null}
      {!data ? <p className="text-sm text-muted-foreground" role="status">Загружаем настройки…</p> : <>
        <form className="grid gap-4" onSubmit={(event) => { void savePreferences(event); }}>
          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-medium">События в кабинете</legend>
            <label className="flex items-start gap-2 text-sm"><input name="appointmentAlerts" type="checkbox" defaultChecked={data.preferences.appointmentAlerts}/><span>Новые, перенесённые и отменённые записи</span></label>
            <label className="flex items-start gap-2 text-sm"><input name="paymentAlerts" type="checkbox" defaultChecked={data.preferences.paymentAlerts}/><span>Принятые оплаты и возвраты</span></label>
          </fieldset>
          <fieldset className="grid gap-3 border-t border-border pt-4">
            <legend className="mb-1 text-sm font-medium">Звук</legend>
            <label className="flex items-start gap-2 text-sm"><input name="soundEnabled" type="checkbox" defaultChecked={data.preferences.soundEnabled}/><span>Включить короткий сигнал для новых уведомлений</span></label>
            <div className="grid gap-1.5"><Label htmlFor="notification-volume">Громкость</Label><input className="w-full accent-primary" id="notification-volume" name="soundVolume" type="range" min="0.1" max="1" step="0.05" defaultValue={data.preferences.soundVolume}/></div>
            <Button className="w-fit" type="button" variant="outline" onClick={() => { if (!playNotificationTone(data.preferences.soundVolume)) setError('Браузер не разрешил воспроизвести звук.'); }}>Проверить звук</Button>
          </fieldset>
          <fieldset className="grid gap-3 border-t border-border pt-4">
            <legend className="mb-1 text-sm font-medium">Тихие часы</legend>
            <p className="text-xs text-muted-foreground">Push будет ждать окончания тихих часов. Уведомления в кабинете останутся доступными. Часовой пояс: {data.timezone}.</p>
            <div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-1.5"><Label htmlFor="quiet-hours-start">С</Label><Input id="quiet-hours-start" name="quietHoursStart" type="time" defaultValue={data.preferences.quietHoursStart}/></div><div className="grid gap-1.5"><Label htmlFor="quiet-hours-end">До</Label><Input id="quiet-hours-end" name="quietHoursEnd" type="time" defaultValue={data.preferences.quietHoursEnd}/></div></div>
          </fieldset>
          <Button className="w-fit" disabled={busy} type="submit">{busy ? 'Сохраняем…' : 'Сохранить настройки'}</Button>
        </form>
        <section className="grid gap-3 border-t border-border pt-4" aria-labelledby="browser-push-heading">
          <div><h3 id="browser-push-heading" className="text-sm font-medium">Уведомления браузера</h3><p className="mt-1 text-xs text-muted-foreground">Приходят, даже когда BeautyFlow открыт в другой вкладке или свёрнут. Управляются разрешением браузера.</p></div>
          {!data.pushConfigured ? <p className="text-sm text-muted-foreground">Push-канал ещё не настроен на сервере. После добавления VAPID-ключей здесь появится подключение браузера.</p> : <>
            <p className="text-sm text-muted-foreground">Подключено браузеров: {data.activeDevices}. События: записи и платежи согласно настройкам выше.</p>
            {data.devices.length ? <ul aria-label="Устройства с push-уведомлениями" className="grid gap-2">{data.devices.map((device) => <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2" key={device.id}><div><strong className="block text-sm">{device.browser}</strong><span className="text-xs text-muted-foreground">Последняя активность: {device.lastUsedAt ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(device.lastUsedAt)) : 'неизвестна'}</span></div><Button disabled={revokingDevice === device.id} size="small" type="button" variant="ghost" onClick={() => { void revokeDevice(device.id); }}>{revokingDevice === device.id ? 'Отключаем…' : 'Отключить'}</Button></li>)}</ul> : null}
            <div className="flex flex-wrap gap-2">{!browserSubscribed || !data.preferences.pushEnabled ? <Button disabled={pushBusy} onClick={() => { void enablePush(); }}>{pushBusy ? 'Подключаем…' : browserSubscribed ? 'Включить push для аккаунта' : 'Подключить этот браузер'}</Button> : <><Button disabled={pushBusy} type="button" variant="secondary" onClick={() => { void disablePush(); }}>{pushBusy ? 'Отключаем…' : 'Отключить этот браузер'}</Button><Button disabled={testBusy} type="button" variant="outline" onClick={() => { void sendTest(); }}>{testBusy ? 'Отправляем…' : 'Тестовое уведомление'}</Button></>}</div>
          </>}
        </section>
      </>}
    </CardContent>
  </Card>;
}
