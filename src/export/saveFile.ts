import { isTauri } from '../project/pickFolder'

export interface SaveRequest {
  bytes: Uint8Array
  /** Suggested file name, e.g. "My book.pdf". */
  name: string
  extension: string
  mime: string
}

export interface SaveResult {
  /** Absolute path in the app; undefined for a browser download. */
  path?: string
}

/** Save-as dialog + write in the app, a download in the browser. null = cancelled. */
export async function saveFile(req: SaveRequest): Promise<SaveResult | null> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const path = await save({
      defaultPath: req.name,
      filters: [{ name: req.extension.toUpperCase(), extensions: [req.extension] }],
    })
    if (!path) return null
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    await writeFile(path, req.bytes)
    return { path }
  }
  const url = URL.createObjectURL(new Blob([req.bytes as BlobPart], { type: req.mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = req.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return {}
}

export async function showInFolder(path: string): Promise<void> {
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
  await revealItemInDir(path)
}

/** File name safe on all platforms. */
export const safeFileName = (title: string, extension: string): string => {
  const base = [...title]
    .map((ch) => (ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return `${base || 'book'}.${extension}`
}
