import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError, apiRequest } from '@/lib/api-client';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { DialogShell as Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type InventoryItem = { id: string; name: string; unit: string; onHand: number; reorderThreshold: number; unitCostMinor: number; isActive: boolean; lowStock: boolean };
type Movement = { id: string; type: string; quantityDelta: number; reason: string; appointmentId?: string; createdAt: string };
function message(error: unknown) { return error instanceof ApiClientError ? error.message : 'Не удалось выполнить операцию.'; }
function money(value: number, currency: string) { return new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value / 100); }
function quantity(value: number) { return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 }).format(value); }

export function InventoryPage() {
  const currency = useSession().data?.active.business.currency ?? 'KGS';
  const [rows, setRows] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null);
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setLoading(true); setError('');
    try { setRows((await apiRequest<{ data: InventoryItem[] }>('/api/inventory')).data); }
    catch (reason: unknown) { setError(message(reason)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest('/api/inventory', { method: 'POST', body: { name: form.get('name'), unit: form.get('unit'), unitCostMinor: Math.round(Number(form.get('unitCost')) * 100), initialQuantity: Number(form.get('initialQuantity')), reorderThreshold: Number(form.get('reorderThreshold')) } });
      setCreateOpen(false); setNotice('Материал добавлен.'); await refresh();
    } catch (reason: unknown) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  async function updateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return; setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest(`/api/inventory/${editing.id}`, { method: 'PATCH', body: { name: form.get('name'), unit: form.get('unit'), unitCostMinor: Math.round(Number(form.get('unitCost')) * 100), reorderThreshold: Number(form.get('reorderThreshold')), isActive: form.get('isActive') === 'on' } });
      setEditing(null); setNotice('Материал обновлён.'); await refresh();
    } catch (reason: unknown) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  async function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!adjusting) return; setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest(`/api/inventory/${adjusting.id}/adjust`, { method: 'POST', body: { quantityDelta: Number(form.get('quantityDelta')), reason: form.get('reason') } });
      setAdjusting(null); setNotice('Остаток и журнал движения обновлены.'); await refresh();
    } catch (reason: unknown) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  async function showMovements(item: InventoryItem) {
    setMovementItem(item); setMovements([]);
    try { setMovements((await apiRequest<{ data: Movement[] }>(`/api/inventory/${item.id}/movements`)).data); }
    catch (reason: unknown) { setError(message(reason)); }
  }

  return <main className="mx-auto w-full max-w-[1440px] px-5 py-6 md:px-8">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Склад материалов</h1><p className="mt-1 text-sm text-neutral-600">Остатки списываются при завершении услуги. Все изменения сохраняются в журнале.</p></div><Button onClick={() => setCreateOpen(true)}>＋ Материал</Button></header>
    {error ? <p className="mt-4 text-sm text-danger-fg" role="alert">{error}</p> : null}{notice ? <p className="mt-4 text-sm text-success-fg" role="status">{notice}</p> : null}
    {loading ? <p className="mt-5 text-sm text-neutral-500" role="status">Загружаем склад…</p> : rows.length ? <div className="mt-5 overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-0"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-neutral-50 text-xs text-neutral-500"><tr><th className="px-4 py-3">Материал</th><th className="px-4 py-3">Остаток</th><th className="px-4 py-3">Порог</th><th className="px-4 py-3">Цена за единицу</th><th className="px-4 py-3">Статус</th><th className="px-4 py-3 text-right">Действия</th></tr></thead><tbody>{rows.map((item) => <tr className="border-t border-neutral-100" key={item.id}><td className="px-4 py-3 font-medium">{item.name}<span className="ml-1 text-xs font-normal text-neutral-500">({item.unit})</span></td><td className="px-4 py-3 tabular-nums">{quantity(item.onHand)} {item.unit}</td><td className="px-4 py-3 tabular-nums">{quantity(item.reorderThreshold)} {item.unit}</td><td className="px-4 py-3 tabular-nums">{money(item.unitCostMinor, currency)}</td><td className="px-4 py-3">{!item.isActive ? 'Отключён' : item.lowStock ? <span className="text-danger-fg">Мало на складе</span> : 'В наличии'}</td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-1"><Button size="small" variant="ghost" onClick={() => setAdjusting(item)}>Изменить остаток</Button><Button size="small" variant="ghost" onClick={() => { void showMovements(item); }}>История</Button><Button size="small" variant="ghost" onClick={() => setEditing(item)}>Настроить</Button></div></td></tr>)}</tbody></table></div> : <section className="mt-5 rounded-lg border border-neutral-200 bg-neutral-0 p-6 text-center"><h2 className="font-medium">Материалов пока нет</h2><p className="mt-1 text-sm text-neutral-600">Добавьте материалы, затем привяжите их к услугам.</p></section>}
    <Dialog open={createOpen} title="Новый материал" onClose={() => setCreateOpen(false)}><form className="grid gap-3" onSubmit={(event) => { void createItem(event); }}><label className="grid gap-1 text-sm">Название<Input name="name" required maxLength={120}/></label><label className="grid gap-1 text-sm">Единица учёта<Input name="unit" placeholder="мл, г, шт." required maxLength={20}/></label><label className="grid gap-1 text-sm">Цена за единицу, {currency}<Input name="unitCost" type="number" min="0" step="0.01" defaultValue="0" required/></label><label className="grid gap-1 text-sm">Начальный остаток<Input name="initialQuantity" type="number" min="0" step="0.0001" defaultValue="0" required/></label><label className="grid gap-1 text-sm">Предупреждать при остатке ниже<Input name="reorderThreshold" type="number" min="0" step="0.0001" defaultValue="0" required/></label><div className="flex justify-end gap-2 border-t pt-3"><Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>Отмена</Button><Button disabled={busy} type="submit">Добавить</Button></div></form></Dialog>
    <Dialog open={Boolean(editing)} title="Настройки материала" onClose={() => setEditing(null)}><form className="grid gap-3" key={editing?.id} onSubmit={(event) => { void updateItem(event); }}>{editing ? <><label className="grid gap-1 text-sm">Название<Input name="name" defaultValue={editing.name} required maxLength={120}/></label><label className="grid gap-1 text-sm">Единица учёта<Input name="unit" defaultValue={editing.unit} required maxLength={20}/></label><label className="grid gap-1 text-sm">Цена за единицу, {currency}<Input name="unitCost" type="number" min="0" step="0.01" defaultValue={(editing.unitCostMinor / 100).toFixed(2)} required/></label><label className="grid gap-1 text-sm">Порог остатка<Input name="reorderThreshold" type="number" min="0" step="0.0001" defaultValue={editing.reorderThreshold} required/></label><label className="flex items-center gap-2 text-sm"><input name="isActive" type="checkbox" defaultChecked={editing.isActive}/>Активен</label><div className="flex justify-end gap-2 border-t pt-3"><Button variant="secondary" type="button" onClick={() => setEditing(null)}>Отмена</Button><Button disabled={busy} type="submit">Сохранить</Button></div></> : null}</form></Dialog>
    <Dialog open={Boolean(adjusting)} title={adjusting ? `Остаток: ${adjusting.name}` : ''} onClose={() => setAdjusting(null)}><form className="grid gap-3" onSubmit={(event) => { void adjust(event); }}><p className="text-sm text-neutral-600">Положительное число пополняет склад, отрицательное — корректирует остаток вниз.</p><label className="grid gap-1 text-sm">Изменение, {adjusting?.unit}<Input name="quantityDelta" type="number" step="0.0001" defaultValue="1" required/></label><label className="grid gap-1 text-sm">Причина<Input name="reason" minLength={2} maxLength={240} placeholder="Закупка, инвентаризация…" required/></label><div className="flex justify-end gap-2 border-t pt-3"><Button variant="secondary" type="button" onClick={() => setAdjusting(null)}>Отмена</Button><Button disabled={busy} type="submit">Сохранить остаток</Button></div></form></Dialog>
    <Dialog open={Boolean(movementItem)} title={movementItem ? `Движение: ${movementItem.name}` : ''} onClose={() => setMovementItem(null)}>{movements.length ? <ol className="max-h-[60vh] divide-y overflow-y-auto">{movements.map((row) => <li className="py-3" key={row.id}><div className="flex justify-between gap-3"><strong className="tabular-nums">{row.quantityDelta > 0 ? '+' : ''}{quantity(row.quantityDelta)} {movementItem?.unit}</strong><time className="text-xs text-neutral-500">{new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.createdAt))}</time></div><p className="mt-1 text-sm text-neutral-600">{row.reason}</p></li>)}</ol> : <p className="py-5 text-sm text-neutral-500">Движений пока нет.</p>}</Dialog>
  </main>;
}
