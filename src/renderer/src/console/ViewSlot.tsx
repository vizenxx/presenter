import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { PreviewRect } from '../../../shared/types'

/** Fits a box with the projector's aspect ratio into the free space; children fill the box. */
export function AspectBox(props: { aspect: number; slotRef?: RefObject<HTMLDivElement | null>; className?: string; children: ReactNode }) {
  const { aspect, slotRef, className = '', children } = props
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const fit = (): void => {
      const r = el.getBoundingClientRect()
      const width = Math.floor(Math.min(r.width, r.height * aspect))
      setSize((s) => (s.width === width ? s : { width, height: Math.floor(width / aspect) }))
    }
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    fit()
    return () => ro.disconnect()
  }, [aspect])

  return (
    <div ref={box} className="flex min-h-0 flex-1 items-center justify-center">
      <div ref={slotRef} style={{ width: size.width, height: size.height }} className={`relative overflow-hidden rounded-lg bg-black ${className}`}>
        {children}
      </div>
    </div>
  )
}

/**
 * Reserves a box with the projector's aspect ratio. The main process lays a live
 * deck view exactly over it (native views always draw above the page), so the
 * slot reports null while something must show on top of it, e.g. an open menu.
 */
export function ViewSlot(props: { aspect: number; suspended: boolean; onRect: (rect: PreviewRect | null) => void; children: ReactNode }) {
  const { aspect, suspended, onRect, children } = props
  const slot = useRef<HTMLDivElement>(null)
  const suspendedRef = useRef(suspended)
  suspendedRef.current = suspended

  const report = (): void => {
    const el = slot.current
    if (!el || suspendedRef.current || el.clientWidth < 40) {
      onRect(null)
      return
    }
    const r = el.getBoundingClientRect()
    onRect({ x: r.x, y: r.y, width: r.width, height: r.height })
  }

  // Every render (the slot may have moved) and every size change of the slot itself.
  useLayoutEffect(report)
  useLayoutEffect(() => {
    const el = slot.current
    if (!el) return
    const ro = new ResizeObserver(() => report())
    ro.observe(el)
    return () => {
      ro.disconnect()
      onRect(null)
    }
    // report reads refs, so the observer is set up once per onRect.
  }, [onRect])

  return (
    <AspectBox aspect={aspect} slotRef={slot} className="grid place-items-center text-sm text-muted">
      {children}
    </AspectBox>
  )
}
