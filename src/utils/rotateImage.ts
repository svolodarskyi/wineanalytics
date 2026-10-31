/**
 * Rotates an image file by a multiple of 90 degrees, clockwise. Like
 * downscaleImageFile, decodes via createImageBitmap (which applies any
 * existing EXIF orientation) and redraws to canvas, so the result needs no
 * EXIF tag of its own - what you see in the preview is exactly what gets
 * uploaded.
 */
export async function rotateImageFile(file: File, degrees: 90 | 180 | 270): Promise<File> {
  const bitmap = await createImageBitmap(file)
  try {
    const swapped = degrees === 90 || degrees === 270
    const canvas = document.createElement('canvas')
    canvas.width = swapped ? bitmap.height : bitmap.width
    canvas.height = swapped ? bitmap.width : bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not supported in this browser.')
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((degrees * Math.PI) / 180)
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) throw new Error('Could not export the rotated photo.')
    return new File([blob], file.name, { type: 'image/jpeg' })
  } finally {
    bitmap.close()
  }
}
