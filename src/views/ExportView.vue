<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import NumberField from '../components/NumberField.vue'
import { useCodexStore } from '../codex/store'
import { useProjectStore } from '../project/store'
import { useTimelinesStore } from '../timeline/store'
import type { ManuscriptNode } from '../project/schemas/manifest'
import { ExportError } from '../export/build'
import { registerBuiltInExporters } from '../export'
import type { ExportOptions } from '../export/options'
import { prepareExport } from '../export/prepare'
import { exportersFor } from '../export/registry'
import { safeFileName, saveFile, showInFolder } from '../export/saveFile'
import { projectExportSource } from '../export/source'
import { isTauri } from '../project/pickFolder'
import type { ExportWarning } from '../export/model'
import { log } from '../safety/log'

const { t } = useI18n()
const project = useProjectStore()
const codex = useCodexStore()
const timelines = useTimelinesStore()

const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

registerBuiltInExporters()
const exporters = computed(() => exportersFor('book'))
const formatId = ref(exporters.value[0]?.id ?? '')
const formatOptions = computed(() =>
  exporters.value.map((e) => ({ value: e.id, label: t(e.labelKey) })),
)

const options = reactive<ExportOptions>(plain(project.exportSettings))
const readOnly = computed(() => !!project.readOnly)

// Last-used options are kept per book; the chapter selection is not.
watch(
  options,
  (o) => {
    if (readOnly.value) return
    project.setExportSettings(plain(o))
  },
  { deep: true },
)

const chapters = computed(() => {
  const out: { id: string; title: string; part?: string; words: number }[] = []
  const walk = (nodes: ManuscriptNode[], part?: string) => {
    for (const n of nodes) {
      if (n.type === 'part') walk(n.children, n.title)
      else if (n.type === 'chapter')
        out.push({ id: n.id, title: n.title, part, words: project.wordCounts.get(n.id) ?? 0 })
    }
  }
  walk(project.tree)
  return out
})
const selected = ref<Set<string>>(new Set())
onMounted(() => (selected.value = new Set(chapters.value.map((c) => c.id))))

function setChapter(id: string, on: boolean): void {
  const next = new Set(selected.value)
  if (on) next.add(id)
  else next.delete(id)
  selected.value = next
}
const selectAll = () => (selected.value = new Set(chapters.value.map((c) => c.id)))
const selectNone = () => (selected.value = new Set())

const chosen = computed(() => chapters.value.filter((c) => selected.value.has(c.id)))
const words = computed(() => chosen.value.reduce((n, c) => n + c.words, 0))
const canExport = computed(() => chosen.value.length > 0 && !busy.value && !!formatId.value)

const pageSizes = ['A4', 'A5', 'Letter'] as const
const fonts = computed(() => [
  { value: 'serif', label: t('export.font.serif') },
  { value: 'sans', label: t('export.font.sans') },
])
const spacings = [1, 1.15, 1.4, 1.5, 2]
const headers = computed(() =>
  (['none', 'book', 'chapter'] as const).map((v) => ({ value: v, label: t(`export.header.${v}`) })),
)
const typeChoices = computed(() => codex.types.map((ty) => ({ value: ty.id, label: ty.name })))
const timelineChoices = computed(() =>
  timelines.loadedTimelines.map((tl) => ({ value: tl.id, label: tl.name })),
)

function toggleAppendix(kind: 'personae' | 'glossary', on: boolean): void {
  const a = options.appendices[kind]
  a.on = on
  if (!on || a.typeIds.length) return
  // Character (listed first) goes to the personae; every other type to the glossary.
  const ids = codex.types.map((ty) => ty.id)
  a.typeIds = kind === 'personae' ? ids.slice(0, 1) : ids.slice(1)
}
function toggleChronology(on: boolean): void {
  const c = options.appendices.chronology
  c.on = on
  if (on && !c.timelineId) c.timelineId = timelines.loadedTimelines[0]?.id ?? null
}

const busy = ref(false)
const error = ref('')
const done = ref<{ path?: string; warnings: ExportWarning[] } | null>(null)

