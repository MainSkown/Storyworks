<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import MiniRichText from '../MiniRichText.vue'
import MechanicCategoryDialog from './MechanicCategoryDialog.vue'
import { neighborIndex } from './mechanicMove'
import MechanicLinks from './MechanicLinks.vue'
import { useMechanicsStore, type MechanicPatch } from '../../gamedoc/mechanicsStore'
import { newId } from '../../project/ids'
import { useProjectStore } from '../../project/store'
import { MECHANIC_STATUSES, type MechanicStatus } from '../../project/schemas/mechanic'

const { t } = useI18n()
const store = useMechanicsStore()
const uid = useId()
const T = (key: string, named: Record<string, unknown> = {}) =>
  t(`gamedoc.mechanicsTab.${key}`, named)

const readOnly = computed(() => !!store.readOnly)
const mech = computed(() => store.selected)
const invalidEntries = computed(() => store.mechanicEntries.filter((e) => e.status !== 'ok'))
const invalidId = ref<string | null>(null)
const invalidSelected = computed(
  () => invalidEntries.value.find((e) => e.id === invalidId.value) ?? null,
)
const hasAnything = computed(() => store.mechanicEntries.length > 0)
const noMatch = computed(
  () => store.filterActive && store.filteredMechanics.length === 0 && store.mechanics.length > 0,
)
const canCreate = computed(() => !readOnly.value && store.categories.length > 0)

const category = (id: string) => store.categories.find((c) => c.id === id)
const statusLabel = (s: MechanicStatus) => T(`status.${s}`)
const failed = () =>
  Notify.create({ type: 'negative', message: T('saveFailed'), position: 'bottom', timeout: 5000 })
function save(patch: MechanicPatch): boolean {
  if (!mech.value) return false
  const r = store.updateMechanic(mech.value.id, patch)
  if (!r.ok) failed()
  return r.ok
}

function select(id: string): void {
  invalidId.value = null
  store.select(id)
}
function selectInvalid(id: string): void {
  invalidId.value = id
  store.select(null)
}

// ---- editor fields ----
const titleText = ref('')
const summaryText = ref('')
watch(
  () => [mech.value?.id, mech.value?.title, mech.value?.summary] as const,
  () => {
    titleText.value = mech.value?.title ?? ''
    summaryText.value = mech.value?.summary ?? ''
  },
  { immediate: true },
)
function saveTitle(): void {
  if (mech.value && titleText.value.trim() !== mech.value.title) save({ title: titleText.value })
  titleText.value = mech.value?.title ?? ''
}
function saveSummary(): void {
  if (mech.value && summaryText.value.trim() !== mech.value.summary)
    save({ summary: summaryText.value.trim() })
  summaryText.value = mech.value?.summary ?? ''
}
const categoryOptions = computed(() =>
  store.categories.map((c) => ({ value: c.id, label: c.name })),
)
const statusOptions = MECHANIC_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))
const categoryModel = computed({
  get: () => (mech.value && category(mech.value.categoryId) ? mech.value.categoryId : null),
  set: (v: string | null) => {
    if (v) save({ categoryId: v })
  },
})
const statusModel = computed({
  get: () => mech.value?.status ?? 'idea',
  set: (v: MechanicStatus) => void save({ status: v }),
})
const tagsModel = computed({
  get: () => mech.value?.tags ?? [],
  set: (v: string[]) => void save({ tags: v }),
})

// ---- parameters ----
const paramsEl = useTemplateRef<HTMLElement>('paramsEl')
async function addParam(): Promise<void> {
  if (!mech.value) return
  if (!save({ parameters: [...mech.value.parameters, { id: newId(), name: '', value: '' }] }))
    return
  await nextTick()
  paramsEl.value?.querySelector<HTMLInputElement>('tr:last-child input')?.focus()
}
function editParam(id: string, field: 'name' | 'value', ev: Event): void {
  const input = ev.target as HTMLInputElement
  if (!mech.value) return
  const ok = save({
    parameters: mech.value.parameters.map((p) =>
      p.id === id ? { ...p, [field]: input.value } : p,
    ),
  })
  if (!ok) input.value = mech.value.parameters.find((p) => p.id === id)?.[field] ?? ''
}
function removeParam(id: string): void {
  if (mech.value) save({ parameters: mech.value.parameters.filter((p) => p.id !== id) })
}

