<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify, type QSelect } from 'quasar'
import CodexTypeDialog from '../components/CodexTypeDialog.vue'
import EntryAppearsIn from '../components/codex/EntryAppearsIn.vue'
import EntryMentions from '../components/codex/EntryMentions.vue'
import EntryChronicle from '../components/codex/EntryChronicle.vue'
import EntryRelations from '../components/relations/EntryRelations.vue'
import EntryKnowledge from '../components/knowledge/EntryKnowledge.vue'
import EntryStates from '../components/states/EntryStates.vue'
import MiniRichText from '../components/MiniRichText.vue'
import { jumpToNode } from '../composables/useJump'
import { useEntryMentions } from '../codex/useEntryMentions'
import IconExpandBtn from '../components/IconExpandBtn.vue'
import { useCodexStore } from '../codex/store'
import { imageExt } from '../editor/projectImage'
import { pickImage } from '../project/pickImage'
import type { EntryUsage } from '../project/codex'
import { brokenByDeletingEntry, relationImpactOfEntry } from '../project/deleteImpact'
import { mechanicLinkCount } from '../project/mechanicImpact'
import { useMechanicsStore } from '../gamedoc/mechanicsStore'
import { useKnowledgeStore } from '../knowledge/store'
import { useRelationsStore } from '../relations/store'
import { useProjectStore } from '../project/store'
import { openRule } from '../rules/openRule'
import { useRulesStore } from '../rules/store'

const { t } = useI18n()
const store = useCodexStore()
const rulesStore = useRulesStore()
const relationsStore = useRelationsStore()
const knowledgeStore = useKnowledgeStore()
const project = useProjectStore()
const uid = useId()

const readOnly = computed(() => !!store.readOnly)
const entry = computed(() => store.selected)
const invalidEntries = computed(() => store.entryList.filter((e) => e.status !== 'ok'))
const hasAnything = computed(() => store.entryList.length > 0)
const noMatch = computed(
  () => store.filterActive && store.filteredEntries.length === 0 && store.entries.length > 0,
)
const used = computed<EntryUsage[]>(() => (entry.value ? store.usedInNodes(entry.value.id) : []))
const groups = computed(() => store.groups.filter((g) => g.entries.length > 0))
const canCreate = computed(() => !readOnly.value && store.types.length > 0)

const typeOf = (id: string) => store.types.find((x) => x.id === id) ?? null

// ---- tabs and mentions ----
const tab = ref<
  'details' | 'links' | 'relations' | 'states' | 'knowledge' | 'chronicle' | 'mentions'
>('details')
const scan = useEntryMentions(() => entry.value)
const mentions = computed(() => scan.mentions.value.filter((m) => m.entryId === entry.value?.id))
const mentionCount = computed(() => mentions.value.length)

// ---- editor fields ----
const nameText = ref('')
watch(
  () => [entry.value?.id, entry.value?.name] as const,
  () => {
    nameText.value = entry.value?.name ?? ''
  },
  { immediate: true },
)
function saveName(): void {
  if (entry.value && nameText.value.trim() !== entry.value.name)
    store.updateEntry(entry.value.id, { name: nameText.value })
  nameText.value = entry.value?.name ?? ''
}
const typeOptions = computed(() => store.types.map((x) => ({ value: x.id, label: x.name })))
const typeModel = computed({
  get: () => entry.value?.typeId ?? null,
  set: (v: string | null) => {
    if (entry.value && v) store.updateEntry(entry.value.id, { typeId: v })
  },
})
const aliasesModel = computed({
  get: () => entry.value?.aliases ?? [],
  set: (v: string[]) => {
    if (entry.value) store.updateEntry(entry.value.id, { aliases: v })
  },
})
const tagsModel = computed({
  get: () => entry.value?.tags ?? [],
  set: (v: string[]) => {
    if (entry.value) store.updateEntry(entry.value.id, { tags: v })
  },
})
const setNotes = (doc: Record<string, unknown>) => {
  if (entry.value) store.updateEntry(entry.value.id, { notes: doc })
}
const appendixModel = computed({
  get: () => entry.value?.appendixText ?? '',
  set: (v: string) => {
    if (entry.value) store.updateEntry(entry.value.id, { appendixText: v })
  },
})
const includeModel = computed({
  get: () => entry.value?.includeInAppendices ?? false,
  set: (v: boolean) => {
    if (entry.value) store.updateEntry(entry.value.id, { includeInAppendices: v })
  },
})

