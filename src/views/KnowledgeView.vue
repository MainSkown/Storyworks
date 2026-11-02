<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import InvalidFiles from '../components/relations/InvalidFiles.vue'
import KnowsBadge from '../components/knowledge/KnowsBadge.vue'
import LearningDialog from '../components/knowledge/LearningDialog.vue'
import PositionLink from '../components/knowledge/PositionLink.vue'
import RevealedLink from '../components/knowledge/RevealedLink.vue'
import PositionField from '../components/states/PositionField.vue'
import MiniRichText from '../components/MiniRichText.vue'
import { openEntry } from '../codex/openEntry'
import { useCodexStore } from '../codex/store'
import { whoKnowsAsOf } from '../knowledge/logic'
import { useKnowledgeStore } from '../knowledge/store'
import { selectedItemId } from '../knowledge/ui'
import { filterItems } from '../knowledge/view'
import { docToText } from '../project/plainText'
import type { Position } from '../timeline/order'
import { useOrderContext } from '../timeline/orderContext'
import { openRule } from '../rules/openRule'
import { useRulesStore } from '../rules/store'

const { t } = useI18n()
const knowledge = useKnowledgeStore()
const codex = useCodexStore()
const rules = useRulesStore()
const ctx = useOrderContext()

const readOnly = computed(() => !!knowledge.readOnly)
const invalid = computed(() => knowledge.itemList.filter((e) => e.status !== 'ok'))

// ---- list ----
const query = ref('')
const pickedTags = ref<string[]>([])
const allTags = computed(() =>
  [...new Set(knowledge.items.flatMap((k) => k.tags))].sort((a, b) => a.localeCompare(b)),
)
const shown = computed(() =>
  filterItems(knowledge.items, query.value, pickedTags.value, (d) =>
    docToText(d as Record<string, unknown>),
  ),
)
const filterActive = computed(() => !!query.value.trim() || pickedTags.value.length > 0)
function toggleTag(tag: string): void {
  pickedTags.value = pickedTags.value.includes(tag)
    ? pickedTags.value.filter((x) => x !== tag)
    : [...pickedTags.value, tag]
}
function clearFilter(): void {
  query.value = ''
  pickedTags.value = []
}

const learnerCount = (k: { learnings: { entryId: string }[] }) =>
  new Set(k.learnings.map((l) => l.entryId)).size

const item = computed(() => knowledge.items.find((k) => k.id === selectedItemId.value) ?? null)
watch(
  () => knowledge.items,
  () => {
    if (selectedItemId.value && !item.value) selectedItemId.value = null
  },
)

const titleEl = ref<HTMLInputElement | null>(null)
async function create(): Promise<void> {
  if (filterActive.value) clearFilter()
  const id = await knowledge.createItem({ title: t('knowledge.newItemTitle') })
  if (!id) return
  selectedItemId.value = id
  await nextTick()
  titleEl.value?.select()
}

// ---- item fields ----
const titleText = ref('')
watch(
  () => [item.value?.id, item.value?.title] as const,
  () => {
    titleText.value = item.value?.title ?? ''
  },
  { immediate: true },
)
function saveTitle(): void {
  if (item.value && titleText.value.trim() && titleText.value.trim() !== item.value.title)
    knowledge.updateItem(item.value.id, { title: titleText.value })
  titleText.value = item.value?.title ?? ''
}
const tagsModel = computed({
  get: () => item.value?.tags ?? [],
  set: (v: string[]) => {
    if (item.value) knowledge.updateItem(item.value.id, { tags: v })
  },
})
const setDescription = (doc: Record<string, unknown>) => {
  if (item.value) knowledge.updateItem(item.value.id, { description: doc })
}

// ---- about ----
const aboutQuery = ref('')
const aboutOptions = computed(() => {
  const q = aboutQuery.value.trim().toLowerCase()
  const ruleOpts = rules.rules.map((r) => ({
    value: `rule:${r.id}`,
    label: r.title || t('rules.untitled'),
    kind: t('knowledge.about.rule'),
  }))
  const typeName = (id: string) => codex.types.find((x) => x.id === id)?.name ?? ''
  const entryOpts = codex.entries.map((e) => ({
    value: `entry:${e.id}`,
    label: e.name || t('codex.untitled'),
    kind: typeName(e.typeId) || t('knowledge.about.entry'),
  }))
  return [...ruleOpts, ...entryOpts].filter((o) => !q || o.label.toLowerCase().includes(q))
})
function filterAbout(val: string, update: (fn: () => void) => void): void {
  update(() => {
    aboutQuery.value = val
  })
}
const aboutBroken = computed(() => !!item.value && knowledge.brokenAboutIds.includes(item.value.id))
const aboutModel = computed(() => (item.value?.about ? `${item.value.about.type}:${item.value.about.id}` : null))
const aboutLabel = computed(() => {
  const a = item.value?.about
  if (!a) return undefined
  if (aboutBroken.value) return t('knowledge.about.missing')
  if (a.type === 'rule') return rules.rules.find((r) => r.id === a.id)?.title || t('rules.untitled')
  return codex.entries.find((e) => e.id === a.id)?.name || t('codex.untitled')
})
function setAbout(v: string | null): void {
  if (!item.value) return
  if (!v) {
    knowledge.updateItem(item.value.id, { about: null })
    return
  }
  const [type, ...rest] = v.split(':')
  knowledge.updateItem(item.value.id, { about: { type: type as 'rule' | 'entry', id: rest.join(':') } })
}
function openAbout(): void {
  const a = item.value?.about
  if (!a || aboutBroken.value) return
  void (a.type === 'rule' ? openRule(a.id) : openEntry(a.id))
}

