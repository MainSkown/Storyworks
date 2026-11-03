<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGlossaryStore } from '../../gamedoc/glossaryStore'
import { sortGlossary } from '../../project/gamedoc'
import type { GlossaryEntry } from '../../project/schemas/glossary'

const { t, locale } = useI18n()
const store = useGlossaryStore()
const uid = useId()

const query = ref('')
const message = ref('')
const canEdit = computed(() => store.status === 'ok' || store.status === 'none')
const readOnly = computed(() => !!store.readOnly)
const disabled = computed(() => readOnly.value || !canEdit.value)

const sorted = computed(() => sortGlossary(store.entries, locale.value))
const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return sorted.value
  return sorted.value.filter(
    (e) => e.term.toLowerCase().includes(q) || e.definition.toLowerCase().includes(q),
  )
})
const problem = computed(() => {
  if (store.status === 'invalid') return t('gamedoc.glossaryTab.invalid')
  if (store.status === 'missing') return t('gamedoc.glossaryTab.missing')
  return ''
})
const detail = computed(() => {
  const e = store.error
  return e ? `${e.file}${e.field ? ` (${e.field})` : ''}: ${e.message}` : ''
})

// ---- add ----
const adding = ref(false)
const newTerm = ref('')
const newDef = ref('')
const addError = ref('')
const addTermEl = ref<HTMLInputElement>()
const addBtn = ref<{ $el: HTMLElement }>()

async function openAdd() {
  adding.value = true
  addError.value = ''
  await nextTick()
  addTermEl.value?.focus()
}
function closeAdd() {
  adding.value = false
  newTerm.value = newDef.value = addError.value = ''
  nextTick(() => addBtn.value?.$el.focus())
}
async function saveAdd() {
  const term = newTerm.value.trim()
  if (!term) {
    addError.value = t('gamedoc.glossaryTab.termRequired')
    addTermEl.value?.focus()
    return
  }
  const id = await store.add(term, newDef.value.trim())
  if (!id) {
    addError.value = t('gamedoc.glossaryTab.saveFailed')
    return
  }
  message.value = t('gamedoc.glossaryTab.added', { term })
  newTerm.value = newDef.value = addError.value = ''
  addTermEl.value?.focus()
}

// ---- edit ----
const editId = ref<string | null>(null)
const editTerm = ref('')
const editDef = ref('')
const editError = ref('')
const editTermEl = ref<HTMLInputElement[]>()

async function startEdit(e: GlossaryEntry) {
  editId.value = e.id
  editTerm.value = e.term
  editDef.value = e.definition
  editError.value = ''
  await nextTick()
  editTermEl.value?.[0]?.focus()
}
const listEl = ref<HTMLElement>()
// Keyboard and button exits put focus back on the row's Edit button.
function focusEditBtn(id: string) {
  void nextTick(() =>
    listEl.value?.querySelector<HTMLElement>(`[data-entry="${id}"] [data-edit]`)?.focus(),
  )
}
function cancelEdit(refocus = true) {
  const id = editId.value
  editId.value = null
  editError.value = ''
  if (refocus && id) focusEditBtn(id)
}
function saveEdit(refocus = true): boolean {
  const id = editId.value
  if (!id) return true
  const term = editTerm.value.trim()
  if (!term) {
    editError.value = t('gamedoc.glossaryTab.termRequired')
    return false
  }
  const cur = store.entries.find((x) => x.id === id)
  if (cur && (cur.term !== term || cur.definition !== editDef.value.trim())) {
    if (!store.update(id, { term, definition: editDef.value.trim() })) {
      editError.value = t('gamedoc.glossaryTab.saveFailed')
      return false
    }
    message.value = t('gamedoc.glossaryTab.saved', { term })
  }
  editId.value = null
  if (refocus) focusEditBtn(id)
  return true
}
// Focus moving between the row's own fields/buttons is not leaving the row.
function onEditFocusout(ev: FocusEvent) {
  const row = ev.currentTarget as HTMLElement
  if (row.contains(ev.relatedTarget as Node | null)) return
  if (!editTerm.value.trim()) cancelEdit(false)
  else saveEdit(false)
}