// ---- aliases: a duplicate is dropped by the store, so say so ----
function onAliases(v: string[]): void {
  const keys = new Set(v.map((a) => a.trim().toLowerCase()).filter(Boolean))
  if (keys.size < v.filter((a) => a.trim()).length)
    Notify.create({
      type: 'info',
      message: t('codex.aliasDuplicate'),
      position: 'bottom',
      timeout: 3000,
    })
  aliasesModel.value = v
}

// ---- image ----
const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}
const imageUrl = ref('')
const imageMissing = ref(false)
let imageToken = 0
function revoke(): void {
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = ''
}
watch(
  () => entry.value?.image ?? null,
  async (path) => {
    const mine = ++imageToken
    revoke()
    imageMissing.value = false
    if (!path) return
    let bytes: Uint8Array | null
    try {
      bytes = await project.readAsset(path)
    } catch {
      bytes = null
    }
    if (mine !== imageToken) return
    if (!bytes) {
      imageMissing.value = true
      return
    }
    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    imageUrl.value = URL.createObjectURL(
      new Blob([bytes as Uint8Array<ArrayBuffer>], { type: MIME[ext] ?? '' }),
    )
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  imageToken++
  revoke()
})

const imageFailed = () =>
  Notify.create({
    type: 'negative',
    message: t('codex.imageFailed'),
    position: 'bottom',
    timeout: 5000,
  })
async function chooseImage(): Promise<void> {
  const e = entry.value
  if (!e) return
  try {
    const file = await pickImage()
    if (!file) return
    const ext = imageExt(file.name)
    if (!ext) {
      Notify.create({
        type: 'warning',
        message: t('codex.imageBadType', { name: file.name }),
        position: 'bottom',
        timeout: 5000,
      })
      return
    }
    const r = await store.importImage(e.id, file.bytes, ext)
    if (!r.ok) imageFailed()
  } catch {
    imageFailed()
  }
}
const removeImage = () => {
  if (entry.value) store.updateEntry(entry.value.id, { image: null })
}

// ---- rules on the entry ----
const ruleQuery = ref('')
const ruleSelect = ref<QSelect | null>(null)
const ruleOptions = computed(() => {
  const have = new Set(entry.value?.ruleIds ?? [])
  const q = ruleQuery.value.trim().toLowerCase()
  return rulesStore.rules
    .filter((r) => !have.has(r.id) && (!q || r.title.toLowerCase().includes(q)))
    .map((r) => ({ value: r.id, label: r.title || t('rules.untitled') }))
})
const entryRules = computed(() =>
  (entry.value?.ruleIds ?? []).map((id) => {
    const r = rulesStore.rules.find((x) => x.id === id)
    return { id, title: r ? r.title || t('rules.untitled') : null }
  }),
)
function filterRules(val: string, update: (fn: () => void) => void): void {
  update(() => {
    ruleQuery.value = val
  })
}
function addRule(opt: { value: string } | null): void {
  const e = entry.value
  if (e && opt && !e.ruleIds.includes(opt.value))
    store.updateEntry(e.id, { ruleIds: [...e.ruleIds, opt.value] })
  ruleQuery.value = ''
  // fill-input would keep the picked title in the box and filter the next pick by it
  void nextTick(() => ruleSelect.value?.updateInputValue('', true))
}
function removeRule(id: string): void {
  const e = entry.value
  if (e) store.updateEntry(e.id, { ruleIds: e.ruleIds.filter((r) => r !== id) })
}

// ---- actions ----
const typesOpen = ref(false)
async function create(): Promise<void> {
  const typeId = store.filter.typeId ?? undefined
  if (store.filterActive) store.clearFilter()
  await store.createEntry({ typeId })
}

async function jump(u: EntryUsage): Promise<void> {
  const r = await jumpToNode(u.timelineId, u.nodeId)
  if (!r.ok)
    Notify.create({
      type: 'warning',
      message: t('codex.jumpFailed'),
      position: 'bottom',
      timeout: 5000,
    })
}

