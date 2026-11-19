/** Keep the guide inside the actual video frame, including narrow mobile views. */
export function qrScanBox(width: number, height: number) {
  const edge = Math.max(1, Math.floor(Math.min(width, height) * 0.8))
  return { width: Math.min(440, edge), height: Math.min(440, edge) }
}

export function barcodeScanBox(width: number, height: number) {
  return {
    width: Math.max(1, Math.min(640, Math.floor(width * 0.9))),
    height: Math.max(1, Math.min(240, Math.floor(height * 0.4))),
  }
}
