import { useState } from 'react';
import { Badge, Button, Card, Checkbox, Dialog, EmptyState, ErrorState, Input, Pagination, Radio, Select, Skeleton, Table, Tabs, Textarea, Toast } from '@/components/ui';

export function UiSandbox() {
  const [dialogOpen, setDialogOpen] = useState(true);
  const [page, setPage] = useState(1);
  return <main className="mx-auto grid max-w-5xl gap-5 p-6"><h1 className="text-2xl font-semibold">UI kit</h1>
    <Card><Button type="button">Button</Button><Badge>Badge</Badge></Card>
    <label className="grid gap-2">Input<Input aria-label="Input"/></label><label className="grid gap-2">Textarea<Textarea aria-label="Textarea"/></label>
    <label className="grid gap-2">Select<Select aria-label="Select"><option>Опция</option></Select></label>
    <label className="flex items-center gap-2"><Checkbox aria-label="Checkbox"/>Checkbox</label><label className="flex items-center gap-2"><Radio aria-label="Radio" name="radio"/>Radio</label>
    <Table caption="Table" columns={[{key:'name',label:'Имя'}]} rows={[{name:'Тестовая строка'}]}/>
    <Tabs tabs={[{id:'one',label:'Вкладка',content:<p>Содержимое вкладки</p>}]} />
    <Pagination page={page} pages={3} onChange={setPage}/><Toast>Toast</Toast><Skeleton label="Skeleton" className="h-8"/>
    <EmptyState title="Empty state"/><ErrorState title="Error state"/><Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Dialog"><p>Диалоговое окно</p></Dialog>
  </main>;
}
