# Third-party notices

Storyworks bundles the components below. Each keeps its own licence. The full text of every npm and crate
licence is in the respective package; the MPL-2.0 text is in `licenses/MPL-2.0.txt` (also shipped inside the app
as a resource).

## Bundled data and fonts

| Component | Licence | Notes |
| --- | --- | --- |
| Polish Hunspell dictionary (`public/dictionaries/pl`, dictionary-pl 2.0.0, Polish Native Lang Project) | MPL-2.0 (offered under GPL / LGPL / MPL; used here under MPL-2.0) | Unmodified files. Full text: `licenses/MPL-2.0.txt`; original notice: `public/dictionaries/pl/LICENSE.txt` |
| English Hunspell dictionary (`public/dictionaries/en`, dictionary-en 4.0.0, SCOWL / Ispell) | MIT / BSD style | Notice: `public/dictionaries/en/LICENSE.txt` |
| Liberation Sans and Liberation Serif (`src/export/fonts`) | SIL Open Font License 1.1 | Used for PDF export. Notice: `src/export/fonts/LICENSE` |

Source for the Polish dictionary: <https://github.com/wooorm/dictionaries>. Changes to the dictionary files, if any
are ever made, must be published under MPL-2.0.

## Runtime dependencies (npm)

| Package | Licence |
| --- | --- |
| @quasar/extras, quasar | MIT |
| @tauri-apps/api | Apache-2.0 OR MIT |
| @tauri-apps/plugin-dialog, plugin-fs, plugin-opener | MIT OR Apache-2.0 |
| @tiptap/* (character-count, image, placeholder, text-align, underline, pm, starter-kit, vue-3) | MIT |
| @vue-flow/core | MIT |
| docx | MIT |
| markdown-it, markdown-it-footnote | MIT |
| nspell | MIT |
| pdfmake | MIT |
| pinia, vue, vue-i18n, vue-router | MIT |
| zod | MIT |

## Native (Rust) dependencies

| Crate | Licence |
| --- | --- |
| tauri, tauri-plugin-fs, -dialog, -opener, -persisted-scope | MIT OR Apache-2.0 |
| serde, serde_json | MIT OR Apache-2.0 |
| sysinfo | MIT |
| git2 (with vendored libgit2) | MIT OR Apache-2.0 (git2); libgit2 is GPL-2.0 with linking exception |

Transitive dependencies carry their own licences; list them with `cargo license` (in `src-tauri`) and
`yarn licenses list` when preparing a release.
