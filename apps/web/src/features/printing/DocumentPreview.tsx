import { lazy, Suspense, useEffect, useState } from 'react'
import { PrintingDialog } from './PrintingDialog'
import { printingApi } from './printing-api'

const PdfPreview=lazy(()=>import('../../components/PdfFilePreview'))

export function DocumentPreview({url,onClose}:{url:string|null;onClose:()=>void}) {
  const [file,setFile]=useState<File|null>(null),[error,setError]=useState('')
  useEffect(()=>{let active=true;setFile(null);setError('');if(url)void printingApi.preview(url).then(value=>{if(active)setFile(value)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[url])
  if(!url)return null
  return <PrintingDialog onClose={onClose} title="Document preview">
    <p className="mb-4 text-sm opacity-75">This is the PDF used for page counting and printing. Check the layout before submitting.</p>
    {error?<p role="alert">{error}</p>:file?<Suspense fallback={<p role="status">Loading preview…</p>}><PdfPreview file={file}/></Suspense>:<p role="status">Preparing preview…</p>}
  </PrintingDialog>
}
