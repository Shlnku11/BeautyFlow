import { useEffect, useState, type FormEvent } from 'react';
import { DateTime } from 'luxon';
import { ApiClientError, apiRequest } from '@/lib/api-client';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { downloadPdfDocument } from '@/lib/pdf-download';
import type { Content } from 'pdfmake';

type Report = { from: string; to: string; timezone: string; currency: string; totals: { incomeMinor: number; refundsMinor: number; materialCostMinor: number; payrollMinor: number; netProfitMinor: number | null; completedAppointments: number; unpricedCostAppointments: number; paidOperations: number; shifts: number }; payroll: { staffId: string; name: string; minutes: number; wageMinor: number }[] };
function money(amountMinor: number | null, currency: string) { return amountMinor === null ? 'Недостаточно данных' : new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amountMinor / 100); }
function periodDate(zone: string) { return DateTime.now().setZone(zone).toISODate() ?? new Date().toISOString().slice(0, 10); }
function showError(error: unknown) { return error instanceof ApiClientError ? error.message : 'Не удалось построить отчёт.'; }

function reportContent(report: Report): Content[] {
  const rows: [string, number | null][] = [
    ['Выручка', report.totals.incomeMinor],
    ['Возвраты', -report.totals.refundsMinor],
    ['Материалы', -report.totals.materialCostMinor],
    ['Зарплата по сменам', -report.totals.payrollMinor],
    ['Остаток после учтённых расходов', report.totals.netProfitMinor],
  ];
  const payrollRows = report.payroll.map((row) => [
    row.name,
    `${Math.floor(row.minutes / 60)} ч ${row.minutes % 60} мин`,
    money(row.wageMinor, report.currency),
  ]);
  const payrollBody = payrollRows.length ? payrollRows : [['Нет смен за период', '', '']];
  return [
    { text: 'Финансовый отчёт', style: 'title' },
    { text: `Период: ${report.from} — ${report.to}`, margin: [0, 0, 0, 4] },
    { text: `Часовой пояс: ${report.timezone}`, margin: [0, 0, 0, 14] },
    { text: 'Итоги', style: 'section' },
    { table: { widths: ['*', 'auto'], body: rows.map(([label, value]) => [label, money(value, report.currency)]) }, layout: 'lightHorizontalLines' },
    { text: 'Активность', style: 'section', margin: [0, 16, 0, 6] },
    { text: `${report.totals.completedAppointments} завершённых услуг · ${report.totals.paidOperations} операций оплаты · ${report.totals.shifts} смен` },
    { text: 'Начисления сотрудникам', style: 'section', margin: [0, 16, 0, 6] },
    { table: { headerRows: 1, widths: ['*', 'auto', 'auto'], body: [['Сотрудник', 'Время', 'Начислено'], ...payrollBody] }, layout: 'lightHorizontalLines' },
    { text: 'Остаток рассчитан только по учтённым возвратам, материалам и сменам; аренда, налоги и другие неучтённые расходы в него не входят.', style: 'note', margin: [0, 14, 0, 0] },
  ];
}

