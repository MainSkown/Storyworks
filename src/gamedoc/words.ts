import { countWords } from '../editor/wordCount'

const w = (text: string) => (text.trim() === '' ? 0 : text.trim().split(/\s+/).length)

interface Parts {
  overview: unknown
  mechanics: { summary: string; description: unknown; parameters: { name: string; value: string }[] }[]
  glossary: { term: string; definition: string }[]
}

/** Words of the whole game document; kept apart from dialogue words and the writing goals. */
export const gameDocWords = (p: Parts): number =>
  (p.overview ? countWords(p.overview) : 0) +
  p.mechanics.reduce(
    (n, m) =>
      n + w(m.summary) + countWords(m.description) + m.parameters.reduce((k, x) => k + w(x.name) + w(x.value), 0),
    0,
  ) +
  p.glossary.reduce((n, e) => n + w(e.term) + w(e.definition), 0)
