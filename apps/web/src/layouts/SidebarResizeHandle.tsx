import { useEffect, useRef, useState } from 'react'
import { cn } from '../components/ui'
import { SIDEBAR_KEYBOARD_STEP, clampSidebarWidth } from './workspace-layout-prefs'

type SidebarResizeHandleProps = {
  side: 'left' | 'right'
  label: string
  width: number
  minWidth: number
  maxWidth: number
  defaultWidth: number
  collapseThreshold: number
  onResize: (nextWidth: number) => void
  onCollapse: () => void
  onResizingChange?: (active: boolean) => void
  className?: string
}

export function SidebarResizeHandle({
  side,
  label,
  width,
  minWidth,
  maxWidth,
  defaultWidth,
  collapseThreshold,
  onResize,
  onCollapse,
  onResizingChange,
  className,
}: SidebarResizeHandleProps) {
  const [dragging, setDragging] = useState(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => () => {
    cleanupRef.current?.()
  }, [])

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    if (!Number.isFinite(event.clientX)) return
    event.preventDefault()

    const startX = event.clientX
    const startWidth = width
    let pendingCollapse = false

    setDragging(true)
    onResizingChange?.(true)
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMove = (moveEvent: PointerEvent) => {
      if (!Number.isFinite(moveEvent.clientX)) return
      const delta = moveEvent.clientX - startX
      const rawWidth = side === 'left' ? startWidth + delta : startWidth - delta
      if (rawWidth < collapseThreshold) {
        pendingCollapse = true
        return
      }
      pendingCollapse = false
      onResize(clampSidebarWidth(rawWidth, minWidth, maxWidth))
    }

    const finish = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      cleanupRef.current = null
      setDragging(false)
      onResizingChange?.(false)
      if (pendingCollapse) {
        onResize(startWidth)
        onCollapse()
      }
    }

    cleanupRef.current = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      onResizingChange?.(false)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const growKey = side === 'left' ? 'ArrowRight' : 'ArrowLeft'
    const shrinkKey = side === 'left' ? 'ArrowLeft' : 'ArrowRight'

    if (event.key === growKey) {
      event.preventDefault()
      onResize(clampSidebarWidth(width + SIDEBAR_KEYBOARD_STEP, minWidth, maxWidth))
    } else if (event.key === shrinkKey) {
      event.preventDefault()
      onResize(clampSidebarWidth(width - SIDEBAR_KEYBOARD_STEP, minWidth, maxWidth))
    } else if (event.key === 'Home') {
      event.preventDefault()
      onResize(minWidth)
    } else if (event.key === 'End') {
      event.preventDefault()
      onResize(maxWidth)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onResize(defaultWidth)
    }
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={width}
      title="Drag to resize · Double-click to reset width"
      onPointerDown={startDrag}
      onDoubleClick={() => onResize(defaultWidth)}
      onKeyDown={handleKeyDown}
      className={cn(
        'group absolute inset-y-0 z-20 flex w-3 cursor-col-resize touch-none select-none items-center justify-center focus-visible:outline-none',
        side === 'left' ? '-right-1.5' : '-left-1.5',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'h-full w-[2px] transition-colors',
          dragging
            ? 'bg-[#0b5ea2] dark:bg-[#FFF200]'
            : 'bg-transparent group-hover:bg-[#0b5ea2]/80 group-focus-visible:bg-[#0b5ea2] dark:group-hover:bg-[#FFF200]/80 dark:group-focus-visible:bg-[#FFF200]',
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute h-10 w-1.5 rounded-full transition-opacity',
          dragging
            ? 'bg-[#0b5ea2] opacity-100 dark:bg-[#FFF200]'
            : 'bg-[#0b5ea2]/85 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 dark:bg-[#FFF200]',
        )}
      />
    </div>
  )
}
