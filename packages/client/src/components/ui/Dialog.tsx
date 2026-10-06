import { Dialog as HeadlessDialog, DialogPanel, DialogTitle } from '@headlessui/react';
import type { ReactNode } from 'react';

export function Dialog({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  return <HeadlessDialog open={open} onClose={onClose} className="relative z-50">
    <div className="fixed inset-0 bg-neutral-900/45 backdrop-blur-sm" aria-hidden="true" />
    <div className="fixed inset-0 grid place-items-center p-4">
      <DialogPanel className="dialog-enter w-full max-w-lg rounded-clay-card border border-white/80 bg-clay-raised p-6 shadow-clay">
        <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
        <div className="mt-4">{children}</div>
        <button className="mt-6 rounded-clay-control bg-clay px-3 py-2 shadow-clay focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600" onClick={onClose} type="button">Закрыть</button>
      </DialogPanel>
    </div>
  </HeadlessDialog>;
}
