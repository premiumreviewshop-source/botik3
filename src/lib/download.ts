// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tg = () => (window as any).Telegram?.WebApp

export async function downloadFile(url: string, filename: string): Promise<void> {
  // Telegram WebApp native download — works on iOS and Android inside Telegram.
  // Wrap in a Promise so sequential calls truly wait for the dialog to be
  // dismissed before the next download starts (otherwise Telegram ignores extras).
  const app = tg()
  if (app?.downloadFile) {
    await new Promise<void>((resolve) => {
      let settled = false
      const done = () => { if (!settled) { settled = true; resolve() } }
      try {
        // callback fires with 'downloading' or 'cancelled' when user decides
        app.downloadFile({ url, file_name: filename }, done)
      } catch {
        done()
      }
      // Safety timeout in case callback never fires
      setTimeout(done, 15000)
    })
    return
  }

  // Desktop / non-Telegram browser: fetch as blob then anchor click
  try {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const blob = await resp.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl) }, 300)
  } catch {
    // Final fallback: open in new tab so the user can save manually
    window.open(url, '_blank')
  }
}
