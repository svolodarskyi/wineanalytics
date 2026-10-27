import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { downscaleImageFile } from '../utils/downscaleImage'
import { readFileAsDataUrl } from '../utils/readFileAsDataUrl'

interface FileDropzoneProps {
  onFileSelected: (file: { fileName: string; fileType: 'image' | 'pdf'; fileDataUrl: string }) => void
  disabled?: boolean
  /** Opens the file picker immediately on mount - for the "Add Invoice" shortcut, which should land straight in the picker instead of requiring an extra tap. */
  autoOpen?: boolean
}

export function FileDropzone({ onFileSelected, disabled, autoOpen }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  // Only ever fires once, on mount - reopening on every re-render would fight the user closing the native picker.
  useEffect(() => {
    if (autoOpen && !disabled) inputRef.current?.click()
  }, [])

  async function handleFile(file: File) {
    setError(null)
    const fileType = file.type === 'application/pdf' ? 'pdf' : 'image'
    if (fileType === 'image' && !file.type.startsWith('image/')) {
      setError('Upload an image or PDF invoice.')
      return
    }
    try {
      const fileToRead = fileType === 'image' ? await downscaleImageFile(file) : file
      const fileDataUrl = await readFileAsDataUrl(fileToRead)
      onFileSelected({ fileName: file.name, fileType, fileDataUrl })
    } catch (err) {
      console.error(`Could not read file "${file.name}":`, err)
      setError('Could not read that file. Please try again.')
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      console.warn('File input change fired with no file.')
      return
    }
    void handleFile(file)
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
