<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isTauri } from '../project/pickFolder'
import { useProjectStore } from '../project/store'
import type { ManuscriptNode } from '../project/schemas/manifest'
import { applyImport, type ApplyResult } from '../import/apply'
import { pickImportFilesNative, readBrowserFiles } from '../import/pick'
import { decodeUtf8 } from '../import/decode'
import { parseFountain, type FountainResult } from '../import/fountain'
import { buildFountainPlan } from '../import/fountainPlan'
import { buildPlan, loadImport, type ImportFile, type LoadedImport } from '../import/plan'
import type { SplitRule } from '../import/split'

const open = defineModel<boolean>({ required: true })
const { t } = useI18n()
const store = useProjectStore()

const files = ref<ImportFile[]>([])
// Screenplays import Fountain: one file, no split rule.
const isScript = computed(() => store.project?.manifest.kind === 'screenplay')
const fountain = ref<{ name: string; result: FountainResult } | null>(null)
const loaded = ref<LoadedImport | null>(null)
const badFiles = ref<string[]>([])
const rule = ref<SplitRule>('h1h2')
const placeKind = ref<'end' | 'after'>('end')
const titles = ref<Record<string, string>>({})
const skipped = ref<string[]>([])
const busy = ref(false)
const failure = ref('')
const result = ref<ApplyResult | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const pickBtn = ref<{ $el: HTMLElement } | null>(null)

const rules = computed(() =>
  (['h1h2', 'h1', 'break'] as const).map((value) => ({ value, label: t(`import.rule.${value}`) })),
)

const selectedTitle = computed(() => {
  const id = store.selectedId
  if (!id) return null
  const find = (nodes: ManuscriptNode[]): string | null => {
    for (const n of nodes) {
      if (n.id === id) return n.title
      const hit = find(n.children)
      if (hit !== null) return hit
    }
    return null
  }
  return find(store.tree)
})

const plan = computed(() =>
  isScript.value
    ? fountain.value
      ? buildFountainPlan(fountain.value.result, {
          fileBase: fountain.value.name.replace(/\.[^.]*$/, ''),
          placement:
            placeKind.value === 'after' && store.selectedId && selectedTitle.value !== null
              ? { kind: 'after', id: store.selectedId }
              : { kind: 'end' },
          sceneName: (n) => t('import.sceneName', { n }),
          sequenceName: (n) => t('import.sequenceName', { n }),
          edits: { titles: titles.value, skipped: skipped.value },
        })
      : null
    : loaded.value
    ? buildPlan(loaded.value, {
        rule: rule.value,
        placement:
          placeKind.value === 'after' && store.selectedId && selectedTitle.value !== null
            ? { kind: 'after', id: store.selectedId }
            : { kind: 'end' },
        sceneName: (n) => t('import.sceneName', { n }),
        edits: { titles: titles.value, skipped: skipped.value },
      })
    : null,
)

const includedCounts = computed(() => {
  let chapters = 0
  let scenes = 0
  let words = 0
  for (const c of plan.value?.chapters ?? []) {
    const n = c.scenes.filter((s) => s.included).length
    if (!c.included || n === 0) continue
    chapters++
    scenes += n
    words += c.words
  }
  return { chapters, scenes, words }
})
const canImport = computed(() => !busy.value && !store.readOnly && includedCounts.value.chapters > 0)

watch(open, (isOpen) => {
  if (!isOpen) return
  files.value = []
  loaded.value = null
  fountain.value = null
  badFiles.value = []
  rule.value = 'h1h2'
  placeKind.value = selectedTitle.value !== null ? 'after' : 'end'
  titles.value = {}
  skipped.value = []
  busy.value = false
  failure.value = ''
  result.value = null
})

// Item ids mean something else under another rule, so edits start over.
watch(rule, () => {
  titles.value = {}
  skipped.value = []
})

function accept(picked: ImportFile[]): void {
  if (!picked.length) return
  files.value = picked
  titles.value = {}
  skipped.value = []
  failure.value = ''
  if (isScript.value) {
    const file = picked[0]!
    const d = decodeUtf8(file.name, file.bytes)
    if (d.ok) {
      fountain.value = { name: file.name, result: parseFountain(d.text) }
      badFiles.value = []
    } else {
      fountain.value = null
      badFiles.value = [d.error.file]
    }
    return
  }
  const r = loadImport(picked)
  if (r.ok) {
    loaded.value = r.loaded
    badFiles.value = []
  } else {
    loaded.value = null
    badFiles.value = r.errors.map((e) => e.file)
  }
}

async function choose(): Promise<void> {
  failure.value = ''
  try {
    if (isTauri()) accept(await pickImportFilesNative(isScript.value))
    else fileInput.value?.click()
  } catch (e) {
    failure.value = t('import.readFailed', { message: e instanceof Error ? e.message : String(e) })
  }
}

