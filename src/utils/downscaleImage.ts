// A full-res phone camera photo (often 8-12MP, several MB) held entirely in
// memory as a base64 data: URL can crash/reload a mobile browser tab before
// an invoice upload finishes - silently losing the invoice (nothing was ever
// inserted). Downscaling before that conversion keeps memory use bounded.
const MAX_DIMENSION = 2500 // roughly what vision models read at "high-res" anyway - no OCR-relevant detail lost
const JPEG_QUALITY = 0.85

/**
 * Resizes an image file if it's larger than MAX_DIMENSION on its long edge,
 * and always re-encodes through createImageBitmap/canvas even when no
 * resize is needed. That round-trip bakes the image's EXIF orientation
 * (the "this should display rotated 90°" tag phone cameras write instead of
 * physically rotating pixels) into the actual pixel data and drops the EXIF
 * tag entirely - without it, a photo that previews upright in an <img> can
 * still reach OCR sideways, since not every consumer of the file honors
 * that tag the same way. Returns the original file unchanged (including
 * non-image files) if decoding fails.
 */
export async function downscaleImageFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  try {
    const bitmap = await createImageBitmap(file)
    try {
      const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
      const targetWidth = Math.round(bitmap.width * scale)
      const targetHeight = Math.round(bitmap.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = targetWidth
      canvas.height = targetHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return file
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight)

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
      if (!blob) return file
      return new File([blob], file.name, { type: 'image/jpeg' })
    } finally {
      bitmap.close()
    }
  } catch {
    // Decoding failed (unsupported format, etc.) - fall back to the original file rather than blocking the upload.
    return file
  }
}
