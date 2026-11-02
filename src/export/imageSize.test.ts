import { describe, expect, it } from 'vitest'
import { imageInfo } from './imageSize'

const b64 = (s: string) => Uint8Array.from(Buffer.from(s, 'base64'))
const PNG = b64(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
)

describe('imageInfo', () => {
  it('reads png size', () => {
    expect(imageInfo(PNG)).toEqual({ type: 'png', width: 1, height: 1 })
  })
  it('reads gif size', () => {
    const gif = Uint8Array.from([...Buffer.from('GIF89a'), 3, 0, 2, 0, 0, 0, 0])
    expect(imageInfo(gif)).toEqual({ type: 'gif', width: 3, height: 2 })
  })
  it('reads jpeg size from the SOF segment', () => {
    const jpg = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 20, 0, 30, 1, 0, 0, 0,
    ])
    expect(imageInfo(jpg)).toEqual({ type: 'jpeg', width: 30, height: 20 })
  })
  it('detects svg without size', () => {
    const svg = new TextEncoder().encode(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>',
    )
    expect(imageInfo(svg)?.type).toBe('svg')
  })
  it('returns null for unknown data', () => {
    expect(imageInfo(Uint8Array.from([1, 2, 3]))).toBeNull()
  })
})