// ---- list actions ----
const categoriesOpen = ref(false)
const listEl = useTemplateRef<HTMLElement>('listEl')
const announce = ref('')
const titleEl = useTemplateRef<HTMLInputElement>('titleEl')

async function create(): Promise<void> {
  const categoryId = store.filter.categoryId ?? undefined
  if (store.filterActive) store.clearFilter()
  invalidId.value = null
  if (!(await store.createMechanic({ categoryId }))) {
    failed()
    return
  }
  await nextTick()
  titleEl.value?.focus()
}

async function move(id: string, dir: -1 | 1): Promise<void> {
  const to = neighborIndex(
    store.mechanics.map((m) => m.id),
    store.filteredMechanics.map((m) => m.id),
    id,
    dir,
  )
  if (to === null || !store.moveMechanic(id, to)) return
  const m = store.mechanics.find((x) => x.id === id)
  const n = store.filteredMechanics.findIndex((x) => x.id === id) + 1
  announce.value = T('moved', {
    title: m?.title || T('untitled'),
    n,
    total: store.filteredMechanics.length,
  })
  await nextTick()
  listEl.value?.querySelector<HTMLElement>(`[data-mech="${id}"]`)?.focus()
}

// ---- delete ----
const deleteId = ref<string | null>(null)
const deleteTitle = computed(() => {
  const m = store.mechanics.find((x) => x.id === deleteId.value)
  const e = store.mechanicEntries.find((x) => x.id === deleteId.value)
  return m?.title || e?.title || (m ? T('untitled') : (e?.id ?? ''))
})
async function doDelete(): Promise<void> {
  const id = deleteId.value
  const title = deleteTitle.value
  deleteId.value = null
  if (!id) return
  if (!(await store.deleteMechanic(id)))
    return void Notify.create({
      type: 'negative',
      message: T('deleteFailed'),
      position: 'bottom',
      timeout: 5000,
    })
  if (invalidId.value === id) invalidId.value = null
  // The Delete button is gone; keep focus in the list.
  void nextTick(() =>
    (listEl.value?.querySelector<HTMLElement>('[data-mech]') ??
      document.querySelector<HTMLElement>('.page .bar button'))?.focus(),
  )
  Notify.create({
    message: T('deleted', { title }),
    position: 'bottom',
    timeout: 8000,
    actions: [
      {
        label: T('undo'),
        color: 'white',
        handler: async () => {
          try {
            await useProjectStore().restoreItem(id)
            store.select(id)
          } catch {
            Notify.create({
              type: 'negative',
              message: T('restoreFailed'),
              position: 'bottom',
              timeout: 5000,
            })
          }
        },
      },
    ],
  })
}

const errorText = (e: (typeof invalidEntries.value)[number]) =>
  e.error ? `${e.error.field ? `${e.error.field}: ` : ''}${e.error.message}` : T('missingFile')
</script>

