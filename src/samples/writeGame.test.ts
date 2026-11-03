// Regenerates public/samples/game-* when run as `yarn samples` (SAMPLES_WRITE=1); otherwise checks they are current.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SAMPLE_INDEX } from './build'
import { buildGameSample, gameSampleDir } from './game/build'
import type { SampleLang } from './text'

const PUBLIC = join(__dirname, '../../public/samples')
const write = process.env.SAMPLES_WRITE === '1'

describe.each(['en', 'pl'] as SampleLang[])('game sample files (%s)', (lang) => {
  it(write ? 'are written' : 'are up to date with the builder', async () => {
    const files = await buildGameSample(lang)
    const root = join(PUBLIC, gameSampleDir(lang))
    if (write) {
      rmSync(root, { recursive: true, force: true })
      for (const [p, text] of Object.entries(files)) {
        mkdirSync(dirname(join(root, p)), { recursive: true })
        writeFileSync(join(root, p), text)
      }
      writeFileSync(join(root, SAMPLE_INDEX), JSON.stringify(Object.keys(files), null, 2) + '\n')
      return
    }
    for (const [p, text] of Object.entries(files)) expect(readFileSync(join(root, p), 'utf8')).toBe(text)
    expect(JSON.parse(readFileSync(join(root, SAMPLE_INDEX), 'utf8'))).toEqual(Object.keys(files))
  })
})