async function run(): Promise<void> {
  const exporter = exporters.value.find((e) => e.id === formatId.value)
  const source = projectExportSource({
    titles: {
      personae: t('export.appendix.personae'),
      glossary: t('export.appendix.glossary'),
      chronology: t('export.appendix.chronology'),
    },
    labels: { firstAppearance: t('export.firstAppearance') },
  })
  if (!exporter || !source) return
  busy.value = true
  error.value = ''
  done.value = null
  try {
    await project.flush()
    const doc = await prepareExport(source, [...selected.value], plain(options))
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
        ? t(`export.error.${e.code}`, { detail: e.detail ?? '' })
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
          <legend>{{ t('export.chapters') }}</legend>
          <div class="row">
            <QBtn flat dense no-caps :label="t('export.selectAll')" @click="selectAll" />
            <QBtn flat dense no-caps :label="t('export.selectNone')" @click="selectNone" />
          </div>
          <ul class="chapters">
            <li v-for="c in chapters" :key="c.id">
              <QCheckbox
                :model-value="selected.has(c.id)"
                :label="c.part ? `${c.part} · ${c.title}` : c.title"
                @update:model-value="setChapter(c.id, $event)"
              />
              <span class="words">{{ t('export.words', { n: c.words }) }}</span>
            </li>
          </ul>
        </fieldset>

        <fieldset class="group">
          <legend>{{ t('export.frontMatter') }}</legend>
          <QToggle v-model="options.titlePage" :label="t('export.titlePage')" />
          <QToggle v-model="options.toc" :label="t('export.toc')" />
        </fieldset>

        <fieldset class="group">
          <legend>{{ t('export.pageSetup') }}</legend>
          <div class="grid">
            <label id="ex-size">{{ t('export.pageSize') }}</label>
            <QSelect
              v-model="options.pageSize"
              :options="[...pageSizes]"
              dense
              outlined
              class="narrow"
              aria-labelledby="ex-size"
            />
            <label id="ex-font">{{ t('export.fontFamily') }}</label>
            <QSelect
              v-model="options.font"
              :options="fonts"
              emit-value
              map-options
              dense
              outlined
              class="narrow"
              aria-labelledby="ex-font"
            />
            <label id="ex-fsize">{{ t('export.fontSize') }}</label>
            <NumberField
              v-model="options.fontSizePt"
              :min="6"
              :max="24"
              suffix="pt"
              labelledby="ex-fsize"
            />
            <label id="ex-spacing">{{ t('export.lineSpacing') }}</label>
            <QSelect
              v-model="options.lineSpacing"
              :options="spacings"
              dense
              outlined
              class="narrow"
              aria-labelledby="ex-spacing"
            />
            <template v-for="side in ['top', 'bottom', 'left', 'right'] as const" :key="side">
              <label :id="`ex-m-${side}`">{{ t(`export.margin.${side}`) }}</label>
              <NumberField
                v-model="options.marginMm[side]"
                :min="0"
                :max="60"
                suffix="mm"
                :labelledby="`ex-m-${side}`"
              />
            </template>
          </div>
        </fieldset>

        <fieldset class="group">
          <legend>{{ t('export.furniture') }}</legend>
          <QToggle v-model="options.pageNumbers" :label="t('export.pageNumbers')" />
          <div class="grid">
            <label id="ex-header">{{ t('export.runningHeader') }}</label>
            <QSelect
              v-model="options.runningHeader"
              :options="headers"
              emit-value
              map-options
              dense
              outlined
              class="narrow"
              aria-labelledby="ex-header"
            />
          </div>
        </fieldset>

        <fieldset class="group">
          <legend>{{ t('export.appendices') }}</legend>
          <p class="hint">{{ t('export.appendicesHint') }}</p>
          <QToggle
            :model-value="options.appendices.personae.on"
            :label="t('export.appendix.personae')"
            @update:model-value="toggleAppendix('personae', $event)"
          />
          <QSelect
            v-if="options.appendices.personae.on"
            v-model="options.appendices.personae.typeIds"
            :options="typeChoices"
            emit-value
            map-options
            multiple
            use-chips
            dense
            outlined
            :label="t('export.types')"
          />
          <QToggle
            :model-value="options.appendices.glossary.on"
            :label="t('export.appendix.glossary')"
            @update:model-value="toggleAppendix('glossary', $event)"
          />
          <QSelect
            v-if="options.appendices.glossary.on"
            v-model="options.appendices.glossary.typeIds"
            :options="typeChoices"
            emit-value
            map-options
            multiple
            use-chips
            dense
            outlined
            :label="t('export.types')"
          />
          <QToggle
            :model-value="options.appendices.chronology.on"
            :label="t('export.appendix.chronology')"
            @update:model-value="toggleChronology($event)"
          />
          <QSelect
            v-if="options.appendices.chronology.on"
            v-model="options.appendices.chronology.timelineId"
            :options="timelineChoices"
            emit-value
            map-options
            dense
            outlined
            :label="t('export.timeline')"
          />
        </fieldset>
      </div>

      <aside class="summary" aria-live="polite">
        <h2>{{ t('export.summary') }}</h2>
        <p>{{ t('export.summaryChapters', { n: chosen.length }) }}</p>
        <p>{{ t('export.summaryWords', { n: words }) }}</p>
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
        <p v-if="!chosen.length" class="hint">{{ t('export.nothingSelected') }}</p>
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
