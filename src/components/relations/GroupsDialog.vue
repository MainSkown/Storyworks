<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import { useCodexStore } from '../../codex/store'
import { entryOptions } from '../../relations/form'
import { useRelationsStore } from '../../relations/store'
import InvalidFiles from './InvalidFiles.vue'

const open = defineModel<boolean>({ required: true })
const { t } = useI18n()
const store = useRelationsStore()
const codex = useCodexStore()

const newName = ref('')
const newColor = ref('#8e4a9e')

const locked = computed(() => !!store.readOnly)
const invalid = computed(() => store.groupList.filter((e) => e.status !== 'ok'))

function notifyFail(): void {
  Notify.create({ type: 'negative', message: t('groupsMgr.failed'), position: 'bottom', timeout: 5000 })
}

async function add(): Promise<void> {
  if (!(await store.createGroup(newName.value, newColor.value))) return notifyFail()
  newName.value = ''
}

const groupOf = (id: string) => store.groups.find((g) => g.id === id)
function rename(id: string, ev: Event): void {
  const input = ev.target as HTMLInputElement
  if (!store.updateGroup(id, { name: input.value }).ok) input.value = groupOf(id)?.name ?? ''
}
const recolor = (id: string, ev: Event) =>
  store.updateGroup(id, { color: (ev.target as HTMLInputElement).value })

// ---- members ----
const liveIds = computed(() => new Set(codex.entries.map((e) => e.id)))
function memberName(id: string): string {
  const live = codex.entries.find((e) => e.id === id)
  if (live) return live.name || t('codex.untitled')
  return codex.trashedEntries.find((x) => x.id === id)?.title || t('groupsMgr.missingMember')
}
const queries = reactive<Record<string, string>>({})
const optionsFor = (groupId: string) =>
  entryOptions(codex.entries, codex.types, queries[groupId] ?? '', groupOf(groupId)?.memberIds ?? [])
function filterMembers(groupId: string, val: string, update: (fn: () => void) => void): void {
  update(() => {
    queries[groupId] = val
  })
}
function addMember(groupId: string, entryId: string | null): void {
  queries[groupId] = ''
  if (entryId && !store.addMember(groupId, entryId).ok) notifyFail()
}
function removeMember(groupId: string, entryId: string): void {
  if (!store.removeMember(groupId, entryId).ok) notifyFail()
}

// ---- delete ----
const deleteId = ref<string | null>(null)
const deleting = computed(() => (deleteId.value ? (groupOf(deleteId.value) ?? null) : null))
async function doDelete(): Promise<void> {
  const id = deleteId.value
  if (!id) return
  deleteId.value = null
  if (!(await store.deleteGroup(id))) notifyFail()
}
</script>

