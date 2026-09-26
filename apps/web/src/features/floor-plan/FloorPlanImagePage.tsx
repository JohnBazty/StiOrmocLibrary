import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ImageUp, MapPin } from 'lucide-react'
import { PageHeader, SectionCard } from '../../components/ui'
import { getAccessToken, getCurrentIdentity } from '../auth/auth-storage'

type FloorImage = { imageUrl: string | null; originalName: string; uploadedAt: string; uploadedBy: string } | null
type Location = { title: string; shelfLabel: string; accession: string; callNumber: string | null } | null

async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  const token = getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(url, { ...options, headers, credentials: 'include' })
  const payload = await response.json() as { data?: T; message?: string }
  if (!response.ok) throw new Error(payload.message ?? 'The floor plan could not be loaded.')
  return payload.data as T
}

export function FloorPlanImagePage() {
  const [params] = useSearchParams()
  const isAdmin = getCurrentIdentity()?.role === 'Admin'
  const [image, setImage] = useState<FloorImage>(null)
  const [location, setLocation] = useState<Location>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const titleId = params.get('titleId')
  const copyId = params.get('copyId')
  const barcode = params.get('barcode')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const query = new URLSearchParams()
      if (titleId) query.set('titleId', titleId)
      if (copyId) query.set('copyId', copyId)
      if (barcode) query.set('barcode', barcode)
      const [nextImage, nextLocation] = await Promise.all([
        api<FloorImage>('/api/v1/floor-plan/image'),
        titleId ? api<Location>(`/api/v1/floor-plan/location?${query}`) : Promise.resolve(null),
      ])
      setImage(nextImage); setLocation(nextLocation); setMessage(null)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Floor plan unavailable.') }
    finally { setLoading(false) }
  }, [titleId, copyId, barcode])

  useEffect(() => { void load() }, [load])

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) {
      setMessage('Choose a PNG, JPEG, or WebP image up to 4 MB.'); return
    }
    setUploading(true)
    try {
      const body = new FormData(); body.set('image', file)
      const next = await api<FloorImage>('/api/v1/floor-plan/image', { method: 'POST', body })
      setImage(next); setMessage('Floor plan image published. Everyone can now view it.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Image upload failed.') }
    finally { setUploading(false); event.target.value = '' }
  }

  return <>
    <PageHeader eyebrow="Library guide" title="Library floor plan" description="View the library image and use the shelf label to find a book." />
    {message ? <p role="alert" className="mb-4 rounded-xl bg-[#FFF200] px-4 py-3 text-sm font-semibold text-[#003399]">{message}</p> : null}
    {titleId ? <SectionCard className="mb-5 p-5"><div className="flex items-start gap-3"><MapPin className="shrink-0 text-[#003399]" /><div><h2 className="font-bold text-[#003399]">{location?.title ?? 'Book location'}</h2><p className="mt-1 text-lg font-black text-[#003399]">Shelf: {loading ? 'Loading…' : location?.shelfLabel || 'Location not recorded'}</p>{location?.accession ? <p className="text-sm text-[#003399]/70">Accession {location.accession}{location.callNumber ? ` · Call number ${location.callNumber}` : ''}</p> : null}</div></div></SectionCard> : null}
    {isAdmin ? <SectionCard className="mb-5 p-5"><h2 className="font-bold text-[#003399]">Publish a floor plan image</h2><p className="mt-1 text-sm text-[#003399]/70">Upload a PNG, JPEG, or WebP image up to 4 MB. The previous image remains in storage history.</p><label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#003399] px-4 py-2.5 text-sm font-bold text-white"><ImageUp size={18} />{uploading ? 'Uploading…' : 'Choose image'}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={uploading} onChange={(event) => void upload(event)} /></label></SectionCard> : null}
    <SectionCard className="overflow-hidden p-5">{loading ? <p className="text-[#003399]">Loading floor plan…</p> : image?.imageUrl ? <><img src={image.imageUrl} alt="Current library floor plan" className="mx-auto max-h-[75vh] w-auto max-w-full rounded-xl border border-[#003399]/15 object-contain" /><p className="mt-4 text-center text-xs text-[#003399]/65">Uploaded {new Date(image.uploadedAt).toLocaleString()} by {image.uploadedBy}</p></> : <p className="py-12 text-center font-semibold text-[#003399]">Floor plan image not available yet.</p>}</SectionCard>
  </>
}
