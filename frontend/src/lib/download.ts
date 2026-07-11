// Cross-environment file download.
// In Tauri, anchor-based blob downloads silently fail — use the native save dialog.
// In a browser, fall back to the classic anchor-click method.

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** Save text content (CSV, etc.) to a file the user chooses. */
export async function saveTextFile(filename: string, content: string, mime = 'text/csv') {
  if (isTauri) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { writeTextFile } = await import('@tauri-apps/plugin-fs')
      const ext = filename.split('.').pop() || 'csv'
      const path = await save({
        defaultPath: filename,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      })
      if (!path) return false // user cancelled
      await writeTextFile(path, content)
      return true
    } catch (e) {
      console.error('Tauri save failed', e)
      return false
    }
  }
  // Browser fallback
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
  return true
}

/** Save a Blob (already-fetched binary/text) to a file. */
export async function saveBlob(filename: string, blob: Blob) {
  const text = await blob.text()
  return saveTextFile(filename, text, blob.type || 'text/csv')
}
