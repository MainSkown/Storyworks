<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import MiniRichText from '../components/MiniRichText.vue'
import RuleCategoryDialog from '../components/RuleCategoryDialog.vue'
import { openEntry } from '../codex/openEntry'
import { useCodexStore } from '../codex/store'
import { jumpToNode } from '../composables/useJump'
import { useRulesStore } from '../rules/store'
import type { RuleUsage } from '../project/rules'

const { t } = useI18n()
const store = useRulesStore()
const codex = useCodexStore()
const uid = useId()

const readOnly = computed(() => !!store.readOnly)
const rule = computed(() => store.selected)
const invalidEntries = computed(() => store.ruleEntries.filter((e) => e.status !== 'ok'))
const hasAnything = computed(() => store.ruleEntries.length > 0)
const noMatch = computed(
  () => store.filterActive && store.filteredRules.length === 0 && store.rules.length > 0,
)
const used = computed<RuleUsage[]>(() => (rule.value ? store.usedIn(rule.value.id) : []))
const usedByEntries = computed(() => (rule.value ? codex.usedByRule(rule.value.id) : []))
const groups = computed(() => store.groups.filter((g) => g.rules.length > 0))

// ---- editor fields ----
const titleText = ref('')
watch(
  () => [rule.value?.id, rule.value?.title] as const,
  () => {
    titleText.value = rule.value?.title ?? ''
  },
  { immediate: true },
)
function saveTitle(): void {
  if (rule.value && titleText.value.trim() !== rule.value.title)
    store.updateRule(rule.value.id, { title: titleText.value })
  titleText.value = rule.value?.title ?? ''
}
const categoryOptions = computed(() =>
  store.categories.map((c) => ({ value: c.id, label: c.name })),
)
const categoryModel = computed({
  get: () => rule.value?.categoryId ?? null,
  set: (v: string | null) => {
    if (rule.value && v) store.updateRule(rule.value.id, { categoryId: v })
  },
})
const tagsModel = computed({
  get: () => rule.value?.tags ?? [],
  set: (v: string[]) => {
    if (rule.value) store.updateRule(rule.value.id, { tags: v })
  },
})
const setDoc = (field: 'description' | 'exceptions', doc: Record<string, unknown>) => {
  if (rule.value) store.updateRule(rule.value.id, { [field]: doc })
}

const categoryName = (id: string) => store.categories.find((c) => c.id === id)?.name ?? ''

// ---- actions ----
const categoriesOpen = ref(false)
const canCreate = computed(() => !readOnly.value && store.categories.length > 0)
async function create(): Promise<void> {
  const categoryId = store.filter.categoryId ?? undefined
  if (store.filterActive) store.clearFilter()
  await store.createRule({ categoryId })
}

async function jump(u: RuleUsage): Promise<void> {
  const r = await jumpToNode(u.timelineId, u.nodeId)
  if (!r.ok)
    Notify.create({
      type: 'warning',
      message: t('rules.jumpFailed'),
      position: 'bottom',
      timeout: 5000,
    })
}

const deleteOpen = ref(false)
const deleteLinks = computed(() => used.value.length)
async function doDelete(): Promise<void> {
  deleteOpen.value = false
  if (rule.value && !(await store.deleteRule(rule.value.id)))
    Notify.create({
      type: 'negative',
      message: t('rules.deleteFailed'),
      position: 'bottom',
      timeout: 5000,
    })
}

const errorText = (e: (typeof invalidEntries.value)[number]) =>
  e.error
    ? `${e.error.field ? `${e.error.field}: ` : ''}${e.error.message}`
    : t('rules.missingFile')
</script>