async function onBrowserFiles(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  accept(await readBrowserFiles(input.files))
  input.value = ''
}

function setTitle(id: string, value: string): void {
  titles.value = { ...titles.value, [id]: value }
}
function setIncluded(id: string, on: boolean): void {
  const rest = skipped.value.filter((s) => s !== id)
  skipped.value = on ? rest : [...rest, id]
}

async function submit(): Promise<void> {
  if (!canImport.value || !plan.value) return
  busy.value = true
  failure.value = ''
  try {
    const r = await applyImport(store, plan.value, files.value)
    result.value = r
    if (r.firstSceneId) store.selectedId = r.firstSceneId
  } catch (e) {
    failure.value = t('import.failed', { message: e instanceof Error ? e.message : String(e) })
  } finally {
    busy.value = false
  }
}

const warningText = (code: string, ref: string, file: string): string =>
  t(`import.warning.${code}`, { ref, file })

async function focusPick(): Promise<void> {
  await nextTick()
  pickBtn.value?.$el?.focus()
}
</script>

<template>
  <QDialog v-model="open" :persistent="busy" @show="focusPick">
    <QCard class="dialog" role="dialog" aria-labelledby="import-title">
      <QCardSection class="head">
        <h2 id="import-title" class="title">{{ t(isScript ? 'import.fountain.title' : 'import.title') }}</h2>
      </QCardSection>

      <template v-if="result">
        <QCardSection role="status" class="result">
          <p class="result-line">
            {{
              t('import.result', {
                chapters: t('import.chapters', result.chapters, { named: { n: result.chapters } }),
                scenes: t('import.scenes', result.scenes, { named: { n: result.scenes } }),
                words: result.words,
              })
            }}
          </p>
          <p v-if="result.backup" class="muted">{{ t('import.backupMade') }}</p>
          <p v-else class="muted">{{ t('import.backupExisting') }}</p>
          <ul v-if="result.warnings.length" class="warnings">
            <li v-for="(w, i) in result.warnings" :key="i">{{ warningText(w.code, w.ref, w.file) }}</li>
          </ul>
        </QCardSection>
        <QCardActions align="right">
          <QBtn unelevated no-caps color="primary" autofocus :label="t('import.done')" @click="open = false" />
        </QCardActions>
      </template>

      <template v-else>
        <QCardSection class="body">
          <div class="pick-row">
            <QBtn
              ref="pickBtn"
              outline
              no-caps
              icon="upload_file"
              :disable="busy"
              :label="files.length ? t('import.chooseOther') : t('import.choose')"
              @click="choose"
            />
            <span v-if="files.length" class="muted" data-test="import-files">
              {{ t('import.fileCount', files.length, { named: { n: files.length } }) }}
            </span>
            <span v-else class="muted">{{ t(isScript ? 'import.fountain.hint' : 'import.hint') }}</span>
            <input
              ref="fileInput"
              type="file"
              :multiple="!isScript"
              :accept="isScript ? '.fountain,.txt,text/plain' : '.md,.markdown,.txt,text/markdown,text/plain'"
              class="sr-only"
              tabindex="-1"
              :aria-label="t('import.choose')"
              data-test="import-input"
              @change="onBrowserFiles"
            />
          </div>

          <p v-if="badFiles.length" class="error" role="alert">
            {{ t('import.invalidUtf8', { files: badFiles.map((f) => `“${f}”`).join(', ') }, badFiles.length) }}
          </p>
          <p v-if="failure" class="error" role="alert">{{ failure }}</p>

          <template v-if="plan">
            <div class="options">
              <QSelect
                v-if="!isScript"
                v-model="rule"
                dense
                outlined
                emit-value
                map-options
                options-dense
                class="rule"
                :disable="busy"
                :label="t('import.rule.label')"
                :options="rules"
              />
              <fieldset class="placement">
                <legend>{{ t('import.placement.label') }}</legend>
                <QRadio v-model="placeKind" dense val="end" :disable="busy" :label="t('import.placement.end')" />
                <QRadio
                  v-if="selectedTitle !== null"
                  v-model="placeKind"
                  dense
                  val="after"
                  :disable="busy"
                  :label="t('import.placement.after', { title: selectedTitle })"
                />
              </fieldset>
            </div>

            <p v-if="plan.chapters.length === 0" class="muted">{{ t('import.nothing') }}</p>
            <ul v-else class="preview" role="tree" :aria-label="t('import.preview')">
              <li v-for="c in plan.chapters" :key="c.id" role="none">
                <div class="row chapter">
                  <QCheckbox
                    dense
                    :model-value="c.included"
                    :disable="busy"
                    :aria-label="t('import.include', { title: c.title })"
                    @update:model-value="setIncluded(c.id, $event)"
                  />
                  <QIcon name="book" size="1rem" aria-hidden="true" />
                  <input
                    class="name"
                    type="text"
                    :value="c.title"
                    :disabled="busy || !c.included"
                    :aria-label="t('import.renameChapter', { title: c.title })"
                    @input="setTitle(c.id, ($event.target as HTMLInputElement).value)"
                  />
                  <span class="words">{{ t('import.words', c.words, { named: { n: c.words } }) }}</span>
                </div>
                <ul class="scenes" role="group">
                  <li v-for="s in c.scenes" :key="s.id" role="none">
                    <div class="row scene">
                      <QCheckbox
                        dense
                        :model-value="s.included && c.included"
                        :disable="busy || !c.included"
                        :aria-label="t('import.include', { title: s.title })"
                        @update:model-value="setIncluded(s.id, $event)"
                      />
                      <QIcon name="description" size="1rem" aria-hidden="true" />
                      <input
                        class="name"
                        type="text"
                        :value="s.title"
                        :disabled="busy || !c.included || !s.included"
                        :aria-label="t('import.renameScene', { title: s.title })"
                        @input="setTitle(s.id, ($event.target as HTMLInputElement).value)"
                      />
                      <span class="words">{{ t('import.words', s.words, { named: { n: s.words } }) }}</span>
                    </div>
                  </li>
                </ul>
              </li>
            </ul>

            <div v-if="isScript && fountain && (fountain.result.skipped.length || fountain.result.noSceneHeadings)" class="warn-box" role="status">
              <h3 class="warn-title">{{ t('import.fountain.skippedTitle') }}</h3>
              <ul class="warnings">
                <li v-if="fountain.result.noSceneHeadings">{{ t('import.fountain.noHeadings') }}</li>
                <li v-for="s in fountain.result.skipped" :key="s.construct">
                  {{ t(`import.fountain.skipped.${s.construct}`, { n: s.count }) }}
                </li>
              </ul>
            </div>

            <div v-if="plan.warnings.length" class="warn-box" role="status">
              <h3 class="warn-title">{{ t('import.warnings') }}</h3>
              <ul class="warnings">
                <li v-for="(w, i) in plan.warnings" :key="i">{{ warningText(w.code, w.ref, w.file) }}</li>
              </ul>
            </div>
          </template>
        </QCardSection>

        <QCardActions align="between" class="foot">
          <span v-if="plan" class="muted" data-test="import-summary">
            {{
              t('import.summary', {
                chapters: includedCounts.chapters,
                scenes: includedCounts.scenes,
                words: includedCounts.words,
              })
            }}
          </span>
          <span v-else />
          <span class="buttons">
            <QBtn flat no-caps :disable="busy" :label="t('import.cancel')" @click="open = false" />
            <QBtn
              unelevated
              no-caps
              color="primary"
              :loading="busy"
              :disable="!canImport"
              :label="t('import.import')"
              @click="submit"
            />
          </span>
        </QCardActions>
      </template>
    </QCard>
  </QDialog>
