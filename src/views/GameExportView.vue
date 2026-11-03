<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '../project/store'
import { ExportError } from '../export/build'
import { registerBuiltInExporters } from '../export'
import { buildGameDoc } from '../export/gameDoc'
import { buildGameDocument, gameDocumentTexts, type GameDocumentOptions } from '../export/gameDocument'
import type { ExportWarning } from '../export/model'
import { bookExportersFor, gameExportersFor } from '../export/registry'
import { safeFileName, saveFile, showInFolder } from '../export/saveFile'
import { projectGameSource } from '../export/source'
import { isTauri } from '../project/pickFolder'
import { log } from '../safety/log'

type Card = 'data' | 'doc'

const { t } = useI18n()
const project = useProjectStore()

registerBuiltInExporters()
const dataExporters = computed(() => gameExportersFor('game'))
const docExporters = computed(() => bookExportersFor('game'))
const dataFormat = ref(dataExporters.value[0]?.id ?? '')
const docFormat = ref(docExporters.value[0]?.id ?? '')
const dataOptions = computed(() => dataExporters.value.map((e) => ({ value: e.id, label: t(e.labelKey) })))
const docFormatOptions = computed(() => docExporters.value.map((e) => ({ value: e.id, label: t(e.labelKey) })))
const sections = reactive<GameDocumentOptions>({ overview: true, mechanics: true, glossary: true })
const noSections = computed(() => !sections.overview && !sections.mechanics && !sections.glossary)

// A saved notice no longer describes the file once the choices change.
watch([sections, docFormat, dataFormat], () => (done.value = null), { deep: true })

const busy = ref<Card | null>(null)
const error = ref<{ card: Card; text: string } | null>(null)
const done = ref<{ card: Card; path?: string; warnings: ExportWarning[] } | null>(null)

async function run(card: Card): Promise<void> {
  const source = projectGameSource()
  if (!source) return
  busy.value = card
  error.value = null
  done.value = null
  try {
    await project.flush()
    let bytes: Uint8Array
    let warnings: ExportWarning[] = []
    let exporter
    if (card === 'data') {
      exporter = dataExporters.value.find((e) => e.id === dataFormat.value)
      if (!exporter) return
      bytes = await exporter.export(await buildGameDoc(source))
    } else {
      exporter = docExporters.value.find((e) => e.id === docFormat.value)
      if (!exporter) return
      const doc = buildGameDocument(source, { ...sections }, gameDocumentTexts(t))
      if (!doc.chapters.length) {
        error.value = { card, text: t('export.game.empty') }
        return
      }
      warnings = doc.warnings
      bytes = await exporter.export(doc)
    }
    const saved = await saveFile({
      bytes,
      name: safeFileName(source.meta.title, exporter.extension),
      extension: exporter.extension,
      mime: exporter.mime,
    })
    if (saved) done.value = { card, ...saved, warnings }
  } catch (e) {
    log.error('export.failed', e)
    error.value = {
      card,
      text:
        e instanceof ExportError
          ? t(`export.game.error.${e.code}`, { detail: e.detail ?? '' })
          : t('export.error.failed', { message: e instanceof Error ? e.message : String(e) }),
    }
  } finally {
    busy.value = null
  }
}

const warningText = (w: ExportWarning) => t(`export.warning.${w.kind}`, { detail: w.detail })
</script>

<template>
  <section class="page">
    <h1 class="title">{{ t('export.title') }}</h1>

    <div class="cards">
      <fieldset class="group">
        <legend>{{ t('export.game.dataTitle') }}</legend>
        <p class="hint">{{ t('export.game.dataHint') }}</p>
        <label id="exg-data-format">{{ t('export.format') }}</label>
        <QSelect
          v-model="dataFormat"
          :options="dataOptions"
          emit-value
          map-options
          dense
          outlined
          class="narrow"
          aria-labelledby="exg-data-format"
        />
        <div class="actions">
          <QBtn
            unelevated
            no-caps
            color="primary"
            icon="ios_share"
            :label="t('export.run')"
            :loading="busy === 'data'"
            :disable="!!busy"
            @click="run('data')"
          />
        </div>
        <QBanner v-if="error?.card === 'data'" rounded class="err" role="alert">{{ error.text }}</QBanner>
        <div v-if="done?.card === 'data'" class="ok" role="status">
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
        </div>
      </fieldset>

      <fieldset class="group">
        <legend>{{ t('export.game.docTitle') }}</legend>
        <p class="hint">{{ t('export.game.docHint') }}</p>
        <label id="exg-doc-format">{{ t('export.format') }}</label>
        <QSelect
          v-model="docFormat"
          :options="docFormatOptions"
          emit-value
          map-options
          dense
          outlined
          class="narrow"
          aria-labelledby="exg-doc-format"
        />
        <fieldset class="sub">
          <legend>{{ t('export.game.sections') }}</legend>
          <QCheckbox v-model="sections.overview" :label="t('export.game.overview')" />
          <QCheckbox v-model="sections.mechanics" :label="t('export.game.mechanics')" />
          <QCheckbox v-model="sections.glossary" :label="t('export.game.glossary')" />
        </fieldset>
        <p v-if="noSections" class="hint">{{ t('export.game.nothingSelected') }}</p>
        <div class="actions">
          <QBtn
            unelevated
            no-caps
            color="primary"
            icon="ios_share"
            :label="t('export.run')"
            :loading="busy === 'doc'"
            :disable="!!busy || noSections"
            @click="run('doc')"
          />
        </div>
        <QBanner v-if="error?.card === 'doc'" rounded class="err" role="alert">{{ error.text }}</QBanner>
        <div v-if="done?.card === 'doc'" class="ok" role="status">
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
      </fieldset>
    </div>
  </section>
</template>

<style scoped>
.page {
  max-width: 44rem;
  margin-inline: auto;
  padding: 1.25rem 1.5rem;
  color: var(--text-primary);
}
.title {
  margin: 0 0 1rem;
  font-size: 1.15rem;
}
.cards {
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
  gap: 0.5rem;
}
.group > legend,
.sub > legend {
  padding: 0 0.4rem;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-secondary);
}
.sub {
  margin: 0;
  padding: 0;
  border: 0;
  display: flex;
  flex-direction: column;
}
.narrow {
  max-width: 16rem;
}
.hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.actions {
  display: flex;
  gap: 0.5rem;
}
.ok p,
.err {
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
</style>
