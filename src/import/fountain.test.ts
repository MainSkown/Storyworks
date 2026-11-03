import { describe, expect, it } from 'vitest'
import { parseFountain } from './fountain'

const els = (text: string) => parseFountain(text).sequences.flatMap((s) => s.scenes.flatMap((sc) => sc.elements))
const scene = (body: string) => `INT. ROOM - DAY\n\n${body}`
const body = (text: string) => els(scene(text)).slice(1)

describe('parseFountain basics', () => {
  it('returns nothing for an empty string', () => {
    const r = parseFountain('')
    expect(r.sequences).toEqual([])
    expect(r.noSceneHeadings).toBe(true)
    expect(r.skipped).toEqual([])
  })
  it('never throws on odd input', () => {
    for (const s of ['\n\n', '   ', '[[', '/*', '#', '>', '.', '@', '!', '\uFEFF', '***', '_', '(', 'a\r\rb']) {
      expect(() => parseFountain(s)).not.toThrow()
    }
  })
  it('strips a BOM and normalises CRLF and CR', () => {
    expect(els('\uFEFFINT. A - DAY\r\n\r\nHello.\rWorld.')).toEqual([
      { type: 'sceneHeading', text: 'INT. A - DAY' },
      { type: 'action', text: 'Hello.\nWorld.' },
    ])
  })
})

describe('parseFountain elements', () => {
  it('reads INT, EXT, EST, I/E headings', () => {
    for (const h of ['INT. A', 'EXT. A', 'EST. A', 'INT./EXT. A', 'I/E A', 'int. a']) {
      expect(els(h)[0]).toEqual({ type: 'sceneHeading', text: h })
    }
  })
  it('reads a forced heading and keeps text as typed', () => {
    expect(els('.Back at home')[0]).toEqual({ type: 'sceneHeading', text: 'Back at home' })
  })
  it('does not treat an ellipsis as a heading', () => {
    expect(els('...and then')[0]).toEqual({ type: 'action', text: '...and then' })
  })
  it('reads forced action', () => {
    expect(body('!INT. NOT A HEADING')).toEqual([{ type: 'action', text: 'INT. NOT A HEADING' }])
  })
  it('reads a forced action with a leading dot kept', () => {
    expect(body('!.hidden')).toEqual([{ type: 'action', text: '.hidden' }])
  })
  it('reads a plain transition', () => {
    expect(body('CUT TO:\n\nMore.')[0]).toEqual({ type: 'transition', text: 'CUT TO:' })
  })
  it('reads a forced transition', () => {
    expect(body('> Fade out.')).toEqual([{ type: 'transition', text: 'Fade out.' }])
  })
  it('reads character, parenthetical and dialogue', () => {
    expect(body('ANNA\n(quietly)\nHello there.\nSecond line.')).toEqual([
      { type: 'character', text: 'ANNA' },
      { type: 'parenthetical', text: '(quietly)' },
      { type: 'dialogue', text: 'Hello there.\nSecond line.' },
    ])
  })
  it('keeps a character extension', () => {
    expect(body('ANNA (V.O.)\nHi.')[0]).toEqual({ type: 'character', text: 'ANNA (V.O.)' })
  })
  it('reads a forced character with lowercase', () => {
    expect(body('@anna\nHi.')).toEqual([
      { type: 'character', text: 'anna' },
      { type: 'dialogue', text: 'Hi.' },
    ])
  })
  it('reads Polish capitals as a character', () => {
    expect(body('ŁUKASZ\nCześć.')[0]).toEqual({ type: 'character', text: 'ŁUKASZ' })
  })
  it('treats a lone all-caps line as action', () => {
    expect(body('BANG')).toEqual([{ type: 'action', text: 'BANG' }])
  })
  it('keeps a two-space line as an empty line in dialogue', () => {
    expect(body('ANNA\nOne.\n  \nTwo.')[1]).toEqual({ type: 'dialogue', text: 'One.\n\nTwo.' })
  })
  it('keeps a two-space line as an empty line in action', () => {
    expect(body('One.\n  \nTwo.')).toEqual([{ type: 'action', text: 'One.\n\nTwo.' }])
  })
  it('splits action at a blank line', () => {
    expect(body('One.\n\nTwo.')).toHaveLength(2)
  })
})

describe('parseFountain structure', () => {
  it('starts a sequence at each section of any depth', () => {
    const r = parseFountain('# Act one\n\nINT. A\n\n## Part\n\nINT. B\n\n### Deep\n\nINT. C')
    expect(r.sequences.map((s) => [s.title, s.scenes.length])).toEqual([['Act one', 1], ['Part', 1], ['Deep', 1]])
  })
  it('puts scenes without a section in a sequence titled empty', () => {
    const r = parseFountain('INT. A\n\nINT. B')
    expect(r.sequences).toHaveLength(1)
    expect(r.sequences[0]!.title).toBe('')
    expect(r.sequences[0]!.scenes.map((s) => s.title)).toEqual(['INT. A', 'INT. B'])
  })
  it('puts content before the first heading in a scene titled empty', () => {
    const r = parseFountain('Opening note.\n\nINT. A\n\nText')
    expect(r.sequences[0]!.scenes.map((s) => s.title)).toEqual(['', 'INT. A'])
    expect(r.sequences[0]!.scenes[0]!.elements).toEqual([{ type: 'action', text: 'Opening note.' }])
  })
  it('reads a section followed directly by a heading', () => {
    const r = parseFountain('# Act\nINT. A\n\nText')
    expect(r.sequences[0]!.scenes[0]!.title).toBe('INT. A')
  })
  it('turns a file without headings into one action scene', () => {
    const r = parseFountain('Some text.\n\nANNA\nHi.')
    expect(r.noSceneHeadings).toBe(true)
    expect(r.sequences).toHaveLength(1)
    expect(r.sequences[0]!.scenes).toHaveLength(1)
    expect(r.sequences[0]!.scenes[0]!.elements.every((e) => e.type === 'action')).toBe(true)
    expect(r.skipped).toEqual([])
  })
  it('sets noSceneHeadings false when a heading exists', () => {
    expect(parseFountain('INT. A').noSceneHeadings).toBe(false)
  })
})

