import { useRef, useState, type ChangeEvent } from 'react'
import { readFileAsDataUrl } from '../utils/readFileAsDataUrl'

interface FileDropzoneProps {
  onFileSelected: (file: { fileName: string; fileType: 'image' | 'pdf'; fileDataUrl: string }) => void
  disabled?: boolean
}

export function FileDropzone({ onFileSelected, disabled }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setError(null)
    const fileType = file.type === 'application/pdf' ? 'pdf' : 'image'
    if (fileType === 'image' && !file.type.startsWith('image/')) {
      setError('Upload an image or PDF invoice.')
      return
    }
    try {
      const fileDataUrl = await readFileAsDataUrl(file)
      onFileSelected({ fileName: file.name, fileType, fileDataUrl })
    } catch {
      setError('Could not read that file. Please try again.')
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void handleFile(file)
  }

  return (
    <div className="stack">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={handleChange}
        disabled={disabled}
        aria-label="Upload invoice"
        style={{ display: 'none' }}
      />
      <button type="button" className="btn btn--primary" onClick={() => inputRef.current?.click()} disabled={disabled}>
        Upload invoice
      </button>
      {error && <p className="notice notice--error">{error}</p>}
    </div>
  )
}