<template>
  <section class="page">
    <aside class="side" :aria-label="T('listLabel')">
      <div class="bar">
        <QBtn
          unelevated
          no-caps
          icon="add"
          class="btn-section"
          :label="T('newMechanic')"
          :disable="!canCreate"
          @click="create"
        />
        <QBtn
          flat
          no-caps
          icon="palette"
          :label="T('manageCategories')"
          @click="categoriesOpen = true"
        />
      </div>

      <QInput
        :model-value="store.filter.query"
        outlined
        dense
        clearable
        :placeholder="T('search')"
        :aria-label="T('search')"
        @update:model-value="store.setQuery(String($event ?? ''))"
      >
        <template #prepend><QIcon name="search" aria-hidden="true" /></template>
      </QInput>

      <div
        v-if="store.categories.length"
        class="chips"
        role="group"
        :aria-label="T('filterCategory')"
      >
        <button
          v-for="c in store.categories"
          :key="c.id"
          type="button"
          class="chip"
          :class="{ on: store.filter.categoryId === c.id }"
          :aria-pressed="store.filter.categoryId === c.id"
          @click="store.setCategoryFilter(store.filter.categoryId === c.id ? null : c.id)"
        >
          <span class="dot" :style="{ background: c.color }" aria-hidden="true" />{{ c.name }}
        </button>
      </div>
      <div class="chips" role="group" :aria-label="T('filterStatus')">
        <button
          v-for="s in MECHANIC_STATUSES"
          :key="s"
          type="button"
          class="chip"
          :class="{ on: store.filter.status === s }"
          :aria-pressed="store.filter.status === s"
          @click="store.setStatusFilter(store.filter.status === s ? null : s)"
        >
          {{ statusLabel(s) }}
        </button>
      </div>
      <div v-if="store.allTags.length" class="chips" role="group" :aria-label="T('filterTag')">
        <button
          v-for="tag in store.allTags"
          :key="tag"
          type="button"
          class="chip"
          :class="{ on: store.filter.tags.includes(tag) }"
          :aria-pressed="store.filter.tags.includes(tag)"
          @click="store.toggleTag(tag)"
        >
          #{{ tag }}
        </button>
      </div>
      <button v-if="store.filterActive" type="button" class="link" @click="store.clearFilter()">
        {{ T('clearFilter') }}
      </button>

      <p v-if="!store.categories.length" class="muted">{{ T('noCategories') }}</p>
      <p v-else-if="!hasAnything" class="muted">{{ T('noMechanics') }}</p>
      <p v-else-if="noMatch" class="muted">{{ T('noMatch') }}</p>

      <ul ref="listEl" class="list">
        <li v-for="m in store.filteredMechanics" :key="m.id" class="row">
          <button
            type="button"
            class="item"
            :class="{ current: m.id === store.selectedId }"
            :data-mech="m.id"
            :aria-current="m.id === store.selectedId ? 'true' : undefined"
            @click="select(m.id)"
            @keydown.alt.up.prevent="!readOnly && move(m.id, -1)"
            @keydown.alt.down.prevent="!readOnly && move(m.id, 1)"
          >
            <span class="item-title">{{ m.title || T('untitled') }}</span>
            <span v-if="m.summary" class="item-sum">{{ m.summary }}</span>
            <span class="item-chips">
              <span v-if="category(m.categoryId)" class="tag">
                <span
                  class="dot"
                  :style="{ background: category(m.categoryId)!.color }"
                  aria-hidden="true"
                />{{ category(m.categoryId)!.name }}
              </span>
              <span class="tag">{{ statusLabel(m.status) }}</span>
            </span>
          </button>
          <QBtn
            flat
            round
            dense
            icon="more_vert"
            :aria-label="T('rowMenu', { title: m.title || T('untitled') })"
            :disable="readOnly"
          >
            <QMenu>
              <QList dense>
                <QItem v-close-popup clickable @click="move(m.id, -1)">
                  <QItemSection avatar><QIcon name="arrow_upward" /></QItemSection>
                  <QItemSection>{{ T('moveUp') }}</QItemSection>
                </QItem>
                <QItem v-close-popup clickable @click="move(m.id, 1)">
                  <QItemSection avatar><QIcon name="arrow_downward" /></QItemSection>
                  <QItemSection>{{ T('moveDown') }}</QItemSection>
                </QItem>
              </QList>
            </QMenu>
          </QBtn>
        </li>
      </ul>
      <p class="sr-only" role="status">{{ announce }}</p>

      <div v-if="invalidEntries.length" class="group">
        <h2 class="group-title">{{ T('invalidHeading') }}</h2>
        <ul class="list">
          <li v-for="e in invalidEntries" :key="e.id">
            <button
              type="button"
              class="item invalid"
              :class="{ current: e.id === invalidId }"
              :aria-current="e.id === invalidId ? 'true' : undefined"
              @click="selectInvalid(e.id)"
            >
              <span class="item-title">
                <QIcon name="error_outline" size="1rem" aria-hidden="true" />
                {{ e.title || e.id }}
              </span>
              <span class="item-sum">{{
                e.status === 'missing' ? T('missingFile') : T('invalidFile')
              }}</span>
              <span class="item-sum">{{ errorText(e) }}</span>
            </button>
          </li>
        </ul>
        <p class="muted">{{ T('invalidHint') }}</p>
      </div>
    </aside>

    <div class="edit">
      <template v-if="mech">
        <p v-if="readOnly" class="muted" role="status">{{ T('readOnly') }}</p>

        <label class="label" :for="`${uid}-title`">{{ T('fields.title') }}</label>
        <input
          :id="`${uid}-title`"
          ref="titleEl"
          v-model="titleText"
          class="control title"
          :placeholder="T('untitled')"
          :readonly="readOnly"
          @change="saveTitle"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        />

        <label class="label" :for="`${uid}-sum`">{{ T('fields.summary') }}</label>
        <input
          :id="`${uid}-sum`"
          v-model="summaryText"
          class="control"
          :readonly="readOnly"
          @change="saveSummary"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        />

        <div class="pair">
          <QSelect
            v-model="categoryModel"
            :options="categoryOptions"
            :label="T('fields.category')"
            outlined
            dense
            emit-value
            map-options
            options-dense
            :disable="readOnly"
          />
          <QSelect
            v-model="statusModel"
            :options="statusOptions"
            :label="T('fields.status')"
            outlined
            dense
            emit-value
            map-options
            options-dense
            :disable="readOnly"
          />
        </div>
        <p v-if="!category(mech.categoryId)" class="warn">{{ T('categoryGone') }}</p>

        <QSelect
          v-model="tagsModel"
          :label="T('fields.tags')"
          :hint="T('tagsHint')"
          outlined
          dense
          multiple
          use-chips
          use-input
          hide-dropdown-icon
          new-value-mode="add-unique"
          :disable="readOnly"
        />

        <span class="label">{{ T('fields.description') }}</span>
        <MiniRichText
          :model-value="mech.description"
          :item-key="mech.id"
          :label="T('fields.description')"
          :disabled="readOnly"
          @update:model-value="save({ description: $event })"
        />

        <h2 class="label section-title">{{ T('fields.parameters') }}</h2>
        <p v-if="!mech.parameters.length" class="muted">{{ T('parameters.none') }}</p>
        <table v-else ref="paramsEl" class="params">
          <thead>
            <tr>
              <th scope="col">{{ T('parameters.name') }}</th>
              <th scope="col">{{ T('parameters.value') }}</th>
              <th scope="col" class="sr-only">{{ T('parameters.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, i) in mech.parameters" :key="p.id">
              <td>
                <input
                  class="control"
                  :value="p.name"
                  :aria-label="T('parameters.nameRow', { n: i + 1 })"
                  :readonly="readOnly"
                  @change="editParam(p.id, 'name', $event)"
                />
              </td>
              <td>
                <input
                  class="control"
                  :value="p.value"
                  :aria-label="T('parameters.valueRow', { n: i + 1 })"
                  :readonly="readOnly"
                  @change="editParam(p.id, 'value', $event)"
                />
              </td>
              <td>
                <QBtn
                  v-if="!readOnly"
                  flat
                  round
                  dense
                  icon="delete_outline"
                  :aria-label="T('parameters.remove', { n: i + 1 })"
                  @click="removeParam(p.id)"
                />
              </td>
            </tr>
          </tbody>
        </table>
        <QBtn
          v-if="!readOnly"
          flat
          no-caps
          icon="add"
          class="add-param"
          :label="T('parameters.add')"
          @click="addParam"
        />

        <slot name="links" :mechanic="mech">
          <MechanicLinks :mechanic="mech" />
        </slot>

        <QBtn
          v-if="!readOnly"
          flat
          no-caps
          color="negative"
          icon="delete_outline"
          class="del"
          :label="T('deleteMechanic')"
          @click="deleteId = mech.id"
        />
      </template>
      <template v-else-if="invalidSelected">
        <h2 class="label">{{ invalidSelected.title || invalidSelected.id }}</h2>
        <p class="warn">
          {{ invalidSelected.status === 'missing' ? T('missingFile') : T('invalidFile') }}:
          {{ errorText(invalidSelected) }}
        </p>
        <p class="muted">{{ T('invalidOnly') }}</p>
        <QBtn
          v-if="!readOnly"
          flat
          no-caps
          color="negative"
          icon="delete_outline"
          class="del"
          :label="T('deleteMechanic')"
          @click="deleteId = invalidSelected.id"
        />
      </template>
      <div v-else class="empty">
        <p class="muted">{{ hasAnything ? T('selectOne') : T('noMechanicsHint') }}</p>
        <QBtn
          v-if="!hasAnything"
          unelevated
          no-caps
          icon="add"
          class="btn-section"
          :label="T('newMechanic')"
          :disable="!canCreate"
          @click="create"
        />
      </div>
    </div>

    <MechanicCategoryDialog v-model="categoriesOpen" />

    <QDialog :model-value="!!deleteId" @update:model-value="deleteId = null">
      <QCard class="dialog" role="alertdialog" aria-labelledby="mech-del-title">
        <QCardSection>
          <h2 id="mech-del-title" class="dlg-title">{{ T('deleteMechanic') }}</h2>
          <p>{{ T('deleteConfirm', { title: deleteTitle }) }}</p>
          <p class="warn">{{ T('deleteLinks') }}</p>
        </QCardSection>
        <QCardActions align="right">
          <QBtn flat no-caps autofocus :label="T('cancel')" @click="deleteId = null" />
          <QBtn flat no-caps color="negative" :label="T('deleteMechanic')" @click="doDelete" />
        </QCardActions>
      </QCard>
    </QDialog>
  </section>
</template>

<style scoped>
.page {
  display: grid;
  grid-template-columns: minmax(15rem, 24rem) minmax(0, 1fr);
  min-height: 100%;
  color: var(--text-primary);
}
.side {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  border-inline-end: 1px solid var(--border);
}
.edit {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 1.25rem 1.5rem;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.btn-section {
  background: var(--section-gamedoc);
  color: var(--section-gamedoc-on);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}
.chip:hover {
  background: var(--bg-selected);
}
.chip.on {
  border-color: var(--section-gamedoc);
  background: var(--section-gamedoc);
  color: var(--section-gamedoc-on);
}
.dot {
  display: inline-block;
  flex: none;
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
}
.group-title {
  margin: 0.5rem 0 0.25rem;
  color: var(--section-gamedoc);
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.row {
  display: flex;
  align-items: flex-start;
  gap: 0.125rem;
}
.item {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
  padding: 0.3rem 0.5rem;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
li > .item {
  width: 100%;
}
.item:hover,
.item.current {
  background: var(--bg-selected);
}
.item.current .item-title {
  font-weight: 600;
}
.item-title {
  overflow-wrap: anywhere;
}
.item-sum {
  display: block;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.invalid .item-sum {
  white-space: normal;
  overflow-wrap: anywhere;
}
.invalid {
  color: var(--section-checks);
}
.invalid .item-title {
  color: var(--text-primary);
}
.item-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.4rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 0.75rem;
}
.chip:focus-visible,
.item:focus-visible,
.link:focus-visible,
.control:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.link {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--section-gamedoc);
  font: inherit;
  text-align: start;
  text-decoration: underline;
  cursor: pointer;
}
.muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem 0;
}
.warn {
  margin: 0;
  color: var(--section-timelines);
  font-size: 0.8125rem;
}
.label {
  margin: 0.5rem 0 0;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.section-title {
  margin-top: 1rem;
}
.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.control {
  width: 100%;
  box-sizing: border-box;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
}
.control.title {
  font-size: 1.125rem;
  font-weight: 600;
}
.params {
  width: 100%;
  border-collapse: collapse;
}
.params th {
  padding: 0 0.25rem 0.125rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
  text-align: start;
}
.params td {
  padding: 0.125rem 0.25rem;
}
.params td:last-child {
  width: 2.5rem;
}
.add-param {
  align-self: flex-start;
}
.del {
  align-self: flex-start;
  margin-top: 1rem;
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
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
</style>
