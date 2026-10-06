import { Dialog as HeadlessDialog, DialogPanel, DialogTitle } from '@headlessui/react';
import type { ReactNode } from 'react';

export function Dialog({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  return <HeadlessDialog open={open} onClose={onClose} className="relative z-50">
    <div className="fixed inset-0 bg-neutral-900/40" aria-hidden="true" />
    <div className="fixed inset-0 grid place-items-center p-4">
      <DialogPanel className="dialog-enter w-full max-w-[520px] rounded-xl border border-neutral-200 bg-neutral-0 p-6 shadow-lg">
        <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
        <div className="mt-4">{children}</div>
        <button className="mt-6 inline-flex h-9 items-center rounded-md border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-100" onClick={onClose} type="button">Закрыть</button>
      </DialogPanel>
    </div>
  </HeadlessDialog>;
}
