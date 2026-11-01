import { describe, expect, it } from 'vitest'
import { imageExt } from './projectImage'

describe('imageExt', () => {
  it('accepts the allowed image types, any case', () => {
    for (const n of ['a.png', 'a.JPG', 'a.jpeg', 'a.gif', 'a.webp', 'x.y.SVG'])
      expect(imageExt(n)).not.toBeNull()
  })
  it('rejects other files', () => {
    for (const n of ['a.pdf', 'png', 'a.exe', 'a.']) expect(imageExt(n)).toBeNull()
  })
})
