export type GrainLevel = 'none' | 'light' | 'medium' | 'strong'
export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night'

export interface CleanOptions {
  grain?: GrainLevel
  microResize?: boolean
  quality?: number
}

export interface AutoTimeResult {
  tod: TimeOfDay
  time: string   // e.g. "13:47"
}

// Sub-perceptual noise: ±1–3 per channel — invisible to the eye, breaks perceptual hash
const GRAIN: Record<GrainLevel, number> = { none: 0, light: 1, medium: 2, strong: 3 }

function randTime(hMin: number, hMax: number): string {
  const h = hMin + Math.floor(Math.random() * (hMax - hMin + 1))
  const m = Math.floor(Math.random() * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Analyse photo pixel data to estimate what time of day it was taken.
 * Uses a 64×64 downsampled version for speed.
 */
export async function detectPhotoTime(file: File): Promise<AutoTimeResult> {
  const bitmap = await createImageBitmap(file, { resizeWidth: 64, resizeHeight: 64 })
  const canvas = new OffscreenCanvas(64, 64)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  const { data } = ctx.getImageData(0, 0, 64, 64)
  let sumR = 0, sumG = 0, sumB = 0
  const n = data.length / 4

  for (let i = 0; i < data.length; i += 4) {
    sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2]
  }

  const brightness = (sumR + sumG + sumB) / (3 * n)
  const warmth     = sumR / (sumB / n + 1)   // red vs blue dominance

  let tod: TimeOfDay
  let time: string

  if (brightness < 55) {
    // Very dark → night
    tod  = 'night'
    time = Math.random() < 0.5 ? randTime(22, 23) : randTime(0, 4)
  } else if (brightness < 120 && warmth > 1.5) {
    // Dim + warm tones → golden hour (could be dawn or dusk)
    tod  = Math.random() < 0.5 ? 'morning' : 'evening'
    time = tod === 'morning' ? randTime(6, 8) : randTime(18, 20)
  } else if (brightness >= 120 && brightness < 170 && warmth > 1.25) {
    // Medium-bright + warm → late morning or early evening
    tod  = Math.random() < 0.5 ? 'morning' : 'evening'
    time = tod === 'morning' ? randTime(8, 11) : randTime(16, 19)
  } else if (brightness >= 170) {
    // Bright + neutral → midday
    tod  = 'day'
    time = randTime(10, 16)
  } else {
    // Default: overcast day
    tod  = 'day'
    time = randTime(9, 17)
  }

  return { tod, time }
}

export function currentTimeOfDay(timezone: string): TimeOfDay {
  try {
    const h = parseInt(
      new Intl.DateTimeFormat('en', { hour: 'numeric', hour12: false, timeZone: timezone }).format(new Date()),
      10,
    )
    if (h >= 5 && h < 11) return 'morning'
    if (h >= 11 && h < 18) return 'day'
    if (h >= 18 && h < 22) return 'evening'
    return 'night'
  } catch {
    return 'day'
  }
}

export function localTimeString(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
    }).format(new Date())
  } catch {
    return '--:--'
  }
}

/** Re-draw through Canvas → strips ALL EXIF, applies invisible sub-pixel noise. */
export async function cleanImage(file: File, opts: CleanOptions = {}): Promise<File> {
  const { grain = 'light', microResize = false, quality = 0.93 } = opts

  const bitmap = await createImageBitmap(file)
  const w = bitmap.width  - (microResize ? 1 : 0)
  const h = bitmap.height - (microResize ? 1 : 0)

  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const g = GRAIN[grain]
  if (g > 0) {
    const imgData = ctx.getImageData(0, 0, w, h)
    const d = imgData.data
    for (let i = 0; i < d.length; i += 4) {
      const n = Math.round((Math.random() - 0.5) * 2 * g)
      d[i]   = Math.max(0, Math.min(255, d[i]   + n))
      d[i+1] = Math.max(0, Math.min(255, d[i+1] + n))
      d[i+2] = Math.max(0, Math.min(255, d[i+2] + n))
    }
    ctx.putImageData(imgData, 0, 0)
  }

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality })
  return new File([blob], file.name.replace(/\.[^.]+$/, '_clean.jpg'), { type: 'image/jpeg', lastModified: Date.now() })
}

/** Strip EXIF only — no visual changes. Used for all uploads before sending to AI. */
export async function stripExif(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.96 })
  return new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() })
}
