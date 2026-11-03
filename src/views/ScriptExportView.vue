<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '../project/store'
import { ExportError } from '../export/build'
import { registerBuiltInExporters } from '../export'
import type { ExportWarning } from '../export/model'
import { scriptExportersFor } from '../export/registry'
import { safeFileName, saveFile, showInFolder } from '../export/saveFile'
import { prepareScript } from '../export/scriptDoc'
import type { ScriptExportOptions } from '../export/scriptOptions'
import { projectScriptSource } from '../export/source'
import { isTauri } from '../project/pickFolder'
import { log } from '../safety/log'

const { t } = useI18n()
const project = useProjectStore()
const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

registerBuiltInExporters()
const exporters = computed(() => scriptExportersFor('screenplay'))
const formatId = ref(exporters.value[0]?.id ?? '')
const formatOptions = computed(() => exporters.value.map((e) => ({ value: e.id, label: t(e.labelKey) })))
const isFountain = computed(() => formatId.value === 'fountain')

const options = reactive<ScriptExportOptions>(plain(project.scriptExport))
const readOnly = computed(() => !!project.readOnly)
// Last-used options are kept per screenplay; the sequence selection is not.
watch(
  options,
  (o) => {
    if (!readOnly.value) project.setScriptExport(plain(o))
  },
  { deep: true },
)
const pageSizes = ['Letter', 'A4']

const sequences = computed(() => {
  const out: { id: string; title: string; scenes: number; words: number }[] = []
  const walk = (nodes: typeof project.tree) => {
    for (const n of nodes) {
      if (n.type === 'part') walk(n.children)
      else if (n.type === 'chapter')
        out.push({
          id: n.id,
          title: n.title,
          scenes: n.children.filter((c) => c.type === 'scene').length,
          words: project.wordCounts.get(n.id) ?? 0,
        })
    }
  }
  walk(project.tree)
  return out
})
const hasLooseScenes = computed(() => project.tree.some((n) => n.type === 'scene'))
const selected = ref<Set<string>>(new Set())
onMounted(() => (selected.value = new Set(sequences.value.map((s) => s.id))))
function setSequence(id: string, on: boolean): void {
  const next = new Set(selected.value)
  if (on) next.add(id)
  else next.delete(id)
  selected.value = next
}
const selectAll = () => (selected.value = new Set(sequences.value.map((s) => s.id)))
const selectNone = () => (selected.value = new Set())
const chosen = computed(() => sequences.value.filter((s) => selected.value.has(s.id)))
const scenes = computed(() => chosen.value.reduce((n, s) => n + s.scenes, 0))
const words = computed(() => chosen.value.reduce((n, s) => n + s.words, 0))
const canExport = computed(() => !busy.value && (chosen.value.length > 0 || hasLooseScenes.value))

const busy = ref(false)
const error = ref('')
const done = ref<{ path?: string; warnings: ExportWarning[] } | null>(null)

async function run(): Promise<void> {
  const exporter = exporters.value.find((e) => e.id === formatId.value)
  const source = projectScriptSource()
  if (!exporter || !source) return
  busy.value = true
  error.value = ''
  done.value = null
  try {
    await project.flush()
    const doc = await prepareScript(source, [...selected.value], plain(options))
    const bytes = await exporter.export(doc)
    const saved = await saveFile({
      bytes,
      name: safeFileName(source.meta.title, exporter.extension),
      extension: exporter.extension,
      mime: exporter.mime,
    })
    if (saved) done.value = { ...saved, warnings: doc.warnings }
  } catch (e) {
    log.error('export.failed', e)
    error.value =
      e instanceof ExportError
        ? t(`export.script.error.${e.code}`, { detail: e.detail ?? '' })
        : t('export.error.failed', { message: e instanceof Error ? e.message : String(e) })
  } finally {
    busy.value = false
  }
}

const warningText = (w: ExportWarning) => t(`export.warning.${w.kind}`, { detail: w.detail })
</script>

