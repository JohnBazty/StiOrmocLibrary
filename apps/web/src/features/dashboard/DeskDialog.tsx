import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../components/ui'

export function DeskDialog({title,busy=false,onClose,children}:{title:string;busy?:boolean;onClose:()=>void;children:ReactNode}){
 const element=useRef<HTMLDialogElement>(null),id=useId()
 useEffect(()=>{const dialog=element.current;dialog?.showModal();return()=>dialog?.close()},[])
 return <dialog ref={element} aria-labelledby={id} onCancel={event=>{event.preventDefault();if(!busy)onClose()}} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-[#0b5ea2]/15 bg-white p-0 text-[#0b5ea2] shadow-xl backdrop:bg-black/60 dark:bg-[#20212b] dark:text-white"><header className="flex items-center justify-between gap-3 border-b border-current/15 p-5"><h2 id={id} className="text-balance text-xl font-bold">{title}</h2><Button variant="ghost" disabled={busy} aria-label={'Close '+title} onClick={onClose}><X size={20}/></Button></header><div className="space-y-4 p-5">{children}</div></dialog>
}