// ---- delete ----
const deleting = ref<GlossaryEntry | null>(null)
const deleteOpen = computed({
  get: () => deleting.value !== null,
  set: (v) => {
    if (!v) deleting.value = null
  },
})
function doDelete() {
  const e = deleting.value
  deleting.value = null
  if (!e) return
  const i = shown.value.findIndex((x) => x.id === e.id)
  const next = shown.value[i + 1] ?? shown.value[i - 1]
  if (!store.remove(e.id)) return
  message.value = t('gamedoc.glossaryTab.deleted', { term: e.term })
  if (next) focusEditBtn(next.id)
  else void nextTick(() => addBtn.value?.$el.focus())
}
</script>

<template>
  <section class="glossary" :aria-label="t('gamedoc.glossaryTab.title')">
    <h2 class="title">{{ t('gamedoc.glossaryTab.title') }}</h2>

    <div v-if="problem" class="problem" role="alert">
      <p>{{ problem }}</p>
      <p v-if="detail" class="detail">{{ detail }}</p>
    </div>

    <template v-else>
      <p v-if="readOnly" class="muted" role="status">{{ t('gamedoc.glossaryTab.readOnly') }}</p>

      <div class="bar">
        <QInput
          v-model="query"
          dense
          outlined
          clearable
          class="search"
          :label="t('gamedoc.glossaryTab.search')"
          :aria-label="t('gamedoc.glossaryTab.search')"
        />
        <QBtn
          ref="addBtn"
          no-caps
          unelevated
          icon="add"
          class="btn-section"
          :label="t('gamedoc.glossaryTab.add')"
          :disable="disabled || adding"
          @click="openAdd"
        />
      </div>

      <form
        v-if="adding"
        class="row edit-row"
        :aria-label="t('gamedoc.glossaryTab.add')"
        @submit.prevent="saveAdd"
        @keydown.esc.stop="closeAdd"
      >
        <label :for="`${uid}-nt`" class="label">{{ t('gamedoc.glossaryTab.term') }}</label>
        <input
          :id="`${uid}-nt`"
          ref="addTermEl"
          v-model="newTerm"
          class="field"
          type="text"
          :aria-invalid="!!addError"
          :aria-describedby="addError ? `${uid}-ae` : undefined"
        />
        <label :for="`${uid}-nd`" class="label">{{ t('gamedoc.glossaryTab.definition') }}</label>
        <textarea
          :id="`${uid}-nd`"
          v-model="newDef"
          class="field"
          rows="3"
          @keydown.ctrl.enter.prevent="saveAdd"
          @keydown.meta.enter.prevent="saveAdd"
        />
        <p v-if="addError" :id="`${uid}-ae`" class="error" role="alert">{{ addError }}</p>
        <div class="actions">
          <QBtn type="submit" no-caps unelevated class="btn-section" :label="t('gamedoc.glossaryTab.save')" />
          <QBtn flat no-caps :label="t('gamedoc.glossaryTab.cancel')" @click="closeAdd" />
        </div>
      </form>

      <p v-if="!store.entries.length && !adding" class="empty">
        {{ t('gamedoc.glossaryTab.empty') }}
      </p>
      <p v-else-if="!shown.length && store.entries.length" class="muted">
        {{ t('gamedoc.glossaryTab.noMatch') }}
      </p>

      <ul v-if="shown.length" ref="listEl" class="list" :aria-label="t('gamedoc.glossaryTab.title')">
        <li v-for="e in shown" :key="e.id" class="entry" :data-entry="e.id">
          <div
            v-if="editId === e.id"
            class="row edit-row"
            @focusout="onEditFocusout"
            @keydown.esc.stop="cancelEdit()"
          >
            <label :for="`${uid}-et`" class="label">{{ t('gamedoc.glossaryTab.term') }}</label>
            <input
              :id="`${uid}-et`"
              ref="editTermEl"
              v-model="editTerm"
              class="field"
              type="text"
              :aria-invalid="!!editError"
              :aria-describedby="editError ? `${uid}-ee` : undefined"
              @keydown.enter.prevent="saveEdit()"
            />
            <label :for="`${uid}-ed`" class="label">{{ t('gamedoc.glossaryTab.definition') }}</label>
            <textarea
              :id="`${uid}-ed`"
              v-model="editDef"
              class="field"
              rows="3"
              @keydown.ctrl.enter.prevent="saveEdit()"
              @keydown.meta.enter.prevent="saveEdit()"
            />
            <p v-if="editError" :id="`${uid}-ee`" class="error" role="alert">{{ editError }}</p>
            <div class="actions">
              <QBtn no-caps unelevated class="btn-section" :label="t('gamedoc.glossaryTab.save')" @click="saveEdit()" />
              <QBtn flat no-caps :label="t('gamedoc.glossaryTab.cancel')" @click="cancelEdit()" />
            </div>
          </div>
          <div v-else class="view">
            <div class="text">
              <span class="term">{{ e.term }}</span>
              <span v-if="e.definition" class="def">{{ e.definition }}</span>
            </div>
            <div class="actions">
              <QBtn
                flat
                round
                dense
                icon="edit"
                data-edit
                :aria-label="t('gamedoc.glossaryTab.edit', { term: e.term })"
                :disable="disabled"
                @click="startEdit(e)"
              />
              <QBtn
                flat
                round
                dense
                icon="delete"
                :aria-label="t('gamedoc.glossaryTab.delete', { term: e.term })"
                :disable="disabled"
                @click="deleting = e"
              />
            </div>
          </div>
        </li>
      </ul>

      <p class="sr-only" role="status" aria-live="polite">{{ message }}</p>
    </template>

    <QDialog v-model="deleteOpen">
      <QCard class="dialog" role="alertdialog" :aria-labelledby="`${uid}-dt`">
        <QCardSection>
          <h2 :id="`${uid}-dt`" class="dlg-title">{{ t('gamedoc.glossaryTab.deleteTitle') }}</h2>
          <p>{{ t('gamedoc.glossaryTab.deleteConfirm', { term: deleting?.term ?? '' }) }}</p>
        </QCardSection>
        <QCardActions align="right">
          <QBtn
            flat
            no-caps
            autofocus
            :label="t('gamedoc.glossaryTab.cancel')"
            @click="deleteOpen = false"
          />
          <QBtn
            flat
            no-caps
            color="negative"
            :label="t('gamedoc.glossaryTab.deleteTitle')"
            @click="doDelete"
          />
        </QCardActions>
      </QCard>
    </QDialog>
  </section>
