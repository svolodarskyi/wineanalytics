import { useEffect, useRef, type ReactNode } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  /** "large" is meant for content like a document preview that needs more room than a form. */
  size?: 'default' | 'large'
}

export function Modal({ title, onClose, children, size = 'default' }: ModalProps) {
  const titleRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Focus the title, not the first field, on open - a form's first input
  // grabbing focus pops the on-screen keyboard immediately on mobile, before
  // the user has even seen what they're filling in.
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={size === 'large' ? 'modal modal--large' : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <h2 ref={titleRef} tabIndex={-1}>
            {title}
          </h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label={`Close ${title}`}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
