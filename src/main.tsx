import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tg = (window as any).Telegram?.WebApp

const applyVH = () => {
  const h = tg
    ? (tg.viewportStableHeight || tg.viewportHeight || window.innerHeight)
    : window.innerHeight
  if (h > 100) {
    document.documentElement.style.setProperty('--tg-vh', `${h}px`)
  }
}

const applyPadding = () => {
  if (!tg) return
  // safeAreaInset.top  = device notch/Dynamic Island (44–59px)
  // contentSafeAreaInset.top = Telegram header bar above content (44–56px)
  // Cap sTop at 59px to prevent iOS Live Activities from inflating this value
  const rawSTop = typeof tg.safeAreaInset?.top === 'number' ? tg.safeAreaInset.top : 0
  const sTop = Math.min(rawSTop, 59)
  const rawCTop = typeof tg.contentSafeAreaInset?.top === 'number' ? tg.contentSafeAreaInset.top : 0
  const cTop = Math.min(rawCTop, 56)
  const total = sTop + cTop
  // Only override CSS default when TMA API gives a meaningful value (> 60px).
  // Small values (e.g. cTop=44 with sTop=0 on inline button) let CSS calc() handle it instead.
  if (total > 60) {
    document.documentElement.style.setProperty('--page-top', `${total}px`)
  }
  // Bottom safe area for nav bar visibility (home indicator on iPhone)
  const sBottom = typeof tg.safeAreaInset?.bottom === 'number' ? tg.safeAreaInset.bottom : 0
  document.documentElement.style.setProperty('--safe-bottom', `${sBottom}px`)
}

if (tg) {
  // Cache user id globally so admin panel can always read it even after fullscreen changes
  const uid = tg.initDataUnsafe?.user?.id
  if (uid) (window as any).__tgUserId = uid

  const isDesktop = tg.platform === 'tdesktop' || tg.platform === 'macos'

  tg.ready()
  tg.expand()
  if (!isDesktop) tg.requestFullscreen?.()
  tg.enableClosingConfirmation?.()
  tg.onEvent('viewportChanged', applyVH)
  tg.onEvent('safeAreaChanged', applyPadding)
  tg.onEvent('contentSafeAreaChanged', applyPadding)
  tg.onEvent('fullscreenChanged', () => { applyVH(); applyPadding() })
  applyVH()
  applyPadding()
  setTimeout(() => { tg.expand(); if (!isDesktop) tg.requestFullscreen?.(); applyVH(); applyPadding() }, 150)
  setTimeout(() => { tg.expand(); if (!isDesktop) tg.requestFullscreen?.(); applyVH(); applyPadding() }, 500)
  setTimeout(() => { applyVH(); applyPadding() }, 1200)
} else {
  applyVH()
  window.addEventListener('resize', applyVH)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
