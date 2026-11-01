import Image, { type ImageOptions } from '@tiptap/extension-image'

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] as const

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

/** Lowercase extension if it is an allowed image type, else null. */
export function imageExt(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return (IMAGE_EXTENSIONS as readonly string[]).includes(ext) && name.includes('.') ? ext : null
}

const isRemote = (src: string) => /^(https?:|data:|blob:)/i.test(src)

export interface ProjectImageOptions {
  /** Reads a project-relative file; null = missing. */
  readAsset: ((path: string) => Promise<Uint8Array | null>) | null
  /** Placeholder text for an image that cannot be loaded. */
  missingLabel: (src: string) => string
}

/** Image whose `src` is a project-relative path, shown through a blob URL. */
export const ProjectImage = Image.extend<ImageOptions & ProjectImageOptions>({
  addOptions() {
    return { ...this.parent?.(), readAsset: null, missingLabel: (src: string) => src } as never
  },

  addNodeView() {
    const { readAsset: read, missingLabel } = this.options
    return ({ node }) => {
      const dom = document.createElement('div')
      dom.className = 'image-node'
      const img = document.createElement('img')
      const missing = document.createElement('span')
      missing.className = 'image-missing'
      let blobUrl = ''
      let token = 0

      const fail = (src: string) => {
        dom.classList.add('is-missing')
        missing.textContent = missingLabel(src)
        img.removeAttribute('src')
      }
      const show = async (src: string) => {
        const mine = ++token
        if (blobUrl) URL.revokeObjectURL(blobUrl)
        blobUrl = ''
        dom.classList.remove('is-missing')
        if (isRemote(src)) {
          img.src = src
          return
        }
        let bytes: Uint8Array | null
        try {
          bytes = read ? await read(src) : null
        } catch {
          bytes = null
        }
        if (mine !== token) return
        if (!bytes) return fail(src)
        const type = MIME[src.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
        blobUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type }))
        img.src = blobUrl
      }

      img.alt = (node.attrs.alt as string | null) ?? ''
      img.addEventListener('error', () => {
        if (img.getAttribute('src')) fail(String(node.attrs.src))
      })
      dom.append(img, missing)
      let current = String(node.attrs.src ?? '')
      void show(current)

      return {
        dom,
        update(next) {
          if (next.type.name !== 'image') return false
          img.alt = (next.attrs.alt as string | null) ?? ''
          const src = String(next.attrs.src ?? '')
          if (src !== current) {
            current = src
            void show(src)
          }
          return true
        },
        destroy() {
          token++
          if (blobUrl) URL.revokeObjectURL(blobUrl)
        },
      }
    }
  },
})