const mechanicsStore = useMechanicsStore()
const deleteMechanics = computed(() =>
  entry.value ? mechanicLinkCount('entry', entry.value.id, mechanicsStore.mechanics) : 0,
)
const deleteOpen = ref(false)
const deleteLinks = computed(() => used.value.length)
const deletePassages = computed(() => {
  void project.linkRevision
  const index = project.linkIndex()
  if (!entry.value) return 0
  return (index ? brokenByDeletingEntry(index, entry.value.id) : 0) + project.speakerLinesOf(entry.value.id)
})
const deleteLearnings = computed(() =>
  entry.value ? knowledgeStore.learningsOfEntry(entry.value.id).length : 0,
)
const NAMES_SHOWN = 5
const deleteRelations = computed(() => {
  const id = entry.value?.id
  if (!id) return { relationships: 0, groups: 0, relationNames: '', groupNames: '' }
  const impact = relationImpactOfEntry(id, relationsStore.relationships, relationsStore.groups)
  const names = (list: string[]) => {
    const unique = [...new Set(list)]
    const shown = unique.slice(0, NAMES_SHOWN).join(', ')
    return unique.length > NAMES_SHOWN
      ? `${shown} ${t('deleteImpact.andMore', { n: unique.length - NAMES_SHOWN })}`
      : shown
  }
  const otherName = (otherId: string) =>
    store.entries.find((e) => e.id === otherId)?.name || t('codex.untitled')
  return {
    relationships: impact.relationships.length,
    groups: impact.groups.length,
    relationNames: names(
      impact.relationships.map((r) => otherName(r.fromId === id ? r.toId : r.fromId)),
    ),
    groupNames: names(impact.groups.map((g) => g.name)),
  }
})
async function doDelete(): Promise<void> {
  deleteOpen.value = false
  if (entry.value && !(await store.deleteEntry(entry.value.id)))
    Notify.create({
      type: 'negative',
      message: t('codex.deleteFailed'),
      position: 'bottom',
      timeout: 5000,
    })
}

const errorText = (e: (typeof invalidEntries.value)[number]) =>
  e.error
    ? `${e.error.field ? `${e.error.field}: ` : ''}${e.error.message}`
    : t('codex.missingFile')
</script>

