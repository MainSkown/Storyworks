import { describe, expect, it } from 'vitest'
import type { ScriptElement } from '../editor/screenplay/layout'
import { fountainExporter, toFountain } from './fountain'
import type { ScriptDoc } from './scriptModel'
import { defaultScriptExportOptions } from './scriptOptions'

const el = (type: ScriptElement['type'], text: string): ScriptElement => ({ type, text })
function doc(elements: ScriptElement[], over: Partial<ScriptDoc> = {}, seqTitle = ''): ScriptDoc {
  return {
    meta: { title: 'My Film', author: 'Ann', language: 'en' },
    titlePage: { contact: '', date: '' },
    options: { ...defaultScriptExportOptions(), titlePage: false },
    sequences: [{ id: 'q', title: seqTitle, scenes: [{ id: 's', title: 'S', elements }] }],
    warnings: [],
    ...over,
  }
}
const out = (elements: ScriptElement[]) => toFountain(doc(elements))

describe('toFountain title page', () => {
  const withTp = (over: Partial<ScriptDoc>) =>
    toFountain(doc([el('action', 'Hi.')], { options: { ...defaultScriptExportOptions(), titlePage: true }, ...over }))

  it('writes the keys first and omits empty values', () => {
    const t = withTp({ titlePage: { contact: 'a@b.c', date: '' } })
    expect(t).toBe('Title: My Film\nAuthor: Ann\nContact: a@b.c\n\nHi.\n')
  })
  it('writes the draft date', () => {
    expect(withTp({ titlePage: { contact: '', date: '2026' } })).toContain('Draft date: 2026\n')
  })
  it('writes multi-line values indented', () => {
    expect(withTp({ titlePage: { contact: 'a\nb', date: '' } })).toContain('Contact:\n    a\n    b\n')
  })
  it('skips the title page when the option is off', () => {
    expect(out([el('action', 'Hi.')])).toBe('Hi.\n')
  })
})

describe('toFountain structure', () => {
  it('writes a section line for a titled sequence', () => {
    expect(toFountain(doc([el('action', 'Hi.')], {}, 'Act one'))).toBe('# Act one\n\nHi.\n')
  })
  it('writes no section line for an empty title', () => {
    expect(out([el('action', 'Hi.')])).not.toContain('#')
  })
  it('separates elements by one blank line and ends with one newline', () => {
    expect(out([el('action', 'One.'), el('action', 'Two.')])).toBe('One.\n\nTwo.\n')
  })
  it('returns a single newline for an empty script', () => {
    expect(out([])).toBe('\n')
  })
  it('skips empty elements', () => {
    expect(out([el('action', '  '), el('action', 'Two.')])).toBe('Two.\n')
  })
})

describe('toFountain scene headings', () => {
  it('uppercases and omits scene numbers', () => {
    const t = out([{ type: 'sceneHeading', text: 'int. kitchen - day', number: 4 }])
    expect(t).toBe('INT. KITCHEN - DAY\n')
  })
  it('forces a heading that does not start with INT or EXT', () => {
    expect(out([el('sceneHeading', 'Back home')])).toBe('.BACK HOME\n')
  })
  it('accepts EST, INT./EXT. and I/E', () => {
    for (const h of ['est. a', 'int./ext. a', 'i/e a', 'ext a']) expect(out([el('sceneHeading', h)])).toBe(`${h.toUpperCase()}\n`)
  })
})

