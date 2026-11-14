import { afterEach, expect, it, vi } from 'vitest'
import { readAttendanceQrImage } from './read-attendance-qr-image'

afterEach(() => vi.unstubAllGlobals())

function imageCanvas() {
  const bitmap = { width: 768, height: 768, close: vi.fn() }
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
  const context = { translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn() }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['rotated'], { type: 'image/png' })))
  return { bitmap, context }
}

it('reads a supported image directly without transforming it', async () => {
  const bitmap = vi.fn()
  vi.stubGlobal('createImageBitmap', bitmap)
  const file = new File(['qr'], 'pass.png', { type: 'image/png' })
  const reader = { scanFile: vi.fn().mockResolvedValue('test-pass') }
  await expect(readAttendanceQrImage(reader, file)).resolves.toBe('test-pass')
  expect(reader.scanFile).toHaveBeenCalledExactlyOnceWith(file, true)
  expect(bitmap).not.toHaveBeenCalled()
})

it('retries a valid QR in other orientations when its finder pattern is missed', async () => {
  const { bitmap, context } = imageCanvas()
  const reader = { scanFile: vi.fn().mockRejectedValueOnce(new Error('No MultiFormat Readers were able to detect the code.')).mockRejectedValueOnce(new Error('Unreadable orientation')).mockResolvedValue('test-pass') }
  const file = new File(['qr'], 'pass.png', { type: 'image/png' })
  await expect(readAttendanceQrImage(reader, file)).resolves.toBe('test-pass')
  expect(reader.scanFile).toHaveBeenCalledTimes(3)
  expect(context.rotate.mock.calls.map(([angle]) => angle)).toEqual([Math.PI / 2, Math.PI])
  expect(context.drawImage).toHaveBeenCalledWith(bitmap, -384, -384)
  expect(reader.scanFile.mock.calls[1][0]).toBeInstanceOf(File)
  expect(bitmap.close).toHaveBeenCalledOnce()
})

it('tries every quarter turn and reports a readable failure for an unreadable image', async () => {
  const { bitmap, context } = imageCanvas()
  const reader = { scanFile: vi.fn().mockRejectedValue('No MultiFormat Readers were able to detect the code.') }
  await expect(readAttendanceQrImage(reader, new File(['bad'], 'bad.png'))).rejects.toThrow('Unable to read this QR image. Choose the original downloaded library pass or try the camera.')
  expect(reader.scanFile).toHaveBeenCalledTimes(4)
  expect(context.rotate.mock.calls.map(([angle]) => angle)).toEqual([Math.PI / 2, Math.PI, 3 * Math.PI / 2])
  expect(bitmap.close).toHaveBeenCalledOnce()
})

it('releases the bitmap if image conversion fails', async () => {
  const { bitmap } = imageCanvas()
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(null))
  const reader = { scanFile: vi.fn().mockRejectedValue(new Error('Unreadable')) }
  await expect(readAttendanceQrImage(reader, new File(['bad'], 'bad.png'))).rejects.toThrow('Unable to read this QR image.')
  expect(bitmap.close).toHaveBeenCalledOnce()
})
