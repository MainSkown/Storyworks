<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import { useProjectStore } from '../../project/store'
import { useSpellStore } from '../../spell/store'
import { DictionaryError, type DictionaryInfo } from '../../spell'
import type { DictScope } from '../../spell/types'
import ConfirmDialog from '../history/ConfirmDialog.vue'

const { t } = useI18n()
const project = useProjectStore()
const spell = useSpellStore()
const readOnly = computed(() => !!project.readOnly)

onMounted(() => void spell.refresh())
watch(
  () => project.rootPath,
  () => void spell.refresh(),
)

const error = ref('')
function show(e: unknown): void {
  error.value =
    e instanceof DictionaryError
      ? t(`spell.errors.${e.code}`)
      : e instanceof Error
        ? e.message
        : String(e)
}
async function attempt(fn: () => Promise<unknown>): Promise<boolean> {
  error.value = ''
  try {
    await fn()
    return true
  } catch (e) {
    show(e)
    return false
  }
}

const scopeLabel = (i: Pick<DictionaryInfo, 'source'>) => t(`spell.scope.${i.source}`)
const ref_ = (i: DictionaryInfo) => ({ name: i.name, scope: i.scope })
const rowKey = (i: DictionaryInfo) => `${i.source}:${i.name}`
const selected = (i: DictionaryInfo) => spell.isSelected(ref_(i))
const canToggle = (i: DictionaryInfo) => !readOnly.value && !i.shadowed
const otherScope = (i: DictionaryInfo): DictScope => (i.scope === 'local' ? 'global' : 'local')

function toggle(i: DictionaryInfo, on: boolean): void {
  if (!spell.toggle(ref_(i), on)) error.value = t('spell.errors.read-only')
}

// ---- copy / move ----
async function transfer(i: DictionaryInfo, mode: 'move' | 'copy'): Promise<void> {
  const to = otherScope(i)
  if (await attempt(() => spell.moveOrCopy(i.name, i.scope, to, mode)))
    Notify.create({
      type: 'positive',
      message: t(mode === 'move' ? 'spell.moved' : 'spell.copied', {
        name: i.name,
        scope: t(`spell.scopeName.${to}`),
      }),
    })
}
const canMove = (i: DictionaryInfo) => i.source !== 'bundled' && !i.readOnly

// ---- delete ----
const toDelete = ref<DictionaryInfo | null>(null)
const deleteOpen = computed({
  get: () => !!toDelete.value,
  set: (v) => {
    if (!v) toDelete.value = null
  },
})
async function confirmDelete(): Promise<void> {
  const d = toDelete.value
  toDelete.value = null
  if (d) await attempt(() => spell.removeDictionary(ref_(d)))
}

// ---- import ----
const importOpen = ref(false)
const importKind = ref<'hunspell' | 'wordlist'>('hunspell')
const importScope = ref<DictScope>('global')
const importName = ref('')
const dicFile = ref<File | null>(null)
const affFile = ref<File | null>(null)
const listFile = ref<File | null>(null)
const importError = ref('')
const importing = ref(false)

function openImport(): void {
  importKind.value = 'hunspell'
  importScope.value = readOnly.value ? 'global' : 'local'
  importName.value = ''
  dicFile.value = affFile.value = listFile.value = null
  importError.value = ''
  importOpen.value = true
}
function suggestName(f: File | null): void {
  if (f && !importName.value) importName.value = f.name.replace(/\.[^.]+$/, '')
}
watch(dicFile, suggestName)
watch(listFile, suggestName)

const canImport = computed(() =>
  importKind.value === 'hunspell' ? !!dicFile.value && !!affFile.value : !!listFile.value,
)
async function doImport(): Promise<void> {
  importError.value = ''
  importing.value = true
  try {
    const name = importName.value
    const scope = importScope.value
    if (importKind.value === 'hunspell')
      await spell.importDictionary({
        scope,
        name,
        dic: await dicFile.value!.text(),
        aff: await affFile.value!.text(),
      })
    else await spell.importDictionary({ scope, name, wordList: await listFile.value!.text() })
    importOpen.value = false
    Notify.create({ type: 'positive', message: t('spell.imported', { name: name.trim() }) })
  } catch (e) {
    importError.value =
      e instanceof DictionaryError
        ? t(`spell.errors.${e.code}`)
        : e instanceof Error
          ? e.message
          : String(e)
  } finally {
    importing.value = false
  }
}