describe('parseFountain skipped constructs', () => {
  const skipped = (t: string) => parseFountain(t).skipped

  it('reads the title page into lower-cased keys', () => {
    const r = parseFountain('Title: My Film\nDraft date: 2026-01-01\nContact:\n    a@b.c\n    Warsaw\n\nINT. A')
    expect(r.titlePage).toEqual({ title: 'My Film', 'draft date': '2026-01-01', contact: 'a@b.c\nWarsaw' })
    expect(r.skipped).toEqual([{ construct: 'titlePage', count: 1 }])
    expect(r.sequences[0]!.scenes[0]!.title).toBe('INT. A')
  })
  it('does not read a title page when the first line is not a key', () => {
    expect(parseFountain('INT. A\n\nTitle: x').titlePage).toEqual({})
  })
  it('removes inline notes and counts them', () => {
    expect(body('She [[check this]] waits.')).toEqual([{ type: 'action', text: 'She  waits.' }])
    expect(skipped(scene('She [[x]] waits [[y]].'))).toEqual([{ construct: 'note', count: 2 }])
  })
  it('removes multi-line notes', () => {
    const r = parseFountain(scene('Before.\n\n[[long\nnote]]\n\nAfter.'))
    expect(r.sequences[0]!.scenes[0]!.elements.map((e) => e.text)).toEqual(['INT. ROOM - DAY', 'Before.', 'After.'])
    expect(r.skipped).toEqual([{ construct: 'note', count: 1 }])
  })
  it('removes a note line inside dialogue without breaking it', () => {
    expect(body('ANNA\n[[n]]\nHi.')).toEqual([
      { type: 'character', text: 'ANNA' },
      { type: 'dialogue', text: 'Hi.' },
    ])
  })
  it('removes boneyard text', () => {
    const r = parseFountain(scene('Keep /* cut\nthis */ it.'))
    expect(r.sequences[0]!.scenes[0]!.elements[1]!.text).toBe('Keep  it.')
    expect(r.skipped).toEqual([{ construct: 'boneyard', count: 1 }])
  })
  it('drops synopsis lines', () => {
    const r = parseFountain(scene('= Anna meets Bob\n\nText'))
    expect(r.sequences[0]!.scenes[0]!.elements).toHaveLength(2)
    expect(r.skipped).toEqual([{ construct: 'synopsis', count: 1 }])
  })
  it('keeps centered text as action', () => {
    expect(body('> THE END <')).toEqual([{ type: 'action', text: 'THE END' }])
    expect(skipped(scene('> THE END <'))).toEqual([{ construct: 'centered', count: 1 }])
  })
  it('drops page breaks', () => {
    const r = parseFountain(scene('One.\n\n===\n\nTwo.'))
    expect(r.sequences[0]!.scenes[0]!.elements.map((e) => e.text)).toEqual(['INT. ROOM - DAY', 'One.', 'Two.'])
    expect(r.skipped).toEqual([{ construct: 'pageBreak', count: 1 }])
  })
  it('strips scene number tags', () => {
    const r = parseFountain('INT. A - DAY #12#\n\nText')
    expect(r.sequences[0]!.scenes[0]!.title).toBe('INT. A - DAY')
    expect(r.sequences[0]!.scenes[0]!.elements[0]!.text).toBe('INT. A - DAY')
    expect(r.skipped).toEqual([{ construct: 'sceneNumber', count: 1 }])
  })
  it('keeps the cue of dual dialogue as a normal cue', () => {
    expect(body('BOB ^\nHi.')[0]).toEqual({ type: 'character', text: 'BOB' })
    expect(skipped(scene('BOB ^\nHi.'))).toEqual([{ construct: 'dualDialogue', count: 1 }])
  })
  it('strips emphasis markers and counts lines', () => {
    expect(body('She *runs* and **jumps** and _hides_ and ***all***.')[0]!.text).toBe('She runs and jumps and hides and all.')
    expect(skipped(scene('*one*\n_two_'))).toEqual([{ construct: 'emphasis', count: 2 }])
  })
  it('keeps escaped markers and snake_case', () => {
    expect(body('2 \\* 3 and snake_case_name')[0]!.text).toBe('2 * 3 and snake_case_name')
    expect(skipped(scene('2 \\* 3'))).toEqual([])
  })
  it('keeps lyrics as action without the marker', () => {
    expect(body('~Sing along')).toEqual([{ type: 'action', text: 'Sing along' }])
    expect(skipped(scene('~Sing along'))).toEqual([{ construct: 'lyrics', count: 1 }])
  })
  it('lists skipped constructs in a stable order', () => {
    const r = parseFountain('Title: T\n\nINT. A #1#\n\n= syn\n\n*x* [[n]]')
    expect(r.skipped.map((s) => s.construct)).toEqual(['titlePage', 'note', 'synopsis', 'sceneNumber', 'emphasis'])
  })
})
