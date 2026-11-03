import type { ImportFile } from './plan'

/** Path of an image named in a Markdown file, relative to that file's folder (percent-encoding decoded). */
export function resolveSibling(filePath: string, ref: string): string | null {
  let decoded = ref.split(/[?#]/)[0]!
  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    // keep as written
  }
  const sep = filePath.includes('\\') && !filePath.includes('/') ? '\\' : '/'
  const parts = filePath.split(/[\\/]/)
  parts.pop()
  if (/^([/\\]|[a-z]:)/i.test(decoded)) return decoded
  for (const seg of decoded.split(/[\\/]/)) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (parts.length <= 1) return null
      parts.pop()
    } else parts.push(seg)
  }
  return parts.join(sep)
}

export const IMPORT_EXTENSIONS = ['md', 'markdown', 'txt']
export const FOUNTAIN_EXTENSIONS = ['fountain', 'txt']

/** Native multi-select in the app (images read next to each file). Empty = cancelled. */
export async function pickImportFilesNative(fountain = false): Promise<ImportFile[]> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const picked = await open({
    multiple: !fountain,
    filters: [
      fountain
        ? { name: 'Fountain / text', extensions: FOUNTAIN_EXTENSIONS }
        : { name: 'Markdown / text', extensions: IMPORT_EXTENSIONS },
    ],
  })
  if (!picked) return []
  const paths = Array.isArray(picked) ? picked : [picked]
  const { readFile } = await import('@tauri-apps/plugin-fs')
  const files: ImportFile[] = []
  for (const p of paths) {
    files.push({
      name: p.replace(/\\/g, '/').split('/').pop() ?? p,
      bytes: await readFile(p),
      readAsset: async (ref) => {
        const target = resolveSibling(p, ref)
        if (!target) return null
        try {
          return await readFile(target)
        } catch {
          return null
        }
      },
    })
  }
  return files
}

export async function readBrowserFiles(list: FileList | null): Promise<ImportFile[]> {
  return Promise.all(
    Array.from(list ?? []).map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
  )
}
