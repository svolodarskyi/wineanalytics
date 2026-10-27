export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'))
    reader.readAsDataURL(file)
  })
}

/** Re-encodes an already-loaded URL (e.g. a signed Storage URL) as a `data:` URL, so a kept-as-is photo can round-trip through the same "always a data: URL" contract as a freshly picked file. */
export async function urlToDataUrl(url: string): Promise<string> {
  const response = await fetch(url)
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image.'))
    reader.readAsDataURL(blob)
  })
}

/** Ensures every entry is a `data:` URL before it's sent to create/update - anything not already one (a signed URL for a photo the user kept unchanged) gets re-encoded. */
export function normalizeImagesForSave(urls: string[]): Promise<string[]> {
  return Promise.all(urls.map((url) => (url.startsWith('data:') ? url : urlToDataUrl(url))))
}