// ---- who knows it ----
const entryName = (id: string) => {
  const e = codex.entries.find((x) => x.id === id)
  return e ? e.name || t('codex.untitled') : null
}
const brokenLearners = computed(() => new Set(knowledge.brokenLearningIds.map((b) => b.learningId)))

const dialogOpen = ref(false)
const editId = ref<string | null>(null)
function openAdd(): void {
  editId.value = null
  dialogOpen.value = true
}
function openEdit(id: string): void {
  editId.value = id
  dialogOpen.value = true
}
function removeLearning(learningId: string): void {
  if (item.value && !knowledge.removeLearning(item.value.id, learningId).ok)
    Notify.create({ type: 'negative', message: t('knowledge.failed'), position: 'bottom', timeout: 5000 })
}

// ---- as of ----
const asOf = ref<Position | null>(null)
const asOfRows = computed(() =>
  item.value && asOf.value ? whoKnowsAsOf(item.value, asOf.value, ctx.value) : [],
)

// ---- delete ----
const deleteOpen = ref(false)
async function doDelete(): Promise<void> {
  deleteOpen.value = false
  const id = item.value?.id
  if (id && !(await knowledge.deleteItem(id)).ok)
    Notify.create({ type: 'negative', message: t('knowledge.deleteFailed'), position: 'bottom', timeout: 5000 })
}
</script>