<template>
  <section class="page">
    <aside class="side" :aria-label="t('codex.listLabel')">
      <div class="bar">
        <IconExpandBtn
          icon="add"
          class="btn-section"
          :label="t('codex.newEntry')"
          :disable="!canCreate"
          @click="create"
        />
        <IconExpandBtn icon="palette" :label="t('codex.manageTypes')" @click="typesOpen = true" />
        <IconExpandBtn
          icon="hub"
          :label="t('relationGraph.open')"
          :to="{ name: 'relationships' }"
        />
        <IconExpandBtn icon="psychology" :label="t('knowledge.open')" :to="{ name: 'knowledge' }" />
        <IconExpandBtn
          end
          icon="grid_on"
          :label="t('knowledgeMatrix.open')"
          :to="{ name: 'knowledge-matrix' }"
        />
      </div>

      <QInput
        :model-value="store.filter.query"
        outlined
        dense
        clearable
        :placeholder="t('codex.search')"
        :aria-label="t('codex.search')"
        @update:model-value="store.setQuery(String($event ?? ''))"
      >
        <template #prepend><QIcon name="search" aria-hidden="true" /></template>
      </QInput>

      <div v-if="store.types.length" class="chips" role="group" :aria-label="t('codex.filterType')">
        <button
          v-for="ty in store.types"
          :key="ty.id"
          type="button"
          class="chip"
          :class="{ on: store.filter.typeId === ty.id }"
          :aria-pressed="store.filter.typeId === ty.id"
          @click="store.setTypeFilter(store.filter.typeId === ty.id ? null : ty.id)"
        >
          <span class="dot" :style="{ background: ty.color }" aria-hidden="true" />{{ ty.name }}
        </button>
      </div>
      <div
        v-if="store.allTags.length"
        class="chips"
        role="group"
        :aria-label="t('codex.filterTag')"
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
        {{ t('codex.clearFilter') }}
      </button>

      <p v-if="!store.types.length" class="muted">{{ t('codex.noTypes') }}</p>
      <p v-else-if="!hasAnything" class="muted">{{ t('codex.noEntries') }}</p>
      <p v-else-if="noMatch" class="muted">{{ t('codex.noMatch') }}</p>

      <div v-for="g in groups" :key="g.type?.id ?? 'none'" class="group">
        <h2 class="group-title">
          <QIcon
            :name="g.type?.icon ?? 'help_outline'"
            size="1rem"
            :style="{ color: g.type?.color ?? 'var(--text-secondary)' }"
            aria-hidden="true"
          />
          {{ g.type?.name ?? t('codex.noType') }}
        </h2>
        <ul class="list">
          <li v-for="e in g.entries" :key="e.id">
            <button
              type="button"
              class="item"
              :class="{ current: e.id === store.selectedId }"
              :aria-current="e.id === store.selectedId ? 'true' : undefined"
              @click="store.select(e.id)"
            >
              <span class="item-title">{{ e.name || t('codex.untitled') }}</span>
              <span v-if="e.aliases.length" class="item-tags">{{ e.aliases.join(', ') }}</span>
              <span v-if="e.tags.length" class="item-tags">{{
                e.tags.map((x) => `#${x}`).join(' ')
              }}</span>
            </button>
          </li>
        </ul>
      </div>

      <div v-if="invalidEntries.length" class="group">
        <h2 class="group-title">{{ t('codex.invalidHeading') }}</h2>
        <ul class="list">
          <li v-for="e in invalidEntries" :key="e.id" class="invalid">
            <QIcon name="error_outline" size="1rem" aria-hidden="true" />
            <div>
              <span class="item-title">{{ e.title || e.id }}</span>
              <span class="item-tags">
                {{ e.status === 'missing' ? t('codex.missingFile') : t('codex.invalidFile') }}
              </span>
              <span class="item-tags">{{ errorText(e) }}</span>
            </div>
          </li>
        </ul>
        <p class="muted">{{ t('codex.invalidHint') }}</p>
      </div>
    </aside>

    <div class="edit">
      <template v-if="entry">
        <p v-if="readOnly" class="muted" role="status">{{ t('codex.readOnly') }}</p>

        <QTabs
          v-model="tab"
          dense
          no-caps
          outside-arrows
          mobile-arrows
          align="left"
          active-color="accent"
          indicator-color="accent"
          class="tabs"
          :aria-label="t('codex.tabs')"
        >
          <QTab name="details" :label="t('codex.tabDetails')" />
          <QTab name="links" :label="t('codex.tabLinks')" />
          <QTab name="relations" :label="t('relations.tab')" />
          <QTab name="states" :label="t('states.tab')" />
          <QTab name="knowledge" :label="t('knowledge.tab')" />
          <QTab name="chronicle" :label="t('chronicle.tab')" />
          <QTab name="mentions">
            <span>{{ t('codex.tabMentions') }}</span>
            <QBadge
              v-if="mentionCount > 0"
              rounded
              class="count"
              :label="mentionCount"
              :aria-label="t('codex.mentionCount', mentionCount)"
            />
          </QTab>
        </QTabs>

        <div
          v-if="tab === 'details'"
          class="panel"
          role="tabpanel"
          :aria-label="t('codex.tabDetails')"
        >
          <label class="label" :for="`${uid}-name`">{{ t('codex.fields.name') }}</label>
          <input
            :id="`${uid}-name`"
            v-model="nameText"
            class="control"
            :placeholder="t('codex.untitled')"
            :readonly="readOnly"
            @change="saveName"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          />

          <QSelect
            v-model="typeModel"
            :options="typeOptions"
            :label="t('codex.fields.type')"
            outlined
            dense
            emit-value
            map-options
            options-dense
            :disable="readOnly"
          />
          <p v-if="!typeOf(entry.typeId)" class="warn">{{ t('codex.typeGone') }}</p>

          <span class="label">{{ t('codex.fields.image') }}</span>
          <div class="image-row">
            <img v-if="imageUrl" :src="imageUrl" class="image" :alt="entry.name" />
            <p v-else-if="imageMissing" class="warn">{{ t('codex.imageMissing') }}</p>
            <p v-else class="muted">{{ t('codex.noImage') }}</p>
            <div v-if="!readOnly" class="image-actions">
              <QBtn
                flat
                no-caps
                icon="image"
                :label="entry.image ? t('codex.changeImage') : t('codex.addImage')"
                @click="chooseImage"
              />
              <QBtn
                v-if="entry.image"
                flat
                no-caps
                icon="close"
                :label="t('codex.removeImage')"
                @click="removeImage"
              />
            </div>
          </div>

          <QSelect
            :model-value="aliasesModel"
            :label="t('codex.fields.aliases')"
            :hint="t('codex.aliasesHint')"
            outlined
            dense
            multiple
            use-chips
            use-input
            hide-dropdown-icon
            new-value-mode="add"
            :disable="readOnly"
            @update:model-value="onAliases"
          />

          <QSelect
            v-model="tagsModel"
            :label="t('codex.fields.tags')"
            :hint="t('codex.tagsHint')"
            outlined
            dense
            multiple
            use-chips
            use-input
            hide-dropdown-icon
            new-value-mode="add-unique"
            :disable="readOnly"
          />

          <span class="label">{{ t('codex.fields.notes') }}</span>
          <MiniRichText
            :model-value="entry.notes"
            :item-key="entry.id"
            :label="t('codex.fields.notes')"
            :disabled="readOnly"
            @update:model-value="setNotes"
          />

          <h2 class="label section-title">{{ t('codex.appendix') }}</h2>
          <p class="muted">{{ t('codex.appendixHint') }}</p>
          <QInput
            v-model="appendixModel"
            type="textarea"
            autogrow
            outlined
            dense
            :label="t('codex.fields.appendixText')"
            :readonly="readOnly"
          />
          <QCheckbox
            v-model="includeModel"
            :label="t('codex.includeInAppendices')"
            :disable="readOnly"
          />

          <QBtn
            v-if="!readOnly"
            flat
            no-caps
            color="negative"
            icon="delete_outline"
            class="del"
            :label="t('codex.deleteEntry')"
            @click="deleteOpen = true"
          />
        </div>

        <div
          v-else-if="tab === 'links'"
          class="panel"
          role="tabpanel"
          :aria-label="t('codex.tabLinks')"
        >
          <h2 class="label section-title first">{{ t('codex.rules') }}</h2>
          <p v-if="!entryRules.length" class="muted">{{ t('codex.rulesNone') }}</p>
          <ul v-else class="rule-chips">
            <li
              v-for="r in entryRules"
              :key="r.id"
              class="rule-chip"
              :class="{ gone: r.title === null }"
            >
              <button
                v-if="r.title !== null"
                type="button"
                class="link"
                :aria-label="t('codex.openRule', { title: r.title })"
                @click="openRule(r.id)"
              >
                {{ r.title }}
              </button>
              <span v-else class="gone-text">
                <QIcon name="error_outline" size="1rem" aria-hidden="true" />
                {{ t('codex.ruleMissing') }}
              </span>
              <QBtn
                v-if="!readOnly"
                flat
                round
                dense
                size="sm"
                icon="close"
                :aria-label="t('codex.removeRule', { title: r.title ?? t('codex.ruleMissing') })"
                @click="removeRule(r.id)"
              />
            </li>
          </ul>
          <QSelect
            v-if="!readOnly"
            ref="ruleSelect"
            :model-value="null"
            :options="ruleOptions"
            :label="t('codex.addRule')"
            outlined
            dense
            use-input
            hide-selected
            fill-input
            input-debounce="0"
            options-dense
            @filter="filterRules"
            @update:model-value="addRule"
          >
            <template #no-option>
              <QItem>
                <QItemSection class="muted">{{
                  rulesStore.rules.length ? t('codex.noRuleMatch') : t('codex.noRulesExist')
                }}</QItemSection>
              </QItem>
            </template>
          </QSelect>

          <h2 class="label section-title">{{ t('codex.usedIn') }}</h2>
          <p v-if="!used.length" class="muted">{{ t('codex.usedInNone') }}</p>
          <ul v-else class="used">
            <li v-for="u in used" :key="u.nodeId">
              <button type="button" class="link" @click="jump(u)">
                {{ u.nodeTitle || t('timelines.untitled') }}
                <span class="muted">· {{ u.timelineName }}</span>
              </button>
            </li>
          </ul>

          <h2 class="label section-title">{{ t('codex.appearsIn') }}</h2>
          <EntryAppearsIn :entry-id="entry.id" />
        </div>

        <div
          v-else-if="tab === 'relations'"
          class="panel"
          role="tabpanel"
          :aria-label="t('relations.tab')"
        >
          <EntryRelations :entry-id="entry.id" />
        </div>

        <div
          v-else-if="tab === 'states'"
          class="panel"
          role="tabpanel"
          :aria-label="t('states.tab')"
        >
          <EntryStates :entry-id="entry.id" />
        </div>

        <div
          v-else-if="tab === 'knowledge'"
          class="panel"
          role="tabpanel"
          :aria-label="t('knowledge.tab')"
        >
          <EntryKnowledge :entry-id="entry.id" />
        </div>

        <div
          v-else-if="tab === 'chronicle'"
          class="panel"
          role="tabpanel"
          :aria-label="t('chronicle.tab')"
        >
          <EntryChronicle :entry-id="entry.id" @navigate="tab = $event" />
        </div>

        <div v-else class="panel" role="tabpanel" :aria-label="t('codex.tabMentions')">
          <EntryMentions
            :mentions="mentions"
            :loading="scan.loading.value"
            :read-only="readOnly"
            @changed="scan.rescan()"
          />
        </div>
      </template>
      <p v-else class="muted empty">
        {{ hasAnything ? t('codex.selectOne') : t('codex.noEntriesHint') }}
      </p>
    </div>

    <CodexTypeDialog v-model="typesOpen" />

    <QDialog v-model="deleteOpen">
      <QCard class="dialog" role="alertdialog" aria-labelledby="codex-del-title">
        <QCardSection>
          <h2 id="codex-del-title" class="dlg-title">{{ t('codex.deleteEntry') }}</h2>
          <p>{{ t('codex.deleteConfirm', { name: entry?.name || t('codex.untitled') }) }}</p>
          <p v-if="deleteLinks > 0" class="warn">{{ t('codex.deleteLinks', deleteLinks) }}</p>
          <p v-if="deletePassages > 0" class="warn">
            {{ t('deleteImpact.links', { n: deletePassages }, deletePassages) }}
          </p>
          <p v-if="deleteMechanics > 0" class="warn">
            {{ t('deleteImpact.mechanics', { n: deleteMechanics }, deleteMechanics) }}
          </p>
          <template v-if="deleteRelations.relationships > 0">
            <p class="warn">
              {{
                t(
                  'deleteImpact.relationships',
                  { n: deleteRelations.relationships },
                  deleteRelations.relationships,
                )
              }}
            </p>
            <p class="muted">
              {{ t('deleteImpact.relationNames', { names: deleteRelations.relationNames }) }}
            </p>
          </template>
          <p v-if="deleteLearnings > 0" class="warn">
            {{ t('knowledge.deleteImpact', { n: deleteLearnings }, deleteLearnings) }}
          </p>
          <template v-if="deleteRelations.groups > 0">
            <p class="warn">
              {{ t('deleteImpact.groups', { n: deleteRelations.groups }, deleteRelations.groups) }}
            </p>
            <p class="muted">
              {{ t('deleteImpact.groupNames', { names: deleteRelations.groupNames }) }}
            </p>
          </template>
        </QCardSection>
        <QCardActions align="right">
          <QBtn flat no-caps :label="t('codex.cancel')" @click="deleteOpen = false" />
          <QBtn flat no-caps color="negative" :label="t('codex.deleteEntry')" @click="doDelete" />
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
.bar {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.25rem;
}
.bar :deep(.btn-section),
.bar :deep(.btn-section + .expand-label) {
  background: var(--section-codex);
  color: var(--section-codex-on);
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
  border-color: var(--section-codex);
  background: var(--section-codex);
  color: var(--section-codex-on);
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
  color: var(--section-codex);
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
.label {
  margin: 0.5rem 0 0;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.section-title {
  margin-top: 1rem;
}
.section-title.first {
  margin-top: 0.25rem;
}
.tabs {
  margin-bottom: 0.5rem;
  border-bottom: 1px solid var(--border);
}
.panel {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.count {
  margin-inline-start: 0.375rem;
  background: var(--section-codex);
  color: var(--section-codex-on);
}
.image-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}
.image {
  max-width: 12rem;
  max-height: 12rem;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  object-fit: contain;
}
.image-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.rule-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.rule-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  padding: 0.125rem 0.25rem 0.125rem 0.625rem;
  border: 1px solid var(--section-codex);
  border-radius: 999px;
}
.rule-chip.gone {
  border-color: var(--section-checks);
  color: var(--section-checks);
}
.gone-text {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.875rem;
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
