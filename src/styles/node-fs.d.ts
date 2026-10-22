// Minimal typing for the contrast test (no @types/node in the project).
declare module 'node:fs' {
  export function readFileSync(path: URL, encoding: 'utf8'): string
}
