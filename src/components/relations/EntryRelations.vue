<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import { useCodexStore } from '../../codex/store'
import { jumpToNode } from '../../composables/useJump'
import { docText } from '../../relations/form'
import { useRelationsStore } from '../../relations/store'
import { describeTarget } from '../../timeline/pick'
import { useTimelinesStore } from '../../timeline/store'
import { formatDate } from '../../calendar'
import GroupsDialog from './GroupsDialog.vue'
import InvalidFiles from './InvalidFiles.vue'
import RelationshipDialog from './RelationshipDialog.vue'
import RelationTypesDialog from './RelationTypesDialog.vue'

const props = defineProps<{ entryId: string }>()
const { t } = useI18n()
const relations = useRelationsStore()
const codex = useCodexStore()
const timelines = useTimelinesStore()

const locked = computed(() => !!relations.readOnly)

const rows = computed(() =>
  relations.relationsFor(props.entryId).map((row) => {
    const rel = row.relationship
    const other = codex.entries.find((e) => e.id === row.otherId)
    const type = codex.types.find((x) => x.id === other?.typeId)
    const relType = relations.types.find((x) => x.id === rel.typeId)
    const trashed = codex.trashedEntries.find((x) => x.id === row.otherId)
    const node = rel.nodeRef
      ? describeTarget(
          timelines.loadedTimelines,
          { item: rel.nodeRef.timelineId, block: rel.nodeRef.nodeId },
          (d) => formatDate(timelines.calendar, d),
        )
      : null
    const otherName = other
      ? other.name || t('codex.untitled')
      : trashed?.title
        ? t('relations.deletedEntry', { name: trashed.title })
        : t('relations.missingEntry')
    return {
      id: rel.id,
      direction: row.direction,
      label: row.label || t('relations.unknownType'),
      color: relType?.color ?? null,
      otherId: row.otherId,
      otherName,
      otherType: type?.name ?? null,
      otherColor: type?.color ?? null,
      broken: !other || relations.brokenRelationshipIds.includes(rel.id),
      note: docText(rel.note),
      nodeRef: rel.nodeRef,
      nodeTitle: node ? node.title || t('relations.untitledEvent') : null,
      nodeBroken: relations.brokenNodeRefIds.includes(rel.id) || (!!rel.nodeRef && !node),
    }
  }),
)

const invalidRelationships = computed(() => relations.relationshipList.filter((e) => e.status !== 'ok'))

// ---- dialogs ----
const dialogOpen = ref(false)
const editId = ref<string | null>(null)
const typesOpen = ref(false)
const groupsOpen = ref(false)
function openAdd(): void {
  editId.value = null
  dialogOpen.value = true
}
function openEdit(id: string): void {
  editId.value = id
  dialogOpen.value = true
}

async function remove(id: string): Promise<void> {
  if (!(await relations.deleteRelationship(id)))
    Notify.create({ type: 'negative', message: t('relations.removeFailed'), position: 'bottom', timeout: 5000 })
}

async function goNode(ref: { timelineId: string; nodeId: string }): Promise<void> {
  const r = await jumpToNode(ref.timelineId, ref.nodeId)
  if (!r.ok)
    Notify.create({ type: 'warning', message: t('codex.jumpFailed'), position: 'bottom', timeout: 5000 })
}

// ---- groups of this entry ----
const myGroups = computed(() => relations.groupsOfEntry(props.entryId))
const groupOptions = computed(() =>
  relations.groups
    .filter((g) => !g.memberIds.includes(props.entryId))
    .map((g) => ({ value: g.id, label: g.name })),
)
function addToGroup(groupId: string | null): void {
  if (groupId && !relations.addMember(groupId, props.entryId).ok) groupFailed()
}
function removeFromGroup(groupId: string): void {
  if (!relations.removeMember(groupId, props.entryId).ok) groupFailed()
}
const groupFailed = () =>
  Notify.create({ type: 'negative', message: t('relations.groups.failed'), position: 'bottom', timeout: 5000 })
</script>

