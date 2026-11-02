export interface ImageInfo {
  type: 'png' | 'jpeg' | 'gif' | 'webp' | 'svg'
  /** Pixels; 0 when unknown (svg, unparsed webp). */
  width: number
  height: number
}

const be32 = (b: Uint8Array, i: number) =>
  ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0
const be16 = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!
const le16 = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8)
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.slice(i, i + n))

/** Sniffs the format and reads pixel size from the header; null if not a supported image. */
export function imageInfo(b: Uint8Array): ImageInfo | null {
  if (b.length >= 24 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG')
    return { type: 'png', width: be32(b, 16), height: be32(b, 20) }
  if (b.length >= 10 && ascii(b, 0, 3) === 'GIF')
    return { type: 'gif', width: le16(b, 6), height: le16(b, 8) }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return { type: 'jpeg', width: 0, height: 0 }
      const marker = b[i + 1]!
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { type: 'jpeg', width: be16(b, i + 7), height: be16(b, i + 5) }
      i += 2 + be16(b, i + 2)
    }
    return { type: 'jpeg', width: 0, height: 0 }
  }
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP')
    return { type: 'webp', width: 0, height: 0 }
  if (ascii(b, 0, 512).includes('<svg')) return { type: 'svg', width: 0, height: 0 }
  return null
}