describe('toFountain dialogue', () => {
  it('keeps cue, parenthetical and dialogue together', () => {
    const t = out([el('character', 'anna'), el('parenthetical', 'softly'), el('dialogue', 'Hi.\nBye.'), el('action', 'End.')])
    expect(t).toBe('ANNA\n(softly)\nHi.\nBye.\n\nEnd.\n')
  })
  it('keeps parentheses that are already there', () => {
    expect(out([el('character', 'A'), el('parenthetical', '(x)'), el('dialogue', 'y')])).toContain('(x)\n')
    expect(out([el('character', 'A'), el('parenthetical', '(x)'), el('dialogue', 'y')])).not.toContain('((x))')
  })
  it('writes a blank line inside dialogue as two spaces', () => {
    expect(out([el('character', 'A'), el('dialogue', 'One.\n\nTwo.')])).toBe('A\nOne.\n  \nTwo.\n')
  })
  it('forces a cue without uppercase letters', () => {
    expect(out([el('character', '123'), el('dialogue', 'x')])).toBe('@123\nx\n')
  })
  it('forces a cue that starts like another element', () => {
    expect(out([el('character', '!bang'), el('dialogue', 'x')])).toBe('@!BANG\nx\n')
  })
  it('forces a cue that ends with a caret', () => {
    expect(out([el('character', 'bob^'), el('dialogue', 'x')])).toBe('@BOB^\nx\n')
  })
  it('forces a cue that looks like a heading', () => {
    expect(out([el('character', 'ext. man'), el('dialogue', 'x')])).toBe('@EXT. MAN\nx\n')
  })
  it('forces a cue with no dialogue after it', () => {
    expect(out([el('character', 'anna'), el('action', 'x')])).toBe('@ANNA\n\nx\n')
  })
  it('keeps a cue extension as plain', () => {
    expect(out([el('character', 'anna (v.o.)'), el('dialogue', 'x')])).toBe('ANNA (V.O.)\nx\n')
  })
})

describe('toFountain transitions and action', () => {
  it('writes a TO: transition plain and uppercased', () => {
    expect(out([el('transition', 'cut to:')])).toBe('CUT TO:\n')
  })
  it('forces other transitions', () => {
    expect(out([el('transition', 'Fade out.')])).toBe('> FADE OUT.\n')
  })
  it('drops a trailing less-than sign', () => {
    expect(out([el('transition', 'Fade out <')])).toBe('> FADE OUT\n')
  })
  it('forces action that starts with a marker', () => {
    for (const a of ['.dot', '@at', '!bang', '~tilde', '=eq', '#hash', '>gt', '[[n]]', '=== x']) {
      expect(out([el('action', a)])).toBe(`!${a}\n`)
    }
  })
  it('forces action that looks like a heading or transition', () => {
    expect(out([el('action', 'INT. FAKE')])).toBe('!INT. FAKE\n')
    expect(out([el('action', 'SMASH CUT TO:')])).toBe('!SMASH CUT TO:\n')
  })
  it('keeps a lone all-caps action plain', () => {
    expect(out([el('action', 'BANG')])).toBe('BANG\n')
  })
  it('forces a multi-line action whose first line looks like a cue', () => {
    expect(out([el('action', 'BANG\nthen quiet')])).toBe('!BANG\nthen quiet\n')
  })
  it('forces the whole action once when a later line starts with a tilde', () => {
    expect(out([el('action', 'a\n~b')])).toBe('!a\n~b\n')
  })
  it('writes a blank line inside action as two spaces', () => {
    expect(out([el('action', 'a\n\nb')])).toBe('a\n  \nb\n')
  })
  it('escapes boneyard markers so they survive', () => {
    expect(out([el('action', 'a /* b */')])).toBe('a /\\* b \\*/\n')
  })
  it('escapes asterisks and underscores', () => {
    expect(out([el('action', '2 * 3 snake_case')])).toBe('2 \\* 3 snake\\_case\n')
  })
})

describe('fountainExporter', () => {
  it('has the registry fields', () => {
    expect(fountainExporter).toMatchObject({
      id: 'fountain', labelKey: 'export.formats.fountain', extension: 'fountain', mime: 'text/plain', kinds: ['screenplay'], model: 'script',
    })
  })
  it('exports UTF-8 bytes', async () => {
    const bytes = await fountainExporter.export(doc([el('action', 'Łódź')]))
    expect(new TextDecoder().decode(bytes)).toBe('Łódź\n')
  })
})
