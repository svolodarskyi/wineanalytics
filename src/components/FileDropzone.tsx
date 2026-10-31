import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { downscaleImageFile } from '../utils/downscaleImage'
import { readFileAsDataUrl } from '../utils/readFileAsDataUrl'
import { rotateImageFile } from '../utils/rotateImage'
import { Modal } from './Modal'

interface FileDropzoneProps {
  onFileSelected: (file: { fileName: string; fileType: 'image' | 'pdf'; fileDataUrl: string }) => void
  disabled?: boolean
  /** Opens the file picker immediately on mount - for the "Add Invoice" shortcut, which should land straight in the picker instead of requiring an extra tap. */
  autoOpen?: boolean
}

interface PendingPhoto {
  file: File
  previewUrl: string
}

export function FileDropzone({ onFileSelected, disabled, autoOpen }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  // Photos only - a quick "does this need straightening before it's added?"
  // check. PDFs skip straight through below since rotation doesn't apply.
  const [pending, setPending] = useState<PendingPhoto | null>(null)
  const [isRotating, setIsRotating] = useState(false)

  // Only ever fires once, on mount - reopening on every re-render would fight the user closing the native picker.
  useEffect(() => {
    if (autoOpen && !disabled) inputRef.current?.click()
  }, [])

  function openPreview(file: File) {
    setPending({ file, previewUrl: URL.createObjectURL(file) })
  }

  function closePreview() {
    if (pending) URL.revokeObjectURL(pending.previewUrl)
    setPending(null)
  }

  async function handleRotate() {
    if (!pending) return
    setError(null)
    setIsRotating(true)
    try {
      const rotated = await rotateImageFile(pending.file, 90)
      URL.revokeObjectURL(pending.previewUrl)
      setPending({ file: rotated, previewUrl: URL.createObjectURL(rotated) })
    } catch (err) {
      console.error('Could not rotate photo:', err)
      setError('Could not rotate that photo. Please try again.')
    } finally {
      setIsRotating(false)
    }
  }

  // Closes the modal immediately rather than waiting on downscaleImageFile -
  // on a full-res phone photo that re-encode can take a few seconds, and
  // making the user stare at a frozen "Adding..." button for it reads as a
  // hang. The rest of the app already treats this as background work (see
  // the upload queue in InvoicesPage), so finish it the same way here.
  function handleConfirm() {
    if (!pending) return
    const file = pending.file
    setError(null)
    closePreview()
    void finishAddingPhoto(file)
  }

  async function finishAddingPhoto(file: File) {
    try {
      const fileToRead = await downscaleImageFile(file)
      const fileDataUrl = await readFileAsDataUrl(fileToRead)
      onFileSelected({ fileName: file.name, fileType: 'image', fileDataUrl })
    } catch (err) {
      console.error(`Could not read file "${file.name}":`, err)
      setError('Could not read that file. Please try again.')
    }
  }

  async function handleFile(file: File) {
    setError(null)
    const fileType = file.type === 'application/pdf' ? 'pdf' : 'image'
    if (fileType === 'image' && !file.type.startsWith('image/')) {
      setError('Upload an image or PDF invoice.')
      return
    }
    if (fileType === 'pdf') {
      try {
        const fileDataUrl = await readFileAsDataUrl(file)
        onFileSelected({ fileName: file.name, fileType, fileDataUrl })
      } catch (err) {
        console.error(`Could not read file "${file.name}":`, err)
        setError('Could not read that file. Please try again.')
      }
      return
    }
    openPreview(file)
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

      {pending && (
        <Modal title="Review photo" onClose={closePreview} size="large">
          <div className="stack">
            <img src={pending.previewUrl} alt="Invoice preview" style={{ maxWidth: '100%', borderRadius: 8 }} />
            <div className="picker" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn" disabled={isRotating} onClick={handleRotate}>
                {isRotating ? 'Rotating...' : 'Rotate 90°'}
              </button>
              <button type="button" className="btn" onClick={closePreview}>
                Cancel
              </button>
              <button type="button" className="btn btn--primary" disabled={isRotating} onClick={handleConfirm}>
                Add invoice
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