<template>
  <div class="rel">
    <div class="actions">
      <QBtn
        unelevated
        no-caps
        icon="add"
        class="btn-section"
        :label="t('relations.add')"
        :disable="locked || codex.entries.length < 2"
        @click="openAdd"
      />
      <QBtn flat no-caps icon="palette" :label="t('relations.manageTypes')" @click="typesOpen = true" />
      <QBtn flat no-caps icon="groups" :label="t('relations.manageGroups')" @click="groupsOpen = true" />
    </div>

    <h2 class="label section-title first">{{ t('relations.heading') }}</h2>
    <p v-if="!rows.length" class="muted">{{ t('relations.none') }}</p>
    <ul v-else class="rows">
      <li v-for="r in rows" :key="r.id" class="row" :class="{ broken: r.broken }">
        <QIcon
          :name="r.direction === 'out' ? 'arrow_forward' : 'arrow_back'"
          size="1.125rem"
          aria-hidden="true"
        />
        <span class="vh">{{ r.direction === 'out' ? t('relations.outgoing') : t('relations.incoming') }}:</span>
        <div class="body">
          <span class="label-chip">
            <span v-if="r.color" class="dot" :style="{ background: r.color }" aria-hidden="true" />{{ r.label }}
          </span>
          <div class="main">
            <span v-if="r.broken" class="gone">
              <QIcon name="error_outline" size="1rem" aria-hidden="true" />
              {{ r.otherName }}
            </span>
            <button
              v-else
              type="button"
              class="link"
              :aria-label="t('relations.openEntry', { name: r.otherName })"
              @click="codex.select(r.otherId)"
            >
              {{ r.otherName }}
            </button>
            <span v-if="r.otherType && !r.broken" class="muted">
              <span class="dot" :style="{ background: r.otherColor ?? undefined }" aria-hidden="true" />{{ r.otherType }}
            </span>
            <span v-if="r.broken" class="muted">{{ t('relations.brokenRow') }}</span>
            <span v-if="r.note" class="muted note">{{ r.note }}</span>
            <span v-if="r.nodeRef" class="node">
              <template v-if="r.nodeBroken">
                <span class="gone">
                  <QIcon name="error_outline" size="1rem" aria-hidden="true" />
                  {{ t('relations.nodeBroken') }}
                </span>
              </template>
              <button
                v-else
                type="button"
                class="link"
                :aria-label="t('relations.nodeGo', { title: r.nodeTitle ?? '' })"
                @click="goNode(r.nodeRef)"
              >
                <QIcon name="event" size="1rem" aria-hidden="true" /> {{ r.nodeTitle }}
              </button>
            </span>
          </div>
        </div>
        <template v-if="!locked">
          <QBtn
            flat
            round
            dense
            icon="edit"
            :aria-label="t('relations.edit', { name: r.otherName })"
            @click="openEdit(r.id)"
          />
          <QBtn
            flat
            round
            dense
            icon="delete_outline"
            :aria-label="t('relations.remove', { name: r.otherName })"
            @click="remove(r.id)"
          />
        </template>
      </li>
    </ul>
    <InvalidFiles :items="invalidRelationships" :heading="t('relations.invalid.heading')" />

    <h2 class="label section-title">{{ t('relations.groups.heading') }}</h2>
    <p v-if="!relations.groups.length" class="muted">{{ t('relations.groups.noGroups') }}</p>
    <template v-else>
      <p v-if="!myGroups.length" class="muted">{{ t('relations.groups.none') }}</p>
      <ul v-else class="chips">
        <li v-for="g in myGroups" :key="g.id" class="chip">
          <span class="dot" :style="{ background: g.color }" aria-hidden="true" />
          <span>{{ g.name }}</span>
          <QBtn
            v-if="!locked"
            flat
            round
            dense
            size="sm"
            icon="close"
            :aria-label="t('relations.groups.remove', { name: g.name })"
            @click="removeFromGroup(g.id)"
          />
        </li>
      </ul>
      <QSelect
        v-if="!locked"
        :model-value="null"
        :options="groupOptions"
        :label="groupOptions.length ? t('relations.groups.add') : t('relations.groups.allIn')"
        class="adder"
        outlined
        dense
        hide-selected
        emit-value
        map-options
        options-dense
        :disable="!groupOptions.length"
        @update:model-value="addToGroup"
      />
    </template>

    <RelationshipDialog v-model="dialogOpen" :entry-id="entryId" :relationship-id="editId" />
    <RelationTypesDialog v-model="typesOpen" />
    <GroupsDialog v-model="groupsOpen" />
  </div>
</template>

<style scoped>
.rel {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.btn-section {
  background: var(--section-codex);
  color: var(--section-codex-on);
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
  margin-top: 0.5rem;
}
.muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.rows,
.chips {
  margin: 0;
  padding: 0;
  list-style: none;
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
}
.row.broken {
  border-style: dashed;
  border-color: var(--section-checks);
}
.label-chip {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 600;
}
.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}
.label-chip {
  align-self: flex-start;
}
.main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  overflow-wrap: anywhere;
}
.note {
  font-style: italic;
}
.node {
  margin-top: 0.125rem;
}
.dot {
  display: inline-block;
  flex: none;
  width: 0.625rem;
  height: 0.625rem;
  margin-inline-end: 0.25rem;
  border-radius: 50%;
  background: var(--text-secondary);
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
.link:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.gone {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--section-checks);
  font-size: 0.875rem;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.25rem 0.125rem 0.625rem;
  border: 1px solid var(--section-codex);
  border-radius: 999px;
  font-size: 0.875rem;
}
.adder {
  max-width: 20rem;
}
.vh {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
