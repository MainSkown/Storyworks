import { describe, expect, it } from 'vitest'
import { LINES_PER_PAGE, paginate, wrapLines, type Page, type ScriptElement } from './layout'
import type { ElementType } from './rules'

const el = (type: ElementType, text: string, extra: Partial<ScriptElement> = {}): ScriptElement => ({
  type,
  text,
  ...extra,
})
/** An action of exactly n one-line rows. */
const fill = (n: number): ScriptElement =>
  el('action', Array.from({ length: n }, () => 'a'.repeat(60)).join(' '))
/** n dialogue sentences of 30 chars: each wraps onto its own line (width 35). */
const speech = (n: number): string =>
  Array.from({ length: n }, (_, i) => `${String.fromCharCode(65 + (i % 26)).repeat(29)}.`).join(' ')
const at = (p: Page, row: number) => p.lines.find((l) => l.row === row)
const texts = (p: Page) => p.lines.map((l) => l.text)
const speechLines = (p: Page) => p.lines.filter((l) => l.element === 'dialogue' && l.text !== '(MORE)')

describe('wrapLines', () => {
  it('wraps on word boundaries within the width', () => {
    expect(wrapLines('aaa bbb ccc', 7)).toEqual(['aaa bbb', 'ccc'])
  })
  it('hard-splits a word longer than the width', () => {
    expect(wrapLines('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij'])
  })
  it('keeps explicit line breaks', () => {
    expect(wrapLines('one\ntwo', 20)).toEqual(['one', 'two'])
  })
  it('returns nothing for blank text', () => {
    expect(wrapLines('  \n ', 20)).toEqual([])
  })
})

describe('element layout', () => {
  it('uppercases headings, cues and transitions but not action', () => {
    const [p] = paginate(
      [
        el('sceneHeading', 'int. łódź - day'),
        el('action', 'She walks.'),
        el('character', 'anna'),
        el('dialogue', 'Hi.'),
        el('transition', 'cut to:'),
      ],
      { pageSize: 'Letter' },
    )
    expect(texts(p!)).toEqual(['INT. ŁÓDŹ - DAY', 'She walks.', 'ANNA', 'Hi.', 'CUT TO:'])
  })

  it('indents elements from the left margin and right-aligns transitions', () => {
    const [p] = paginate(
      [
        el('sceneHeading', 'INT. A - DAY'),
        el('character', 'ANNA'),
        el('parenthetical', '(soft)'),
        el('dialogue', 'Hi.'),
        el('transition', 'CUT TO:'),
      ],
      { pageSize: 'Letter' },
    )
    const indent = Object.fromEntries(p!.lines.map((l) => [l.element, l.indent]))
    expect(indent).toEqual({
      sceneHeading: 0,
      character: 20,
      parenthetical: 15,
      dialogue: 10,
      transition: 60 - 'CUT TO:'.length,
    })
  })

  it('leaves blank lines before elements, none at the top of a page', () => {
    const [p] = paginate(
      [el('sceneHeading', 'INT. A - DAY'), el('action', 'x'), el('character', 'A'), el('dialogue', 'y')],
      { pageSize: 'Letter' },
    )
    // heading row 0; action after 1 blank; cue after 1 blank; dialogue directly below
    expect(p!.lines.map((l) => l.row)).toEqual([0, 2, 4, 5])
  })

  it('puts the scene number on the heading line', () => {
    const [p] = paginate([el('sceneHeading', 'INT. A - DAY', { number: 7 })], { pageSize: 'Letter' })
    expect(p!.lines[0]!.number).toBe(7)
  })

  it('skips elements with blank text and gives zero pages for nothing', () => {
    expect(paginate([], { pageSize: 'Letter' })).toEqual([])
    expect(paginate([el('action', '  ')], { pageSize: 'Letter' })).toEqual([])
  })
})

describe('pages', () => {
  it('fits exactly LINES_PER_PAGE rows on a page and starts another after', () => {
    const letter = LINES_PER_PAGE.Letter
    expect(paginate([fill(letter)], { pageSize: 'Letter' })).toHaveLength(1)
    const pages = paginate([fill(letter - 3), fill(2), fill(2)], { pageSize: 'Letter' })
    expect(pages).toHaveLength(2)
  })

  it('fits more lines on A4', () => {
    expect(LINES_PER_PAGE.A4).toBeGreaterThan(LINES_PER_PAGE.Letter)
  })

  it('never leaves a scene heading as the last thing on a page', () => {
    const pages = paginate(
      [fill(LINES_PER_PAGE.Letter - 3), el('sceneHeading', 'INT. A - DAY'), el('action', 'one\ntwo\nthree')],
      { pageSize: 'Letter' },
    )
    expect(pages).toHaveLength(2)
    expect(at(pages[1]!, 0)!.element).toBe('sceneHeading')
  })

  it('moves a lone action line from the bottom of a page to the next (orphan)', () => {
    const body = LINES_PER_PAGE.Letter
    const pages = paginate([fill(body - 2), el('action', 'one\ntwo\nthree\nfour')], { pageSize: 'Letter' })
    // 1 blank + 1 line would fit on page 1, but a single line is never stranded
    expect(texts(pages[0]!).filter((t) => t === 'one')).toEqual([])
    expect(texts(pages[1]!)).toEqual(['one', 'two', 'three', 'four'])
  })

  it('does not leave a single line on the next page (widow)', () => {
    const body = LINES_PER_PAGE.Letter
    // 4 rows free after the blank line; 5-line action would leave 1 -> split 3/2
    const pages = paginate([fill(body - 5), el('action', 'a\nb\nc\nd\ne')], { pageSize: 'Letter' })
    expect(texts(pages[1]!)).toEqual(['d', 'e'])
  })

  it('splits long action across several pages', () => {
    const lines = Array.from({ length: 150 }, (_, i) => `line ${i}`).join('\n')
    const pages = paginate([el('action', lines)], { pageSize: 'Letter' })
    expect(pages.map((p) => p.lines.length)).toEqual([55, 55, 40])
  })

  it('does not start a page with a blank row', () => {
    const body = LINES_PER_PAGE.Letter
    const pages = paginate([fill(body), el('action', 'next')], { pageSize: 'Letter' })
    expect(at(pages[1]!, 0)!.text).toBe('next')
  })
})