const defaultNote = computed(() => {
  if (!spell.isDefault) return ''
  const first = spell.selection[0]
  return first
    ? t('spell.defaultUsed', { name: first.name })
    : t('spell.defaultNone', { language: project.project?.manifest.language ?? '' })
})

const scopeOptions = computed(() => [
  { value: 'local' as const, label: t('spell.scopeName.local'), disable: readOnly.value },
  { value: 'global' as const, label: t('spell.scopeName.global') },
])
const kindOptions = computed(() => [
  { value: 'hunspell' as const, label: t('spell.import.kindHunspell') },
  { value: 'wordlist' as const, label: t('spell.import.kindWordlist') },
])
</script>

<template>
  <div v-if="project.project" id="dictionaries" class="group" role="group" aria-labelledby="set-dicts">
    <h2 id="set-dicts">{{ t('spell.title') }}</h2>
    <p class="hint">{{ t('spell.hint') }}</p>
    <p v-if="readOnly" class="hint">{{ t('spell.readOnly') }}</p>
    <p v-if="defaultNote" class="hint">{{ defaultNote }}</p>

    <QBanner
      v-for="m in spell.missing"
      :key="`${m.scope}:${m.name}`"
      rounded
      class="warn-banner banner"
      role="status"
    >
      {{ t('spell.missing', { name: m.name, scope: t(`spell.scope.${m.scope}`).toLowerCase() }) }}
    </QBanner>
    <QBanner v-if="error" rounded class="warn-banner banner" role="alert">{{ error }}</QBanner>

    <ul class="dicts" :aria-label="t('spell.title')">
      <li v-for="i in spell.infos" :key="rowKey(i)" class="dict">
        <div class="info">
          <span class="name">{{ i.name }}</span>
          <QBadge class="badge" :label="scopeLabel(i)" />
          <span class="kind">{{ t(`spell.kind.${i.kind}`) }}</span>
          <span v-if="i.shadowed" class="shadow">{{ t('spell.shadowed') }}</span>
        </div>
        <QToggle
          :model-value="selected(i)"
          :disable="!canToggle(i)"
          :label="t('spell.use')"
          :aria-label="`${t('spell.use')}: ${i.name} (${scopeLabel(i)})`"
          color="primary"
          @update:model-value="toggle(i, $event)"
        />
        <QBtn
          v-if="canMove(i)"
          flat
          no-caps
          dense
          icon="drive_file_move"
          :label="t('spell.move', { scope: t(`spell.scopeName.${otherScope(i)}`) })"
          @click="transfer(i, 'move')"
        />
        <QBtn
          flat
          no-caps
          dense
          icon="content_copy"
          :label="t('spell.copy', { scope: t(`spell.scopeName.${otherScope(i)}`) })"
          @click="transfer(i, 'copy')"
        />
        <QBtn
          v-if="i.source !== 'bundled'"
          flat
          round
          dense
          icon="delete"
          :disable="i.readOnly"
          :aria-label="`${t('spell.delete')}: ${i.name} (${scopeLabel(i)})`"
          :title="t('spell.delete')"
          @click="toDelete = i"
        />
      </li>
    </ul>

    <QBtn
      unelevated
      no-caps
      class="btn-secondary"
      icon="upload_file"
      :label="t('spell.import.open')"
      @click="openImport"
    />

    <h3 id="set-custom-words" class="sub">{{ t('spell.custom.title') }}</h3>
    <p class="hint">{{ t('spell.custom.hint') }}</p>
    <p v-if="!spell.customWords.length" class="hint">{{ t('spell.custom.empty') }}</p>
    <ul v-else class="words" aria-labelledby="set-custom-words">
      <li v-for="w in spell.customWords" :key="w" class="word">
        <span>{{ w }}</span>
        <QBtn
          flat
          round
          dense
          icon="close"
          size="sm"
          :disable="readOnly"
          :aria-label="`${t('spell.custom.remove')}: ${w}`"
          :title="t('spell.custom.remove')"
          @click="attempt(() => spell.removeWord(w))"
        />
      </li>
    </ul>

    <ConfirmDialog
      v-model="deleteOpen"
      :title="t('spell.deleteTitle', { name: toDelete?.name ?? '' })"
      :lines="[t('spell.deleteLine')]"
      :confirm-label="t('spell.delete')"
      @confirm="confirmDelete"
    />

    <QDialog v-model="importOpen" :persistent="importing">
      <QCard class="import" role="dialog" aria-labelledby="dict-import-title">
        <QCardSection>
          <h2 id="dict-import-title" class="dlg-title">{{ t('spell.import.title') }}</h2>
          <QBanner v-if="importError" rounded class="warn-banner banner" role="alert">
            {{ importError }}
          </QBanner>
          <p id="dict-import-kind" class="label">{{ t('spell.import.kind') }}</p>
          <QBtnToggle
            v-model="importKind"
            aria-labelledby="dict-import-kind"
            :options="kindOptions"
            unelevated
            no-caps
            toggle-color="primary"
          />
          <template v-if="importKind === 'hunspell'">
            <QFile
              v-model="dicFile"
              :label="t('spell.import.dic')"
              accept=".dic"
              outlined
              dense
              class="field"
            />
            <QFile
              v-model="affFile"
              :label="t('spell.import.aff')"
              accept=".aff"
              outlined
              dense
              class="field"
            />
          </template>
          <QFile
            v-else
            v-model="listFile"
            :label="t('spell.import.list')"
            accept=".txt,text/plain"
            outlined
            dense
            class="field"
          />
          <QInput
            v-model="importName"
            :label="t('spell.import.name')"
            outlined
            dense
            class="field"
          />
          <p id="dict-import-scope" class="label">{{ t('spell.import.scope') }}</p>
          <QBtnToggle
            v-model="importScope"
            aria-labelledby="dict-import-scope"
            :options="scopeOptions"
            unelevated
            no-caps
            toggle-color="primary"
          />
          <p class="hint">{{ t(`spell.import.scopeHint.${importScope}`) }}</p>
        </QCardSection>
        <QCardActions align="right">
          <QBtn flat no-caps :label="t('spell.import.cancel')" :disable="importing" @click="importOpen = false" />
          <QBtn
            unelevated
            no-caps
            color="primary"
            :label="t('spell.import.do')"
            :disable="!canImport || !importName.trim()"
            :loading="importing"
            @click="doImport"
          />
        </QCardActions>
      </QCard>
    </QDialog>
  </div>
</template>

<style scoped>
.group {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}
.group h2 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  font-weight: 600;
}
.sub {
  margin: 1.25rem 0 0.5rem;
  font-size: 0.9rem;
  font-weight: 600;
}
.hint {
  margin: 0 0 0.5rem;
  color: var(--text-secondary);
}
.banner {
  margin-bottom: 0.5rem;
}
.dicts,
.words {
  list-style: none;
  margin: 0 0 0.75rem;
  padding: 0;
}
.dict {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border);
}
.info {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.25rem 0.5rem;
  flex: 1 1 12rem;
}
.name {
  font-weight: 600;
}
.badge {
  background: var(--bg-selected);
  color: var(--text-primary);
}
.kind,
.shadow {
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.words {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.word {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.25rem 0 0.625rem;
  border: 1px solid var(--border);
  border-radius: 1rem;
  background: var(--bg-raised);
}
.import {
  width: min(32rem, 92vw);
  background: var(--bg-raised);
  color: var(--text-primary);
}
.dlg-title {
  margin: 0 0 0.75rem;
  font-size: 1.15rem;
}
.label {
  margin: 0.75rem 0 0.25rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.field {
  margin-top: 0.75rem;
}
</style>
