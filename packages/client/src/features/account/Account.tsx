import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiClientError, apiRequest } from '@/lib/api-client';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NotificationPreferencesCard } from './NotificationPreferences';

function errorText(error: unknown) { return error instanceof ApiClientError ? error.message : 'Не удалось сохранить изменения.'; }

export function AccountPage() {
  const queryClient = useQueryClient();
  const session = useSession();
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setProfileMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest('/api/auth/profile', { method: 'PATCH', body: { name: form.get('name') } });
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      setProfileMessage('Имя сохранено.');
    } catch (error: unknown) { setProfileMessage(errorText(error)); }
    finally { setBusy(false); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setPasswordMessage(null);
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get('currentPassword') ?? '');
    const newPassword = String(form.get('newPassword') ?? '');
    const confirmPassword = String(form.get('confirmPassword') ?? '');
    if (newPassword !== confirmPassword) { setPasswordMessage('Новый пароль и подтверждение не совпадают.'); setBusy(false); return; }
    try {
      await apiRequest('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
      event.currentTarget.reset();
      setPasswordMessage('Пароль изменён.');
    } catch (error: unknown) { setPasswordMessage(errorText(error)); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto grid w-full max-w-5xl gap-5 px-5 py-6 md:px-8">
    <header><h1 className="text-2xl font-semibold">Мой аккаунт</h1><p className="mt-1 text-sm text-muted-foreground">Профиль для входа в BeautyFlow.</p></header>
    <Card className="max-w-2xl"><CardHeader><CardTitle className="text-base">Профиль</CardTitle><CardDescription>Email используется для входа и не меняется здесь.</CardDescription></CardHeader><CardContent><form className="grid gap-4" onSubmit={(event) => { void updateProfile(event); }}><div className="grid gap-1.5"><Label htmlFor="account-name">Имя</Label><Input id="account-name" name="name" defaultValue={session.data?.user.name ?? ''} required minLength={2} maxLength={120}/></div><div className="grid gap-1.5"><Label htmlFor="account-email">Email</Label><Input id="account-email" value={session.data?.user.email ?? ''} readOnly/></div>{profileMessage ? <p role="status" className="text-sm">{profileMessage}</p> : null}<Button className="w-fit" disabled={busy} type="submit">Сохранить профиль</Button></form></CardContent></Card>
    <Card className="max-w-2xl"><CardHeader><CardTitle className="text-base">Пароль</CardTitle><CardDescription>Выберите новый пароль длиной не менее 10 символов.</CardDescription></CardHeader><CardContent><form className="grid gap-4" onSubmit={(event) => { void changePassword(event); }}><div className="grid gap-1.5"><Label htmlFor="current-password">Текущий пароль</Label><Input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required/></div><div className="grid gap-1.5"><Label htmlFor="new-password">Новый пароль</Label><Input id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required/></div><div className="grid gap-1.5"><Label htmlFor="confirm-password">Повторите новый пароль</Label><Input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required/></div>{passwordMessage ? <p role="status" className="text-sm">{passwordMessage}</p> : null}<Button className="w-fit" disabled={busy} type="submit">Изменить пароль</Button></form></CardContent></Card>
    <NotificationPreferencesCard/>
  </main>;
}
