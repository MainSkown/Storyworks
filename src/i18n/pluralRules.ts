/** vue-i18n only maps 2-3 forms by default. Polish: [zero/other, one, few, many] -> 1 / 2-4 (not 12-14) / other. */
export function polishPlural(choice: number, choicesLength: number): number {
  if (choicesLength !== 4) return choice === 1 ? 0 : 1
  if (choice === 1) return 1
  const last = choice % 10
  const lastTwo = choice % 100
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return 2
  return 3
}