</template>

<style scoped>
.glossary {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 52rem;
  padding: 1.25rem 1.5rem;
  color: var(--text-primary);
}
.title {
  margin: 0;
  font-size: 1.15rem;
  border-inline-start: 4px solid var(--section-gamedoc);
  padding-inline-start: 0.5rem;
}
.muted,
.empty {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.empty {
  padding: 0.5rem 0;
}
.problem {
  padding: 0.75rem 1rem;
  border: 1px solid var(--border-strong);
  border-inline-start: 4px solid var(--section-checks);
  border-radius: 0.375rem;
  background: var(--bg-raised);
}
.problem p {
  margin: 0;
}
.detail {
  margin-top: 0.25rem;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.search {
  flex: 1 1 14rem;
}
.btn-section {
  background: var(--section-gamedoc);
  color: var(--section-gamedoc-on);
}
.list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
}
.entry + .entry {
  border-top: 1px solid var(--border);
}
.view {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
}
.text {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}
.term {
  font-weight: 600;
}
.def {
  color: var(--text-secondary);
  font-size: 0.9375rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}
.row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
}
.edit-row {
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-raised);
}
.list .edit-row {
  border: 0;
}
.label {
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.field {
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.25rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
  resize: vertical;
}
.field:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.error {
  margin: 0;
  color: var(--section-checks);
  font-size: 0.8125rem;
  font-weight: 600;
}
.dialog {
  min-width: min(24rem, 90vw);
  background: var(--bg-raised);
  color: var(--text-primary);
}
.dlg-title {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