</template>

<style scoped>
.dialog {
  width: 42rem;
  max-width: 94vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-sheet);
  color: var(--text-primary);
  border: 1px solid var(--border);
}
.title {
  margin: 0;
  font-size: 1.15rem;
}
.body {
  overflow-y: auto;
  min-height: 0;
}
.pick-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.muted {
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.error {
  margin: 0.75rem 0 0;
  color: var(--text-error, #c0392b);
}
.options {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
  flex-wrap: wrap;
  margin: 1rem 0 0.75rem;
}
.rule {
  min-width: 16rem;
}
.placement {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  border: 0;
}
.placement legend {
  padding: 0;
  margin-bottom: 0.25rem;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.preview,
.scenes {
  list-style: none;
  margin: 0;
  padding: 0;
}
.preview {
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  padding: 0.375rem;
  max-height: 20rem;
  overflow-y: auto;
}
.scenes {
  margin-left: 1.5rem;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.125rem 0;
}
.chapter {
  font-weight: 600;
}
.name {
  flex: 1;
  min-width: 0;
  padding: 0.125rem 0.375rem;
  border: 1px solid transparent;
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font: inherit;
}
.name:hover:not(:disabled) {
  border-color: var(--border);
}
.name:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 0;
  background: var(--bg-raised);
}
.name:disabled {
  opacity: 0.55;
  text-decoration: line-through;
}
.words {
  flex: none;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}
.warn-box {
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-raised);
}
.warn-title {
  margin: 0 0 0.25rem;
  font-size: 0.9rem;
}
.warnings {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}
.result-line {
  margin: 0 0 0.5rem;
  font-size: 1rem;
}
.foot {
  padding: 0.5rem 1rem 0.75rem;
}
.buttons {
  display: inline-flex;
  gap: 0.5rem;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
