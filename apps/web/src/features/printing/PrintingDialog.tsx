import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function PrintingDialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
  const dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close()},[])
  return <dialog ref={dialog} aria-label={title} onCancel={event=>{event.preventDefault();onClose()}} className="m-auto max-h-[92dvh] w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-xl backdrop:bg-slate-900/50 dark:border-white/15 dark:bg-[#20212b] dark:text-white">
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-inherit p-4 dark:border-white/15"><h2 className="text-lg font-bold">{title}</h2><button type="button" autoFocus aria-label={`Close ${title}`} onClick={onClose} className="flex size-11 items-center justify-center rounded-xl focus-visible:outline focus-visible:outline-2"><X size={20}/></button></div>
    <div className="p-4 sm:p-6">{children}</div>
  </dialog>
}