<template>
  <QDialog v-model="open">
    <QCard class="dialog" role="dialog" aria-labelledby="groups-title">
      <QCardSection class="body">
        <h2 id="groups-title" class="title">{{ t('groupsMgr.title') }}</h2>
        <ul class="list">
          <li v-for="g in store.groups" :key="g.id" class="group">
            <div class="row">
              <input
                type="color"
                class="swatch"
                :value="g.color"
                :aria-label="t('groupsMgr.color', { name: g.name })"
                :disabled="locked"
                @change="recolor(g.id, $event)"
              />
              <input
                class="name"
                :value="g.name"
                :aria-label="t('groupsMgr.rename', { name: g.name })"
                :readonly="locked"
                @change="rename(g.id, $event)"
                @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
              />
              <span class="count">{{ t('groupsMgr.memberCount', g.memberIds.length) }}</span>
              <QBtn
                flat
                round
                dense
                icon="delete_outline"
                :aria-label="t('groupsMgr.delete', { name: g.name })"
                :disable="locked"
                @click="deleteId = g.id"
              />
            </div>
            <div role="group" :aria-label="t('groupsMgr.members', { name: g.name })">
              <p v-if="!g.memberIds.length" class="muted">{{ t('groupsMgr.noMembers') }}</p>
              <ul v-else class="chips">
                <li
                  v-for="m in g.memberIds"
                  :key="m"
                  class="chip"
                  :class="{ gone: !liveIds.has(m) }"
                  :title="liveIds.has(m) ? undefined : t('groupsMgr.missingHint')"
                >
                  <QIcon v-if="!liveIds.has(m)" name="error_outline" size="1rem" aria-hidden="true" />
                  <span>{{ memberName(m) }}</span>
                  <span v-if="!liveIds.has(m)" class="vh">{{ t('groupsMgr.missingHint') }}</span>
                  <QBtn
                    v-if="!locked"
                    flat
                    round
                    dense
                    size="sm"
                    icon="close"
                    :aria-label="t('groupsMgr.removeMember', { member: memberName(m), group: g.name })"
                    @click="removeMember(g.id, m)"
                  />
                </li>
              </ul>
              <QSelect
                v-if="!locked"
                :model-value="null"
                :options="optionsFor(g.id)"
                :label="t('groupsMgr.addMember')"
                class="adder"
                outlined
                dense
                use-input
                hide-selected
                input-debounce="0"
                options-dense
                emit-value
                map-options
                @filter="(val: string, update: (fn: () => void) => void) => filterMembers(g.id, val, update)"
                @update:model-value="addMember(g.id, $event)"
              >
                <template #option="{ opt, itemProps }">
                  <QItem v-bind="itemProps">
                    <QItemSection>{{ opt.label }}</QItemSection>
                    <QItemSection v-if="opt.typeName" side class="muted">
                      <span class="type-tag">
                        <span class="dot" :style="{ background: opt.typeColor ?? undefined }" aria-hidden="true" />{{ opt.typeName }}
                      </span>
                    </QItemSection>
                  </QItem>
                </template>
                <template #no-option>
                  <QItem><QItemSection class="muted">{{ t('groupsMgr.noMatch') }}</QItemSection></QItem>
                </template>
              </QSelect>
            </div>
          </li>
        </ul>
        <p v-if="!store.groups.length" class="muted">{{ t('groupsMgr.none') }}</p>
        <form v-if="!locked" class="row add" @submit.prevent="add">
          <input
            v-model="newColor"
            type="color"
            class="swatch"
            :aria-label="t('groupsMgr.newColor')"
          />
          <input
            v-model="newName"
            class="name"
            :placeholder="t('groupsMgr.newName')"
            :aria-label="t('groupsMgr.newName')"
          />
          <QBtn
            unelevated
            no-caps
            type="submit"
            class="btn-section"
            :label="t('groupsMgr.add')"
            :disable="!newName.trim()"
          />
        </form>
        <InvalidFiles :items="invalid" :heading="t('groupsMgr.invalidHeading')" />
      </QCardSection>
      <QCardActions align="right">
        <QBtn flat no-caps :label="t('groupsMgr.close')" @click="open = false" />
      </QCardActions>
    </QCard>
  </QDialog>

  <QDialog :model-value="!!deleting" @update:model-value="deleteId = null">
    <QCard v-if="deleting" class="dialog small" role="alertdialog" aria-labelledby="group-del-title">
      <QCardSection>
        <h2 id="group-del-title" class="title">
          {{ t('groupsMgr.deleteTitle', { name: deleting.name }) }}
        </h2>
        <p>{{ t('groupsMgr.deleteMembers', deleting.memberIds.length) }}</p>
      </QCardSection>
      <QCardActions align="right">
        <QBtn flat no-caps :label="t('groupsMgr.cancel')" @click="deleteId = null" />
        <QBtn
          flat
          no-caps
          color="negative"
          :label="t('groupsMgr.deleteConfirm')"
          @click="doDelete"
        />
      </QCardActions>
    </QCard>
  </QDialog>
</template>

<style scoped>
.dialog {
  min-width: min(40rem, 94vw);
  background: var(--bg-raised);
  color: var(--text-primary);
}
.dialog.small {
  min-width: min(24rem, 90vw);
}
.body {
  max-height: 70vh;
  overflow-y: auto;
}
.title {
  margin: 0 0 0.75rem;
  font-size: 1.15rem;
}
.list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.group {
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border);
}
.row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
}
.add {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}
.swatch {
  flex: none;
  width: 2.25rem;
  height: 1.75rem;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
  cursor: pointer;
}
.name {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
}
.swatch:focus-visible,
.name:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.count,
.muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.count {
  flex: none;
  min-width: 5rem;
  text-align: end;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin: 0.25rem 0 0.5rem;
  padding: 0;
  list-style: none;
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
.chip.gone {
  border-style: dashed;
  border-color: var(--section-checks);
  color: var(--section-checks);
}
.adder {
  max-width: 20rem;
}
.type-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.dot {
  display: inline-block;
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
  background: var(--text-secondary);
}
.vh {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.btn-section {
  background: var(--section-codex);
  color: var(--section-codex-on);
}
</style>
