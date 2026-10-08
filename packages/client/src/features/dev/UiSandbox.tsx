import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

export function UiSandbox() {
  const [tab, setTab] = useState('one');
  return <main className="mx-auto grid max-w-5xl gap-5 p-6"><h1 className="text-2xl font-semibold">UI kit</h1>
    <Card><CardHeader><CardTitle>shadcn/ui primitives</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center gap-3"><Button type="button">Button</Button><Badge>Badge</Badge><Button type="button" variant="outline" onClick={() => toast.success('Уведомление отображается')}>Toast</Button></CardContent></Card>
    <Label className="grid gap-2">Input<Input aria-label="Input"/></Label><Label className="grid gap-2">Textarea<Textarea aria-label="Textarea"/></Label>
    <Label className="grid gap-2">Native Select<NativeSelect aria-label="Select"><option>Опция</option></NativeSelect></Label>
    <Label className="flex items-center gap-2"><Checkbox aria-label="Checkbox"/>Checkbox</Label>
    <RadioGroup value={tab} onValueChange={setTab} aria-label="Radio options"><Label className="flex items-center gap-2"><RadioGroupItem value="one"/>Option one</Label><Label className="flex items-center gap-2"><RadioGroupItem value="two"/>Option two</Label></RadioGroup>
    <Table><TableHeader><TableRow><TableHead>Имя</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Тестовая строка</TableCell></TableRow></TableBody></Table>
    <Tabs defaultValue="one"><TabsList><TabsTrigger value="one">Вкладка 1</TabsTrigger><TabsTrigger value="two">Вкладка 2</TabsTrigger></TabsList><TabsContent value="one"><p>Содержимое первой вкладки</p></TabsContent><TabsContent value="two"><p>Содержимое второй вкладки</p></TabsContent></Tabs>
    <Dialog><DialogTrigger asChild><Button variant="secondary">Open dialog</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Dialog</DialogTitle></DialogHeader><p>Диалоговое окно</p></DialogContent></Dialog>
    <Skeleton className="h-8 w-48" aria-label="Skeleton"/>
  </main>;
}
