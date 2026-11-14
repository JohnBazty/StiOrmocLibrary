import type { Html5Qrcode } from 'html5-qrcode'

export async function readAttendanceQrImage(reader: Pick<Html5Qrcode, 'scanFile'>, file: File): Promise<string> {
  const unreadable = () => new Error('Unable to read this QR image. Choose the original downloaded library pass or try the camera.')
  try {
    return await reader.scanFile(file, true)
  } catch {
    // ZXing can miss valid finder patterns in one orientation; retry lossless quarter turns.
  }

  let bitmap: ImageBitmap | undefined
  try {
    bitmap = await createImageBitmap(file)
    for (const quarterTurns of [1, 2, 3]) {
      const canvas = document.createElement('canvas')
      canvas.width = quarterTurns % 2 ? bitmap.height : bitmap.width
      canvas.height = quarterTurns % 2 ? bitmap.width : bitmap.height
      const context = canvas.getContext('2d')
      if (!context) throw unreadable()
      context.translate(canvas.width / 2, canvas.height / 2)
      context.rotate(quarterTurns * Math.PI / 2)
      context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2)
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(value => value ? resolve(value) : reject(unreadable()), 'image/png')
      })
      try {
        return await reader.scanFile(new File([blob], file.name, { type: 'image/png' }), true)
      } catch {
        // Try the next orientation before declaring the image unreadable.
      }
    }
  } catch {
    throw unreadable()
  } finally {
    bitmap?.close()
  }
  throw unreadable()
}
