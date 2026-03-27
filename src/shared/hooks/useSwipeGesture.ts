import { useEffect, useRef } from 'react'

interface UseSwipeGestureOptions {
  onSwipeRight?: () => void
  onSwipeLeft?: () => void
  edgeWidth?: number    // px from left edge to detect "open" swipe start (default: 20)
  threshold?: number    // min px distance to count as swipe (default: 50)
  isOpen?: boolean      // whether the target (sidebar) is currently open
}

export function useSwipeGesture({
  onSwipeRight,
  onSwipeLeft,
  edgeWidth = 20,
  threshold = 50,
  isOpen = false,
}: UseSwipeGestureOptions) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const isTrackingRef = useRef(false)

  useEffect(() => {
    function handleTouchStart(e: TouchEvent) {
      const touch = e.touches[0]
      if (!touch) return

      // Only track if: sidebar is open (can swipe left to close)
      // OR touch starts near left edge (can swipe right to open)
      if (isOpen || touch.clientX <= edgeWidth) {
        touchStartRef.current = { x: touch.clientX, y: touch.clientY }
        isTrackingRef.current = true
      }
    }

    function handleTouchEnd(e: TouchEvent) {
      if (!isTrackingRef.current || !touchStartRef.current) return

      const touch = e.changedTouches[0]
      if (!touch) return

      const deltaX = touch.clientX - touchStartRef.current.x
      const deltaY = touch.clientY - touchStartRef.current.y

      // Reset tracking
      touchStartRef.current = null
      isTrackingRef.current = false

      // Ignore if mostly vertical (scrolling)
      if (Math.abs(deltaY) > Math.abs(deltaX)) return

      // Check threshold
      if (Math.abs(deltaX) < threshold) return

      if (deltaX > 0 && onSwipeRight) {
        onSwipeRight()   // Swipe right → open sidebar
      } else if (deltaX < 0 && onSwipeLeft) {
        onSwipeLeft()    // Swipe left → close sidebar
      }
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isOpen, edgeWidth, threshold, onSwipeRight, onSwipeLeft])
}