<template>
  <section class="page">
    <aside class="side" :aria-label="t('knowledge.listLabel')">
      <div class="bar">
        <QBtn
          flat
          dense
          no-caps
          icon="arrow_back"
          :label="t('knowledge.back')"
          :to="{ name: 'codex' }"
        />
      </div>
      <h1 class="page-title">{{ t('knowledge.title') }}</h1>
      <div class="bar">
        <QBtn
          unelevated
          no-caps
          icon="add"
          class="btn-section"
          :label="t('knowledge.newItem')"
          :disable="readOnly"
          @click="create"
        />
      </div>

      <QInput
        v-model="query"
        outlined
        dense
        clearable
        :placeholder="t('knowledge.search')"
        :aria-label="t('knowledge.search')"
      >
        <template #prepend><QIcon name="search" aria-hidden="true" /></template>
      </QInput>
      <div v-if="allTags.length" class="chips" role="group" :aria-label="t('knowledge.filterTag')">
        <button
          v-for="tag in allTags"
          :key="tag"
          type="button"
          class="chip"
          :class="{ on: pickedTags.includes(tag) }"
          :aria-pressed="pickedTags.includes(tag)"
          @click="toggleTag(tag)"
        >
          #{{ tag }}
        </button>
      </div>
      <button v-if="filterActive" type="button" class="link" @click="clearFilter">
        {{ t('knowledge.clearFilter') }}
      </button>

      <p v-if="!knowledge.items.length && !invalid.length" class="muted">{{ t('knowledge.noItems') }}</p>
      <p v-else-if="!shown.length" class="muted">{{ t('knowledge.noMatch') }}</p>
      <ul v-else class="list">
        <li v-for="k in shown" :key="k.id">
          <button
            type="button"
            class="item"
            :class="{ current: k.id === selectedItemId }"
            :aria-current="k.id === selectedItemId ? 'true' : undefined"
            @click="selectedItemId = k.id"
          >
            <span class="item-title">
              <QIcon
                v-if="knowledge.brokenAboutIds.includes(k.id)"
                name="error_outline"
                size="1rem"
                :title="t('knowledge.about.missing')"
                :aria-label="t('knowledge.about.missing')"
              />
              {{ k.title || t('knowledge.untitled') }}
            </span>
            <span v-if="k.tags.length" class="item-tags">{{ k.tags.map((x) => `#${x}`).join(' ') }}</span>
            <span class="item-tags">{{ t('knowledge.learnerCount', { n: learnerCount(k) }, learnerCount(k)) }}</span>
          </button>
        </li>
      </ul>
      <InvalidFiles :items="invalid" :heading="t('knowledge.invalidHeading')" />
    </aside>

    <div class="edit">
      <template v-if="item">
        <p v-if="readOnly" class="muted" role="status">{{ t('knowledge.readOnly') }}</p>

        <label class="label" for="kn-title">{{ t('knowledge.fields.title') }}</label>
        <input
          id="kn-title"
          ref="titleEl"
          v-model="titleText"
          class="control"
          :placeholder="t('knowledge.untitled')"
          :readonly="readOnly"
          @change="saveTitle"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        />

        <QSelect
          v-model="tagsModel"
          :label="t('knowledge.fields.tags')"
          :hint="t('knowledge.tagsHint')"
          outlined
          dense
          multiple
          use-chips
          use-input
          hide-dropdown-icon
          new-value-mode="add-unique"
          :disable="readOnly"
        />

        <span class="label">{{ t('knowledge.fields.description') }}</span>
        <MiniRichText
          :model-value="item.description"
          :item-key="item.id"
          :label="t('knowledge.fields.description')"
          :disabled="readOnly"
          @update:model-value="setDescription"
        />

        <h2 class="label section-title">{{ t('knowledge.about.heading') }}</h2>
        <p class="muted">{{ t('knowledge.about.hint') }}</p>
        <p v-if="aboutBroken" class="gone" role="status">
          <QIcon name="error_outline" size="1rem" aria-hidden="true" />
          {{ t('knowledge.about.missingHint') }}
        </p>
        <div class="about-row">
          <QSelect
            class="about-select"
            :model-value="aboutModel"
            :options="aboutOptions"
            :label="t('knowledge.about.label')"
            :display-value="aboutLabel"
            outlined
            dense
            clearable
            use-input
            input-debounce="0"
            emit-value
            map-options
            options-dense
            :disable="readOnly"
            @filter="filterAbout"
            @update:model-value="setAbout"
          >
            <template #option="{ opt, itemProps }">
              <QItem v-bind="itemProps">
                <QItemSection>
                  <QItemLabel>{{ opt.label }}</QItemLabel>
                  <QItemLabel caption>{{ opt.kind }}</QItemLabel>
                </QItemSection>
              </QItem>
            </template>
            <template #no-option>
              <QItem><QItemSection class="muted">{{ t('knowledge.about.none') }}</QItemSection></QItem>
            </template>
          </QSelect>
          <QBtn
            v-if="item.about && !aboutBroken"
            flat
            no-caps
            icon="open_in_new"
            :label="t('knowledge.about.open')"
            @click="openAbout"
          />
        </div>

        <h2 class="label section-title">{{ t('knowledge.who.heading') }}</h2>
        <p v-if="!item.learnings.length" class="muted">{{ t('knowledge.who.none') }}</p>
        <div v-else class="table-wrap">
          <table class="rows">
            <caption class="sr-only">{{ t('knowledge.who.heading') }}</caption>
            <thead>
              <tr>
                <th scope="col">{{ t('knowledge.who.entry') }}</th>
                <th scope="col">{{ t('knowledge.who.learnsAt') }}</th>
                <th scope="col">{{ t('knowledge.who.forgottenAt') }}</th>
                <th scope="col">{{ t('knowledge.who.note') }}</th>
                <th scope="col">{{ t('knowledge.who.revealedIn') }}</th>
                <th v-if="!readOnly" scope="col"><span class="sr-only">{{ t('knowledge.who.actions') }}</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in item.learnings" :key="l.id" :class="{ broken: brokenLearners.has(l.id) }">
                <th scope="row">
                  <span v-if="brokenLearners.has(l.id)" class="gone">
                    <QIcon name="error_outline" size="1rem" aria-hidden="true" />{{ t('knowledge.missingEntry') }}
                  </span>
                  <button
                    v-else
                    type="button"
                    class="link"
                    :aria-label="t('knowledge.openEntry', { name: entryName(l.entryId) ?? '' })"
                    @click="openEntry(l.entryId)"
                  >
                    {{ entryName(l.entryId) }}
                  </button>
                </th>
                <td><PositionLink :position="l.at" /></td>
                <td>
                  <PositionLink v-if="l.forgottenAt" :position="l.forgottenAt" />
                  <span v-else class="muted">{{ t('knowledge.none') }}</span>
                </td>
                <td class="note">{{ l.note }}</td>
                <td>
                  <RevealedLink v-if="l.revealedIn" :passage="l.revealedIn" />
                  <span v-else class="muted">{{ t('knowledge.none') }}</span>
                </td>
                <td v-if="!readOnly" class="acts">
                  <QBtn
                    flat
                    round
                    dense
                    icon="edit"
                    :aria-label="t('knowledge.who.edit', { name: entryName(l.entryId) ?? t('knowledge.missingEntry') })"
                    @click="openEdit(l.id)"
                  />
                  <QBtn
                    flat
                    round
                    dense
                    icon="delete_outline"
                    :aria-label="t('knowledge.who.remove', { name: entryName(l.entryId) ?? t('knowledge.missingEntry') })"
                    @click="removeLearning(l.id)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <QBtn
          unelevated
          no-caps
          icon="add"
          class="btn-section add"
          :label="t('knowledge.who.add')"
          :disable="readOnly"
          @click="openAdd"
        />

        <h2 class="label section-title">{{ t('knowledge.asOf.heading') }}</h2>
        <PositionField v-model="asOf" :label="t('knowledge.asOf.label')" :hint="t('knowledge.asOf.hint')" />
        <template v-if="asOf">
          <p v-if="!asOfRows.length" class="muted">{{ t('knowledge.who.none') }}</p>
          <ul v-else class="as-of" :aria-label="t('knowledge.asOf.heading')">
            <li v-for="r in asOfRows" :key="r.entryId">
              <span v-if="entryName(r.entryId) === null" class="gone">
                <QIcon name="error_outline" size="1rem" aria-hidden="true" />{{ t('knowledge.missingEntry') }}
              </span>
              <button
                v-else
                type="button"
                class="link"
                :aria-label="t('knowledge.openEntry', { name: entryName(r.entryId) ?? '' })"
                @click="openEntry(r.entryId)"
              >
                {{ entryName(r.entryId) }}
              </button>
              <KnowsBadge :state="r.state" />
            </li>
          </ul>
        </template>

        <QBtn
          v-if="!readOnly"
          flat
          no-caps
          color="negative"
          icon="delete_outline"
          class="del"
          :label="t('knowledge.delete.button')"
          @click="deleteOpen = true"
        />
      </template>
      <p v-else class="muted empty">
        {{ knowledge.items.length ? t('knowledge.selectOne') : t('knowledge.noItemsHint') }}
      </p>
    </div>

    <LearningDialog v-model="dialogOpen" :item-id="item?.id" :learning-id="editId" />

    <QDialog v-model="deleteOpen">
      <QCard class="dialog" role="alertdialog" aria-labelledby="kn-del-title">
        <QCardSection>
          <h2 id="kn-del-title" class="dlg-title">{{ t('knowledge.delete.button') }}</h2>
          <p>{{ t('knowledge.delete.confirm', { name: item?.title || t('knowledge.untitled') }) }}</p>
          <p class="warn">{{ t('knowledge.delete.impact') }}</p>
        </QCardSection>
        <QCardActions align="right">
          <QBtn flat no-caps :label="t('knowledge.dialog.cancel')" @click="deleteOpen = false" />
          <QBtn flat no-caps color="negative" :label="t('knowledge.delete.button')" @click="doDelete" />
        </QCardActions>
      </QCard>
    </QDialog>
  </section>
