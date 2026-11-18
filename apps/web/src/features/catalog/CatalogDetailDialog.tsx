import { useEffect, useRef, type ReactNode } from 'react'

/** Use the same native modal behavior as account access: inert background and trapped focus. */
export function CatalogDetailDialog({onClose,children}:{onClose:()=>void;children:ReactNode}) {
  const dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{
    const modal=dialog.current
    const previousFocus=document.activeElement as HTMLElement|null
    const previousOverflow=document.body.style.overflow
    document.body.style.overflow='hidden'
    modal?.showModal()
    return ()=>{
      modal?.close()
      document.body.style.overflow=previousOverflow
      if(previousFocus?.isConnected)previousFocus.focus()
    }
  },[])
  return <dialog ref={dialog} aria-labelledby="public-book-title"
    className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-2xl overflow-y-auto border-0 bg-white p-6 text-[#003399] backdrop:bg-[#003399]/50 dark:bg-[#001a4d] dark:text-white"
    onCancel={event=>{event.preventDefault();onClose()}}
    onClick={event=>{
      if(event.target!==event.currentTarget)return
      const bounds=event.currentTarget.getBoundingClientRect()
      if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)onClose()
    }}>{children}</dialog>
}
