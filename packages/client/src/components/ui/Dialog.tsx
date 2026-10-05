import { Dialog as HeadlessDialog, DialogPanel, DialogTitle } from '@headlessui/react';
import type { ReactNode } from 'react';

export function Dialog({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  return <HeadlessDialog open={open} onClose={onClose} className="relative z-50">
    <div className="fixed inset-0 bg-neutral-900/50" aria-hidden="true" />
    <div className="fixed inset-0 grid place-items-center p-4">
      <DialogPanel className="w-full max-w-lg rounded-2xl bg-neutral-0 p-6 shadow-lg">
        <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
        <div className="mt-4">{children}</div>
        <button className="mt-6 rounded-lg px-3 py-2 focus-visible:outline" onClick={onClose} type="button">Закрыть</button>
      </DialogPanel>
    </div>
  </HeadlessDialog>;
}
