import { useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'

const MIN_SCALE = 1
const MAX_SCALE = 4

interface Point {
  x: number
  y: number
}

function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

/**
 * An image that zooms/pans on pinch (mobile), wheel (desktop), or
 * double-click/tap - entirely with its own transform, not the browser's
 * native pinch-to-zoom. `touch-action: none` on the container is what stops
 * that native gesture from also zooming the whole page underneath it.
 */
export function ZoomableImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const pointers = useRef(new Map<number, Point>())
  const lastPinchDistance = useRef<number | null>(null)
  const lastPanPoint = useRef<Point | null>(null)
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState<Point>({ x: 0, y: 0 })

  function resetIfNotZoomed(nextScale: number) {
    if (nextScale <= MIN_SCALE) setTranslate({ x: 0, y: 0 })
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 1) {
      lastPanPoint.current = { x: event.clientX, y: event.clientY }
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values())
      const distance = distanceBetween(a, b)
      if (lastPinchDistance.current !== null) {
        const factor = distance / lastPinchDistance.current
        setScale((current) => {
          const next = clampScale(current * factor)
          resetIfNotZoomed(next)
          return next
        })
      }
      lastPinchDistance.current = distance
    } else if (pointers.current.size === 1 && scale > MIN_SCALE && lastPanPoint.current) {
      const dx = event.clientX - lastPanPoint.current.x
      const dy = event.clientY - lastPanPoint.current.y
      setTranslate((current) => ({ x: current.x + dx, y: current.y + dy }))
      lastPanPoint.current = { x: event.clientX, y: event.clientY }
    }
  }

  function endPointer(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) lastPinchDistance.current = null
    lastPanPoint.current = pointers.current.size === 1 ? Array.from(pointers.current.values())[0] : null
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault()
    const delta = -event.deltaY * 0.002
    setScale((current) => {
      const next = clampScale(current + delta * current)
      resetIfNotZoomed(next)
      return next
    })
  }

  function handleDoubleClick() {
    setScale((current) => {
      const next = current > MIN_SCALE ? MIN_SCALE : 2.5
      resetIfNotZoomed(next)
      return next
    })
  }

  return (
    <div
      className="zoomable-image"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
    >
      <img
        src={src}
        alt={alt}
        className={className}
        draggable={false}
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          cursor: scale > MIN_SCALE ? 'grab' : 'zoom-in',
        }}
      />
    </div>
  )
}