describe('dialogue across pages', () => {
  const body = LINES_PER_PAGE.Letter

  it('keeps a whole speech together when it fits on the next page', () => {
    // cue + 3 lines; only 4 rows left, a split would strand one line
    const pages = paginate(
      [fill(body - 4), el('character', 'anna'), el('dialogue', speech(3))],
      { pageSize: 'Letter' },
    )
    expect(pages).toHaveLength(2)
    expect(at(pages[1]!, 0)!.text).toBe('ANNA')
    expect(texts(pages[0]!)).not.toContain('(MORE)')
  })

  it('splits at a sentence end with (MORE) and a (CONT\'D) cue', () => {
    const pages = paginate(
      [fill(body - 10), el('character', 'anna'), el('dialogue', speech(10))],
      { pageSize: 'Letter' },
    )
    expect(pages).toHaveLength(2)
    const first = pages[0]!
    // rows used: 45 fill, blank, cue, then 7 speech lines + (MORE) = 55
    expect(at(first, 54)!.text).toBe('(MORE)')
    expect(speechLines(first)).toHaveLength(7)
    const second = pages[1]!
    expect(at(second, 0)!.text).toBe("ANNA (CONT'D)")
    expect(speechLines(second)).toHaveLength(3)
    // every sentence appears exactly once, in order
    expect(pages.flatMap(speechLines).map((l) => l.text)).toEqual(speech(10).split(' '))
  })

  it('uses Polish labels', () => {
    const pages = paginate(
      [fill(body - 10), el('character', 'anna'), el('dialogue', speech(10))],
      { pageSize: 'Letter', labels: { more: '(DALEJ)', contd: '(CD.)' } },
    )
    expect(at(pages[0]!, 54)!.text).toBe('(DALEJ)')
    expect(at(pages[1]!, 0)!.text).toBe('ANNA (CD.)')
  })

  it('splits without markers when labels are off', () => {
    const pages = paginate(
      [fill(body - 10), el('character', 'anna'), el('dialogue', speech(10))],
      { pageSize: 'Letter', labels: null },
    )
    expect(pages.flatMap((p) => texts(p))).not.toContain('(MORE)')
    expect(speechLines(pages[0]!)).toHaveLength(8) // the (MORE) row is free for text
    expect(at(pages[1]!, 0)!.text).toBe('ANNA')
  })

  it('does not repeat CONT\'D when the cue already carries it', () => {
    const pages = paginate(
      [fill(body - 10), el('character', "ANNA (CONT'D)"), el('dialogue', speech(10))],
      { pageSize: 'Letter' },
    )
    expect(at(pages[1]!, 0)!.text).toBe("ANNA (CONT'D)")
  })

  it('never ends a page right after a parenthetical', () => {
    // room for 3 speech rows: dialogue(2) | parenthetical + dialogue(6)
    const pages = paginate(
      [
        fill(body - 6),
        el('character', 'anna'),
        el('dialogue', speech(2)),
        el('parenthetical', '(beat)'),
        el('dialogue', speech(6)),
      ],
      { pageSize: 'Letter' },
    )
    expect(pages[0]!.lines.some((l) => l.element === 'parenthetical')).toBe(false)
    expect(texts(pages[1]!).slice(0, 2)).toEqual(["ANNA (CONT'D)", '(beat)'])
  })

  it('splits a speech longer than a page even without a sentence end', () => {
    const long = Array.from({ length: 600 }, () => 'word').join(' ')
    const pages = paginate([el('character', 'anna'), el('dialogue', long)], { pageSize: 'Letter' })
    expect(pages.length).toBeGreaterThan(1)
    const words = pages.flatMap((p) =>
      speechLines(p).flatMap((l) => l.text.split(' ')),
    )
    expect(words).toHaveLength(600)
  })

  it('never puts more rows on a page than fit', () => {
    const els: ScriptElement[] = []
    for (let i = 0; i < 80; i++)
      els.push(
        el('sceneHeading', `INT. PLACE ${i} - DAY`),
        el('action', 'Some action here. '.repeat(5)),
        el('character', 'bob'),
        el('dialogue', speech(7)),
      )
    for (const p of paginate(els, { pageSize: 'Letter' })) {
      expect(Math.max(...p.lines.map((l) => l.row))).toBeLessThan(LINES_PER_PAGE.Letter)
    }
  })
})

describe('determinism and speed', () => {
  it('gives the same pages for the same input', () => {
    const els = [fill(40), el('character', 'a'), el('dialogue', speech(8)), el('action', 'x')]
    expect(paginate(els, { pageSize: 'Letter' })).toEqual(paginate(els, { pageSize: 'Letter' }))
  })

  it('paginates a long script quickly', () => {
    const els: ScriptElement[] = []
    for (let i = 0; i < 1500; i++)
      els.push(
        el('sceneHeading', `INT. PLACE ${i} - DAY`),
        el('action', 'Action line one. Action line two. Action line three.'),
        el('character', 'anna'),
        el('dialogue', speech(4)),
      )
    const t0 = performance.now()
    const pages = paginate(els, { pageSize: 'Letter' })
    expect(pages.length).toBeGreaterThan(100)
    expect(performance.now() - t0).toBeLessThan(1000)
  })
})
