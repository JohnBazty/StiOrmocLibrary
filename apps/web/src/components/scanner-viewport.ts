/** Keep the guide inside the actual video frame, including narrow mobile views. */
export function qrScanBox(width: number, height: number) {
  const edge = Math.max(1, Math.floor(Math.min(width, height) * 0.8))
  return { width: Math.min(440, edge), height: Math.min(440, edge) }
}

export function barcodeScanBox(width: number, height: number) {
  const boxWidth = Math.max(2, Math.min(width - 16, Math.min(1152, Math.floor(width * 0.92))))
  const boxHeight = Math.max(1, Math.min(height - 16, Math.min(boxWidth - 1, Math.min(420, Math.floor(height * 0.52)))))
  return {
    width: boxWidth,
    height: boxHeight,
  }
}
