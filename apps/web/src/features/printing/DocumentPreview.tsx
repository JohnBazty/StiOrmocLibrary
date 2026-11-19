import { lazy, Suspense, useEffect, useState } from 'react'
import { PrintingDialog } from './PrintingDialog'
import { printingApi } from './printing-api'

const PdfPreview = lazy(() => import('../../components/PdfFilePreview'))

export function DocumentPreview({
  url,
  onClose,
  admin = false,
}: {
  url: string | null
  onClose: () => void
  admin?: boolean
}) {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setFile(null)
    setError('')
    if (url) {
      void printingApi
        .preview(url)
        .then(value => {
          if (active) setFile(value)
        })
        .catch(e => {
          if (active) setError(e instanceof Error ? e.message : 'Unable to load preview.')
        })
    }
    return () => {
      active = false
    }
  }, [url])

  if (!url) return null

  return (
    <PrintingDialog onClose={onClose} title="Document preview">
      <p className="mb-4 text-sm text-[var(--sl-text-secondary)]">
        {admin
          ? 'PDF copy used for page counting and printing.'
          : 'This is the PDF used for page counting and printing. Check the layout before submitting.'}
      </p>
      {error ? (
        <p role="alert" className="auth-error rounded-[8px] p-3 text-sm">
          {error}
        </p>
      ) : file ? (
        <Suspense fallback={<p role="status">Loading preview…</p>}>
          <PdfPreview file={file} />
        </Suspense>
      ) : (
        <p role="status" className="text-sm text-[var(--sl-text-secondary)]">
          Preparing preview…
        </p>
      )}
    </PrintingDialog>
  )
}
