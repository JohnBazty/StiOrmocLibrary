import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DeskScanInput } from './DeskScanInput'
const decode = vi.hoisted(() => vi.fn(async () => 'sample-code'))
const {cameraStart,cameraStop}=vi.hoisted(()=>({cameraStart:vi.fn(async(..._args:unknown[])=>{}),cameraStop:vi.fn(async()=>{})}))
vi.mock('html5-qrcode', () => ({ Html5QrcodeSupportedFormats: { QR_CODE: 0 }, Html5Qrcode: class { isScanning = false; clear() {} scanFile = decode; async start(...args:unknown[]){this.isScanning=true;await cameraStart(...args)} async stop(){this.isScanning=false;await cameraStop()} } }))

beforeEach(()=>{
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(){this.setAttribute('open','')}})
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(){this.removeAttribute('open')}})
})
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('waits for image review before reading a code or looking up a borrower', async () => {
  const onScan = vi.fn()
  render(<DeskScanInput label="Borrower QR" value="" onChange={() => undefined} onScan={onScan} disabled={false} qr />)
  const input = screen.getByLabelText('Upload code image')
  fireEvent.change(input, { target: { files: [new File(['qr'], 'borrower.png', { type: 'image/png' })] } })
  expect(screen.getByText('borrower.png')).toBeTruthy()
  expect(decode).not.toHaveBeenCalled(); expect(onScan).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Read code from image' }))
  await waitFor(() => expect(onScan).toHaveBeenCalledWith('sample-code'))
  expect(decode).toHaveBeenCalledOnce()
})

it.each([true,false])('opens a large camera dialog with a fitting guide (QR=%s), then releases the camera',async qr=>{
 const onScan=vi.fn()
 render(<DeskScanInput label={qr?'Borrower QR':'Book barcode'} value="" onChange={()=>{}} onScan={onScan} disabled={false} qr={qr}/>)
 fireEvent.click(screen.getByRole('button',{name:'Scan with camera'}))
 const modal=await screen.findByRole('dialog',{name:qr?'Scan borrower QR':'Scan book barcode'})
 await waitFor(()=>expect(cameraStart).toHaveBeenCalledOnce())
 const config=cameraStart.mock.calls[0][1] as unknown as {qrbox:(width:number,height:number)=>{width:number;height:number};aspectRatio:number}
 expect(config.aspectRatio).toBe(4/3)
 const small=config.qrbox(240,180),large=config.qrbox(720,540)
 expect(small.width).toBeLessThan(240);expect(small.height).toBeLessThan(180)
 expect(large.width).toBeGreaterThan(qr?240:280)
 expect(modal.className).toContain('max-w-4xl')
 fireEvent.click(screen.getByRole('button',{name:'Close camera'}))
 await waitFor(()=>expect(cameraStop).toHaveBeenCalledOnce())
 expect(screen.queryByRole('dialog')).toBeNull()
 expect(onScan).not.toHaveBeenCalled()
})

it('closes on a successful scan and ignores repeated camera frames',async()=>{
 const onScan=vi.fn()
 render(<DeskScanInput label="Book barcode" value="" onChange={()=>{}} onScan={onScan} disabled={false}/>)
 fireEvent.click(screen.getByRole('button',{name:'Scan with camera'}))
 await waitFor(()=>expect(cameraStart).toHaveBeenCalledOnce())
 const decoded=cameraStart.mock.calls[0][2] as (value:string)=>void
 await act(async()=>{decoded('COPY-7');decoded('COPY-7')})
 await waitFor(()=>expect(onScan).toHaveBeenCalledOnce())
 expect(onScan).toHaveBeenCalledWith('COPY-7')
 expect(screen.queryByRole('dialog')).toBeNull()
 decoded('COPY-8')
 expect(onScan).toHaveBeenCalledOnce()
})