<template>
  <section class="page">
    <aside class="side" :aria-label="t('rules.listLabel')">
      <div class="bar">
        <QBtn
          unelevated
          no-caps
          icon="add"
          class="btn-section"
          :label="t('rules.newRule')"
          :disable="!canCreate"
          @click="create"
        />
        <QBtn
          flat
          no-caps
          icon="palette"
          :label="t('rules.manageCategories')"
          @click="categoriesOpen = true"
        />
      </div>

      <QInput
        :model-value="store.filter.query"
        outlined
        dense
        clearable
        :placeholder="t('rules.search')"
        :aria-label="t('rules.search')"
        @update:model-value="store.setQuery(String($event ?? ''))"
      >
        <template #prepend><QIcon name="search" aria-hidden="true" /></template>
      </QInput>

      <div
        v-if="store.categories.length"
        class="chips"
        role="group"
        :aria-label="t('rules.filterCategory')"
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
      <div
        v-if="store.allTags.length"
        class="chips"
        role="group"
        :aria-label="t('rules.filterTag')"
      >
        <button
          v-for="tag in store.allTags"
          :key="tag"
          type="button"
          class="chip tag"
          :class="{ on: store.filter.tags.includes(tag) }"
          :aria-pressed="store.filter.tags.includes(tag)"
          @click="store.toggleTag(tag)"
        >
          #{{ tag }}
        </button>
      </div>
      <button v-if="store.filterActive" type="button" class="link" @click="store.clearFilter()">
        {{ t('rules.clearFilter') }}
      </button>

      <p v-if="!store.categories.length" class="muted">{{ t('rules.noCategories') }}</p>
      <p v-else-if="!hasAnything" class="muted">{{ t('rules.noRules') }}</p>
      <p v-else-if="noMatch" class="muted">{{ t('rules.noMatch') }}</p>

      <div v-for="g in groups" :key="g.category?.id ?? 'none'" class="group">
        <h2 class="group-title">
          <span
            class="dot"
            :style="{ background: g.category?.color ?? 'var(--text-secondary)' }"
            aria-hidden="true"
          />
          {{ g.category?.name ?? t('rules.noCategory') }}
        </h2>
        <ul class="list">
          <li v-for="r in g.rules" :key="r.id">
            <button
              type="button"
              class="item"
              :class="{ current: r.id === store.selectedId }"
              :aria-current="r.id === store.selectedId ? 'true' : undefined"
              @click="store.select(r.id)"
            >
              <span class="item-title">{{ r.title || t('rules.untitled') }}</span>
              <span v-if="r.tags.length" class="item-tags">{{
                r.tags.map((x) => `#${x}`).join(' ')
              }}</span>
            </button>
          </li>
        </ul>
      </div>

      <div v-if="invalidEntries.length" class="group">
        <h2 class="group-title">{{ t('rules.invalidHeading') }}</h2>
        <ul class="list">
          <li v-for="e in invalidEntries" :key="e.id" class="invalid">
            <QIcon name="error_outline" size="1rem" aria-hidden="true" />
            <div>
              <span class="item-title">{{ e.title || e.id }}</span>
              <span class="item-tags">
                {{ e.status === 'missing' ? t('rules.missingFile') : t('rules.invalidFile') }}
              </span>
              <span class="item-tags">{{ errorText(e) }}</span>
            </div>
          </li>
        </ul>
        <p class="muted">{{ t('rules.invalidHint') }}</p>
      </div>
    </aside>

    <div class="edit">
      <template v-if="rule">
        <p v-if="readOnly" class="muted" role="status">{{ t('rules.readOnly') }}</p>

        <label class="label" :for="`${uid}-title`">{{ t('rules.fields.title') }}</label>
        <input
          :id="`${uid}-title`"
          v-model="titleText"
          class="control"
          :placeholder="t('rules.untitled')"
          :readonly="readOnly"
          @change="saveTitle"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        />

        <QSelect
          v-model="categoryModel"
          :options="categoryOptions"
          :label="t('rules.fields.category')"
          outlined
          dense
          emit-value
          map-options
          options-dense
          :disable="readOnly"
        />
        <p v-if="!categoryName(rule.categoryId)" class="warn">{{ t('rules.categoryGone') }}</p>

        <QSelect
          v-model="tagsModel"
          :label="t('rules.fields.tags')"
          :hint="t('rules.tagsHint')"
          outlined
          dense
          multiple
          use-chips
          use-input
          hide-dropdown-icon
          new-value-mode="add-unique"
          :disable="readOnly"
        />

        <span class="label">{{ t('rules.fields.description') }}</span>
        <MiniRichText
          :model-value="rule.description"
          :item-key="rule.id"
          :label="t('rules.fields.description')"
          :disabled="readOnly"
          @update:model-value="setDoc('description', $event)"
        />

        <span class="label">{{ t('rules.fields.exceptions') }}</span>
        <MiniRichText
          :model-value="rule.exceptions"
          :item-key="rule.id"
          :label="t('rules.fields.exceptions')"
          :disabled="readOnly"
          @update:model-value="setDoc('exceptions', $event)"
        />

        <h2 class="label used-title">{{ t('rules.usedIn') }}</h2>
        <p v-if="!used.length" class="muted">{{ t('rules.usedInNone') }}</p>
        <ul v-else class="used">
          <li v-for="u in used" :key="u.nodeId">
            <button type="button" class="link" @click="jump(u)">
              {{ u.nodeTitle || t('timelines.untitled') }}
              <span class="muted">· {{ u.timelineName }}</span>
            </button>
          </li>
        </ul>

        <h2 class="label used-title">{{ t('rules.usedByEntries.title') }}</h2>
        <p v-if="!usedByEntries.length" class="muted">{{ t('rules.usedByEntries.none') }}</p>
        <ul v-else class="used">
          <li v-for="e in usedByEntries" :key="e.id">
            <button
              type="button"
              class="link"
              :aria-label="
                t('rules.usedByEntries.open', { name: e.name || t('rules.usedByEntries.untitled') })
              "
              @click="openEntry(e.id)"
            >
              {{ e.name || t('rules.usedByEntries.untitled') }}
            </button>
          </li>
        </ul>

        <QBtn
          v-if="!readOnly"
          flat
          no-caps
          color="negative"
          icon="delete_outline"
          class="del"
          :label="t('rules.deleteRule')"
          @click="deleteOpen = true"
        />
      </template>
      <p v-else class="muted empty">
        {{ hasAnything ? t('rules.selectOne') : t('rules.noRulesHint') }}
      </p>
    </div>

    <RuleCategoryDialog v-model="categoriesOpen" />

    <QDialog v-model="deleteOpen">
      <QCard class="dialog" role="alertdialog" aria-labelledby="rule-del-title">
        <QCardSection>
          <h2 id="rule-del-title" class="dlg-title">{{ t('rules.deleteRule') }}</h2>
          <p>{{ t('rules.deleteConfirm', { title: rule?.title || t('rules.untitled') }) }}</p>
          <p v-if="deleteLinks > 0" class="warn">{{ t('rules.deleteLinks', deleteLinks) }}</p>
        </QCardSection>
        <QCardActions align="right">
          <QBtn flat no-caps :label="t('rules.cancel')" @click="deleteOpen = false" />
          <QBtn flat no-caps color="negative" :label="t('rules.deleteRule')" @click="doDelete" />
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
  max-width: 44rem;
  padding: 1.25rem 1.5rem;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.btn-section {
  background: var(--section-rules);
  color: var(--section-rules-on);
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
  border-color: var(--section-rules);
  background: var(--section-rules);
  color: var(--section-rules-on);
}
.dot {
  display: inline-block;
  flex: none;
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
}
.group-title {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin: 0.5rem 0 0.25rem;
  color: var(--section-rules);
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
.invalid {
  display: flex;
  gap: 0.375rem;
  padding: 0.3rem 0.5rem;
  color: var(--section-checks);
}
.invalid .item-title {
  color: var(--text-primary);
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
  color: var(--section-rules);
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
.label {
  margin: 0.5rem 0 0;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.used-title {
  margin-top: 1rem;
}
.used {
  margin: 0;
  padding: 0;
  list-style: none;
}
.used li {
  padding: 0.125rem 0;
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
