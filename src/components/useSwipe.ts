import { useRef, type TouchEvent } from 'react'

export type SwipeDir = 'left' | 'right' | 'up' | 'down'

// A one-finger swipe (at least 60 px, within 800 ms) that starts on this element. Swipes that start
// on an input, or inside anything marked data-noswipe (a row that scrolls sideways), don't count.
export function useSwipe(onSwipe: (dir: SwipeDir) => void) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null)
  return {
    onTouchStart: (e: TouchEvent) => {
      const p = e.touches[0]
      const skip = e.touches.length !== 1 || !p || (e.target as Element).closest?.('[data-noswipe],input,textarea,select')
      start.current = skip ? null : { x: p.clientX, y: p.clientY, t: performance.now() }
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = start.current
      start.current = null
      const p = e.changedTouches[0]
      if (!s || !p || performance.now() - s.t > 800) return
      const dx = p.clientX - s.x
      const dy = p.clientY - s.y
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 60) return
      onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down')
    },
  }
}
