import { useState, useEffect, useRef } from 'react'

export function useCountUp(target: number, duration = 900, decimals = 0): string {
  const [display, setDisplay] = useState(0)
  const prev = useRef(0)
  const raf = useRef<number>(0)

  useEffect(() => {
    const start = prev.current
    const diff = target - start
    if (diff === 0) return

    const startTime = performance.now()

    const tick = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = start + diff * eased
      setDisplay(current)
      if (progress < 1) {
        raf.current = requestAnimationFrame(tick)
      } else {
        setDisplay(target)
        prev.current = target
      }
    }

    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration])

  return display.toFixed(decimals)
}