<template>
  <section class="page">
    <h1 class="title">{{ t('export.title') }}</h1>

    <div class="cols">
      <div class="form">
        <fieldset class="group">
          <legend id="ex-format">{{ t('export.format') }}</legend>
          <QSelect
            v-model="formatId"
            :options="formatOptions"
            emit-value
            map-options
            dense
            outlined
            class="narrow"
            aria-labelledby="ex-format"
          />
        </fieldset>

        <fieldset class="group">
          <legend>{{ t('export.script.sequences') }}</legend>
          <div class="row">
            <QBtn flat dense no-caps :label="t('export.selectAll')" @click="selectAll" />
            <QBtn flat dense no-caps :label="t('export.selectNone')" @click="selectNone" />
          </div>
          <ul class="chapters">
            <li v-for="s in sequences" :key="s.id">
              <QCheckbox
                :model-value="selected.has(s.id)"
                :label="s.title"
                @update:model-value="setSequence(s.id, $event)"
              />
              <span class="words">{{ t('import.scenes', s.scenes, { named: { n: s.scenes } }) }} · {{ t('import.words', s.words, { named: { n: s.words } }) }}</span>
            </li>
          </ul>
          <p v-if="hasLooseScenes" class="hint">{{ t('export.script.looseScenes') }}</p>
        </fieldset>

        <fieldset class="group">
          <legend>{{ t('export.frontMatter') }}</legend>
          <QToggle v-model="options.titlePage" :label="t('export.titlePage')" />
          <p class="hint">{{ t('export.script.titlePageHint') }}</p>
        </fieldset>

        <fieldset v-if="!isFountain" class="group">
          <legend>{{ t('export.pageSetup') }}</legend>
          <div class="grid">
            <label id="ex-size">{{ t('export.pageSize') }}</label>
            <QSelect v-model="options.pageSize" :options="pageSizes" dense outlined class="narrow" aria-labelledby="ex-size" />
          </div>
          <QToggle v-model="options.sceneNumbers" :label="t('export.script.sceneNumbers')" />
          <QToggle v-model="options.pageNumbers" :label="t('export.pageNumbers')" />
          <QToggle v-model="options.moreContd" :label="t('export.script.moreContd')" />
        </fieldset>
        <p v-else class="hint">{{ t('export.script.fountainHint') }}</p>
      </div>

      <aside class="summary" aria-live="polite">
        <h2>{{ t('export.summary') }}</h2>
        <p>{{ t('export.script.summarySequences', { n: chosen.length }) }}</p>
        <p>{{ t('export.script.summaryScenes', { n: scenes }) }}</p>
        <p>{{ t('export.summaryWords', { n: words }) }}</p>
        <p v-if="!isFountain">{{ t('write.pagesRuntime', { pages: project.pageStats.pages, min: project.pageStats.minutes }) }}</p>
        <QBtn
          unelevated
          no-caps
          color="primary"
          icon="ios_share"
          :label="t('export.run')"
          :loading="busy"
          :disable="!canExport"
          @click="run"
        />
        <p v-if="!canExport && !busy" class="hint">{{ t('export.script.nothingSelected') }}</p>
        <QBanner v-if="error" rounded class="err" role="alert">{{ error }}</QBanner>
        <div v-if="done" class="ok" role="status">
          <p>{{ done.path ? t('export.savedTo', { path: done.path }) : t('export.downloaded') }}</p>
          <QBtn
            v-if="done.path && isTauri()"
            flat
            dense
            no-caps
            icon="folder_open"
            :label="t('export.showInFolder')"
            @click="showInFolder(done.path)"
          />
          <template v-if="done.warnings.length">
            <p class="warn-title">{{ t('export.warnings', { n: done.warnings.length }) }}</p>
            <ul class="warn">
              <li v-for="(w, i) in done.warnings" :key="i">{{ warningText(w) }}</li>
            </ul>
          </template>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.page {
  max-width: 64rem;
  margin-inline: auto;
  padding: 1.25rem 1.5rem;
  color: var(--text-primary);
}
.title {
  margin: 0 0 1rem;
  font-size: 1.15rem;
}
.cols {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18rem;
  gap: 1.5rem;
  align-items: start;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.group {
  margin: 0;
  padding: 0.75rem 1rem 1rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.group legend {
  padding: 0 0.4rem;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-secondary);
}
.narrow {
  max-width: 14rem;
}
.row {
  display: flex;
  gap: 0.5rem;
}
.chapters {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 16rem;
  overflow: auto;
}
.chapters li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.words,
.hint {
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.hint {
  margin: 0 0 0.25rem;
}
.grid {
  display: grid;
  grid-template-columns: 9rem auto;
  gap: 0.5rem 1rem;
  align-items: center;
}
.summary {
  position: sticky;
  top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-sheet);
}
.summary h2 {
  margin: 0;
  font-size: 1rem;
}
.summary p {
  margin: 0;
}
.err {
  background: var(--bg-sunken, transparent);
  border: 1px solid var(--section-checks);
}
.warn-title {
  margin-top: 0.5rem;
  font-weight: 600;
}
.warn {
  margin: 0;
  padding-inline-start: 1.1rem;
  font-size: 0.8125rem;
}
@media (max-width: 52rem) {
  .cols {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
