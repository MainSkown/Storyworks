import { describe, expect, it } from 'vitest'
import { resolveSibling } from './pick'

describe('resolveSibling', () => {
  it('joins next to the file', () => {
    expect(resolveSibling('/home/a/book/ch1.md', 'img/map.png')).toBe('/home/a/book/img/map.png')
  })
  it('handles ../ and ./', () => {
    expect(resolveSibling('/home/a/book/ch1.md', '../pics/./x.jpg')).toBe('/home/a/pics/x.jpg')
  })
  it('decodes percent-encoding and drops query', () => {
    expect(resolveSibling('/b/c.md', 'my%20pic.png?raw=1')).toBe('/b/my pic.png')
  })
  it('uses backslashes for Windows paths', () => {
    expect(resolveSibling('C:\\book\\c.md', 'a/b.png')).toBe('C:\\book\\a\\b.png')
  })
  it('refuses to climb above the root', () => {
    expect(resolveSibling('/c.md', '../x.png')).toBeNull()
  })
})
