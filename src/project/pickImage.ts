import { isTauri } from './pickFolder'
import { IMAGE_EXTENSIONS } from '../editor/projectImage'

export interface PickedImage {
  name: string
  bytes: Uint8Array
}

/** Image file picker: native dialog in the app, <input type=file> in the browser. null = cancelled. */
export async function pickImage(): Promise<PickedImage | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({
      multiple: false,
      filters: [{ name: 'Images', extensions: [...IMAGE_EXTENSIONS] }],
    })
    if (typeof picked !== 'string') return null
    const { readFile } = await import('@tauri-apps/plugin-fs')
    return {
      name: picked.replace(/\\/g, '/').split('/').pop() ?? picked,
      bytes: await readFile(picked),
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = IMAGE_EXTENSIONS.map((e) => `.${e}`).join(',')
    input.addEventListener('cancel', () => resolve(null))
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      resolve(file ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } : null)
    })
    input.click()
  })
}
