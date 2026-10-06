import { Dialog as HeadlessDialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import type { ReactNode } from 'react';

export function Dialog({ open, title, children, onClose, footer }: { open: boolean; title: string; children: ReactNode; onClose: () => void; footer?: ReactNode }) {
  return <HeadlessDialog open={open} onClose={onClose} className="relative z-50">
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />
    <div className="fixed inset-0 grid place-items-center p-4">
      <DialogPanel className="dialog-enter max-h-[90vh] w-full max-w-[480px] overflow-hidden rounded-xl border border-neutral-200 bg-neutral-0 text-neutral-900 shadow-xl">
        <header className="flex h-12 items-center justify-between border-b border-neutral-200 px-5">
          <DialogTitle className="text-[15px] font-semibold">{title}</DialogTitle>
          <button aria-label="Закрыть диалог" className="grid size-8 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100" onClick={onClose} type="button"><FontAwesomeIcon className="size-4" icon={faXmark}/></button>
        </header>
        <div className="max-h-[calc(90vh-3rem)] overflow-y-auto p-5">{children}</div>
        {footer ? <footer className="flex min-h-14 items-center justify-end gap-2 border-t border-neutral-200 px-5 py-2">{footer}</footer> : null}
      </DialogPanel>
    </div>
  </HeadlessDialog>;
}
