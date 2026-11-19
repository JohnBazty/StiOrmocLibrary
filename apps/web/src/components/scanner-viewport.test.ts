import { expect, it } from 'vitest'
import { barcodeScanBox, qrScanBox } from './scanner-viewport'

it.each([[240,180],[320,240],[720,540],[900,320]])('fits both scan guides within a %i × %i camera view', (width,height)=>{
 for(const box of [qrScanBox(width,height),barcodeScanBox(width,height)]){
  expect(box.width).toBeGreaterThan(0)
  expect(box.height).toBeGreaterThan(0)
  expect(box.width).toBeLessThan(width)
  expect(box.height).toBeLessThan(height)
  expect(Number.isInteger(box.width)&&Number.isInteger(box.height)).toBe(true)
 }
 expect(qrScanBox(width,height).width).toBe(qrScanBox(width,height).height)
 expect(barcodeScanBox(width,height).width).toBeGreaterThan(barcodeScanBox(width,height).height)
})
it('uses more of a large camera view while retaining space around the code',()=>{
 expect(qrScanBox(720,540).width).toBeGreaterThan(240)
 expect(barcodeScanBox(720,540).width).toBeGreaterThan(280)
 expect(barcodeScanBox(720,540).height).toBeGreaterThan(110)
})