</template>

<style scoped>
.page {
  display: grid;
  grid-template-columns: minmax(15rem, 22rem) minmax(0, 1fr);
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
.page-title {
  margin: 0;
  font-size: 1.15rem;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.btn-section {
  background: var(--section-codex);
  color: var(--section-codex-on);
}
.add {
  align-self: flex-start;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.chip {
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
  border-color: var(--section-codex);
  background: var(--section-codex);
  color: var(--section-codex-on);
}
.list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.item {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0.3rem 0.5rem;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
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
.item-tags {
  display: block;
  color: var(--text-secondary);
  font-size: 0.75rem;
  overflow-wrap: anywhere;
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
  color: var(--section-codex);
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
  padding: 1rem 0;
}
.warn {
  margin: 0;
  color: var(--section-timelines);
  font-size: 0.8125rem;
}
.gone {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin: 0;
  color: var(--section-checks);
  font-size: 0.875rem;
  font-weight: 600;
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
.control {
  width: 100%;
  box-sizing: border-box;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
  font-size: 1.125rem;
  font-weight: 600;
}
.about-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.about-select {
  flex: 1;
  min-width: 14rem;
}
.table-wrap {
  overflow-x: auto;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.rows {
  width: 100%;
  min-width: 34rem;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.rows th,
.rows td {
  min-width: 5rem;
  padding: 0.375rem 0.5rem;
  border-bottom: 1px solid var(--border);
  text-align: start;
  vertical-align: top;
  overflow-wrap: anywhere;
}
.rows thead th {
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.rows tbody th {
  font-weight: 400;
}
.rows tr.broken {
  outline: 1px dashed var(--section-checks);
  outline-offset: -1px;
}
.note {
  min-width: 8rem;
  white-space: pre-wrap;
}
.acts {
  white-space: nowrap;
}
.as-of {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.as-of li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
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
</style>
