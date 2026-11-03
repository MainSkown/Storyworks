import type { GameDoc, GameLine } from './gameModel'

const HEADER = ['item', 'node', 'line_id', 'speaker', 'text']

/** RFC 4180: quote a field holding a comma, quote, CR or LF; double inner quotes. */
export const csvField = (s: string): string => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

/** One row per line, in tree order; scripts have no node. UTF-8 BOM first so spreadsheets read accents. */
export function toGameCsv(doc: GameDoc): string {
  const rows: string[][] = [HEADER]
  const add = (item: string, node: string, l: GameLine) =>
    rows.push([item, node, l.lineId, l.speakerName ?? '', l.text])
  for (const it of doc.items) {
    if (it.type === 'script') for (const l of it.lines) add(it.title, '', l)
    else if (it.type === 'conversation')
      for (const n of it.nodes) if (n.type === 'lines') for (const l of n.lines) add(it.title, n.id, l)
  }
  return '﻿' + rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n'
}
