<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '../../project/store'
import { useTimelinesStore } from '../../timeline/store'

const { t } = useI18n()
const store = useTimelinesStore()
const project = useProjectStore()

const renamingId = ref<string | null>(null)
const renameText = ref('')
const deleteId = ref<string | null>(null)
const deleteName = ref('')
const deleteLinks = computed(() =>
  deleteId.value ? project.linksBrokenByDeletingTimeline(deleteId.value) : 0,
)

const vFocus = {
  mounted: (el: HTMLInputElement) => {
    el.focus()
    el.select()
  },
}

function startRename(id: string, name: string): void {
  renamingId.value = id
  renameText.value = name
}
function commitRename(): void {
  const id = renamingId.value
  renamingId.value = null // blur fires after Enter; the guard keeps it from running twice
  if (id) store.renameTimeline(id, renameText.value)
}

async function create(): Promise<void> {
  const id = await store.createTimeline(t('timelines.newTimeline'))
  if (!id) return
  await nextTick()
  startRename(id, store.entries.find((e) => e.id === id)?.name ?? '')
}

function askDelete(id: string, name: string): void {
  deleteId.value = id
  deleteName.value = name
}
async function doDelete(): Promise<void> {
  const id = deleteId.value
  deleteId.value = null
  if (id) await store.deleteTimeline(id)
}
</script>

<template>
  <div class="tls">
    <ul class="list" :aria-label="t('timelineView.timelineList')">
      <li
        v-for="e in store.entries"
        :key="e.id"
        class="row"
        :class="{ current: e.id === store.currentId }"
      >
        <input
          v-if="renamingId === e.id"
          v-model="renameText"
          v-focus
          class="rename"
          :aria-label="t('timelineView.newName')"
          @keydown.enter.prevent="commitRename"
          @keydown.esc.prevent="renamingId = null"
          @blur="commitRename"
        />
        <template v-else>
          <button
            type="button"
            class="name"
            :aria-current="e.id === store.currentId ? 'true' : undefined"
            :disabled="e.status !== 'ok'"
            :title="e.status !== 'ok' ? t(`timelines.status.${e.status}`) : undefined"
            @click="store.select(e.id)"
          >
            <QIcon v-if="e.status !== 'ok'" name="error_outline" size="1rem" aria-hidden="true" />
            {{ e.name }}
            <span v-if="e.status !== 'ok'" class="sr-only">{{
              t(`timelines.status.${e.status}`)
            }}</span>
          </button>
          <template v-if="!project.readOnly && e.status === 'ok'">
            <button
              type="button"
              class="act"
              :aria-label="t('timelineView.rename', { name: e.name })"
              :title="t('timelines.renameTimeline')"
              @click="startRename(e.id, e.name)"
            >
              <QIcon name="edit" size="1rem" />
            </button>
            <button
              type="button"
              class="act"
              :aria-label="t('timelineView.remove', { name: e.name })"
              :title="t('timelines.deleteTimeline')"
              @click="askDelete(e.id, e.name)"
            >
              <QIcon name="delete_outline" size="1rem" />
            </button>
          </template>
        </template>
      </li>
    </ul>
    <p v-if="!store.entries.length" class="none">{{ t('timelines.noTimelines') }}</p>
    <button v-if="!project.readOnly" type="button" class="add" @click="create">
      <QIcon name="add" size="1rem" aria-hidden="true" /> {{ t('timelines.newTimeline') }}
    </button>
    <RouterLink :to="{ name: 'settings', hash: '#calendar' }" class="cal">
      <QIcon name="calendar_month" size="1rem" aria-hidden="true" />
      {{ t('timelineView.calendar') }}
    </RouterLink>

    <QDialog :model-value="!!deleteId" @update:model-value="deleteId = null">
      <QCard class="confirm" role="alertdialog" aria-labelledby="tls-del-title">
        <QCardSection>
          <h2 id="tls-del-title" class="confirm-title">{{ t('timelines.deleteTimeline') }}</h2>
          <p>{{ t('timelines.deleteConfirm', { name: deleteName }) }}</p>
          <p v-if="deleteLinks > 0">
            {{ t('deleteImpact.links', { n: deleteLinks }, deleteLinks) }}
          </p>
        </QCardSection>
        <QCardActions align="right">
          <QBtn flat no-caps autofocus :label="t('timelineView.cancel')" @click="deleteId = null" />
          <QBtn
            unelevated
            no-caps
            color="negative"
            :label="t('timelineView.delete')"
            @click="doDelete"
          />
        </QCardActions>
      </QCard>
    </QDialog>
  </div>
</template>

<style scoped>
.tls {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  color: var(--text-primary);
}
.list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.row {
  display: flex;
  align-items: center;
  border-radius: 0.25rem;
}
.row:hover,
.row.current {
  background: var(--bg-selected);
}
.row.current .name {
  font-weight: 600;
}
.name,
.act,
.add,
.cal {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  text-decoration: none;
  cursor: pointer;
}
.name {
  flex: 1;
  min-width: 0;
  padding: 0.25rem 0.375rem;
}
.name:disabled {
  color: var(--text-secondary);
  cursor: default;
}
.act {
  padding: 0.25rem;
  border-radius: 0.25rem;
  color: var(--text-secondary);
  opacity: 0.55;
}
.row:hover .act,
.row:focus-within .act,
.act:focus-visible {
  opacity: 1;
}
.add,
.cal {
  padding: 0.25rem 0.375rem;
  color: var(--text-secondary);
}
.add:hover,
.cal:hover {
  color: var(--text-primary);
}
.cal {
  margin-top: 0.25rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
}
.rename {
  flex: 1;
  min-width: 0;
  padding: 0.125rem 0.25rem;
  border: 1px solid var(--focus-ring);
  border-radius: 0.25rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
}
.none {
  margin: 0;
  padding: 0.25rem 0.375rem;
  color: var(--text-secondary);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.confirm {
  min-width: min(26rem, 90vw);
  background: var(--bg-raised);
  color: var(--text-primary);
}
.confirm-title {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
}
</style>