export function ReportsPage() {
  const timezone = useSession().data?.active.business.timezone ?? 'Asia/Bishkek';
  const [from, setFrom] = useState(() => periodDate(timezone));
  const [to, setTo] = useState(() => periodDate(timezone));
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function load(start = from, end = to) {
    if (!start || !end || start > end) { setError('Проверьте даты отчёта: начало не может быть позже окончания.'); return; }
    setLoading(true); setError(null);
    try { setReport(await apiRequest<Report>(`/api/reports/financial?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`)); }
    catch (reason: unknown) { setError(showError(reason)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(periodDate(timezone), periodDate(timezone)); }, [timezone]);

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void load(); }
  function chooseDays(days: number) {
    const end = DateTime.now().setZone(timezone).startOf('day');
    const start = end.minus({ days: days - 1 });
    const fromDate = start.toISODate() ?? '';
    const toDate = end.toISODate() ?? '';
    setFrom(fromDate); setTo(toDate); void load(fromDate, toDate);
  }

  async function downloadReport() {
    if (!report || loading || exporting) return;
    setExporting(true); setError(null);
    try {
      await downloadPdfDocument(reportContent(report), `finansovyy-otchet-${report.from}-${report.to}.pdf`, {
        defaultStyle: { font: 'Roboto', fontSize: 10 },
        styles: { title: { fontSize: 18, bold: true, margin: [0, 0, 0, 12] }, section: { fontSize: 12, bold: true }, note: { fontSize: 8, color: '#606770' } },
        pageMargins: [40, 40, 40, 40],
      });
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Не удалось скачать PDF отчёт.');
    } finally {
      setExporting(false);
    }
  }

  const totals = report?.totals;
  return <main className="mx-auto w-full max-w-[1440px] px-5 py-6 md:px-8">
    <header><h1 className="text-2xl font-semibold">Финансовый отчёт</h1><p className="mt-1 text-sm text-neutral-600">Отчёт показывает выручку за вычетом учтённых возвратов, материалов и начислений по сменам.</p></header>
    <form className="mt-5 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-neutral-0 p-4" onSubmit={submit}><label className="grid gap-1 text-xs text-neutral-600"><span>С</span><Input aria-label="Начало периода" type="date" value={from} onChange={(event) => setFrom(event.target.value)}/></label><label className="grid gap-1 text-xs text-neutral-600"><span>По</span><Input aria-label="Конец периода" type="date" value={to} onChange={(event) => setTo(event.target.value)}/></label><Button disabled={loading} type="submit">{loading ? 'Считаем…' : 'Построить отчёт'}</Button><Button disabled={!report || loading || exporting} onClick={() => { void downloadReport(); }} type="button" variant="outline">{exporting ? 'Формируем PDF…' : 'Скачать PDF'}</Button><div className="flex flex-wrap gap-2 sm:ml-auto"><Button size="small" type="button" variant="outline" onClick={() => chooseDays(1)}>Сегодня</Button><Button size="small" type="button" variant="outline" onClick={() => chooseDays(7)}>7 дней</Button><Button size="small" type="button" variant="outline" onClick={() => chooseDays(30)}>30 дней</Button></div></form>
    {error ? <p className="mt-4 text-sm text-danger-fg" role="alert">{error}</p> : null}
    {loading && !report ? <p className="mt-5 text-sm text-neutral-500" role="status">Строим отчёт…</p> : null}
    {report && totals ? <>
      <p className="mt-4 text-xs text-neutral-500">Период: {report.from} — {report.to} · часовой пояс {report.timezone}</p>
      {totals.unpricedCostAppointments > 0 ? <p className="mt-3 rounded-md border border-warning-solid/30 bg-warning-bg p-3 text-sm text-warning-fg" role="note">В {totals.unpricedCostAppointments} завершённых записях нет сохранённых расходов на материалы, поэтому чистая прибыль за период не показывается.</p> : null}
      <section aria-label="Итоги периода" className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[["Выручка", totals.incomeMinor], ["Возвраты", -totals.refundsMinor], ["Материалы", -totals.materialCostMinor], ["Зарплата по сменам", -totals.payrollMinor], ["После учтённых расходов", totals.netProfitMinor]].map(([label, value]) => <Card key={label}><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-neutral-600">{label}</CardTitle></CardHeader><CardContent><p className={`text-xl font-semibold tabular-nums ${label === 'После учтённых расходов' ? 'text-neutral-900' : ''}`}>{money(value as number, report.currency)}</p></CardContent></Card>)}
      </section>
      <section className="mt-4 rounded-lg border border-neutral-200 bg-neutral-0 p-4"><h2 className="font-semibold">Активность периода</h2><p className="mt-2 text-sm text-neutral-600">{totals.completedAppointments} завершённых услуг · {totals.paidOperations} операций оплаты · {totals.shifts} смен, попавших в период.</p></section>
      <section className="mt-4 rounded-lg border border-neutral-200 bg-neutral-0 p-4"><h2 className="font-semibold">Начисления сотрудникам</h2>{report.payroll.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[540px] text-left text-sm"><thead><tr className="border-b text-xs text-neutral-500"><th className="py-2 pr-3">Сотрудник</th><th className="py-2 pr-3">Время</th><th className="py-2 text-right">Начислено</th></tr></thead><tbody>{report.payroll.map((row) => <tr className="border-b last:border-0" key={row.staffId}><td className="py-3 pr-3">{row.name}</td><td className="py-3 pr-3 tabular-nums">{Math.floor(row.minutes / 60)} ч {row.minutes % 60} мин</td><td className="py-3 text-right tabular-nums">{money(row.wageMinor, report.currency)}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-sm text-neutral-500">Смен за выбранный период нет.</p>}</section>
      <p className="mt-3 text-xs text-neutral-500">Материальные расходы считаются по себестоимости на момент создания записи. Ставка берётся из снимка при открытии смены. Аренда, налоги и другие расходы, не внесённые в учёт материалов и смен, не включены.</p>
    </> : null}
  </main>;
}
