<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import { useCodexStore } from '../codex/store'

const open = defineModel<boolean>({ required: true })
const { t } = useI18n()
const store = useCodexStore()

const ICONS = [
  'person',
  'groups',
  'pets',
  'inventory_2',
  'place',
  'flag',
  'location_city',
  'home_work',
  'public',
  'castle',
  'auto_stories',
  'bolt',
  'shield',
  'event',
  'forest',
  'diamond',
  'category',
  'label',
]
const iconOptions = (current: string) =>
  (ICONS.includes(current) ? ICONS : [current, ...ICONS]).map((i) => ({ value: i, label: i }))

const newName = ref('')
const newColor = ref('#8e4a9e')
const newIcon = ref('label')

const locked = computed(() => !!store.readOnly)
const entryCount = (typeId: string) => store.entries.filter((e) => e.typeId === typeId).length

function notifyFail(): void {
  Notify.create({
    type: 'negative',
    message: t('codex.types.failed'),
    position: 'bottom',
    timeout: 5000,
  })
}

async function add(): Promise<void> {
  const id = await store.createType(newName.value, newColor.value, newIcon.value)
  if (!id) return notifyFail()
  newName.value = ''
}

function rename(id: string, ev: Event): void {
  const input = ev.target as HTMLInputElement
  const r = store.updateType(id, { name: input.value })
  if (!r.ok) input.value = store.types.find((c) => c.id === id)?.name ?? ''
}
const recolor = (id: string, ev: Event) =>
  store.updateType(id, { color: (ev.target as HTMLInputElement).value })
const setIcon = (id: string, icon: string) => store.updateType(id, { icon })

// ---- delete ----
const deleteId = ref<string | null>(null)
const target = ref<string | null>(null)
const deleting = computed(() => store.types.find((c) => c.id === deleteId.value) ?? null)
const moving = computed(() => (deleteId.value ? entryCount(deleteId.value) : 0))
const targets = computed(() =>
  store.types.filter((c) => c.id !== deleteId.value).map((c) => ({ value: c.id, label: c.name })),
)
const canDelete = computed(
  () => !!deleteId.value && store.planDeleteType(deleteId.value, target.value).ok,
)

function askDelete(id: string): void {
  deleteId.value = id
  target.value = store.types.find((c) => c.id !== id)?.id ?? null
}
async function doDelete(): Promise<void> {
  const id = deleteId.value
  if (!id) return
  deleteId.value = null
  const r = await store.deleteType(id, target.value)
  if (!r.ok) notifyFail()
}
</script>

<template>
  <QDialog v-model="open">
    <QCard class="dialog" role="dialog" aria-labelledby="codex-types-title">
      <QCardSection>
        <h2 id="codex-types-title" class="title">{{ t('codex.types.title') }}</h2>
        <ul class="list">
          <li v-for="c in store.types" :key="c.id" class="row">
            <input
              type="color"
              class="swatch"
              :value="c.color"
              :aria-label="t('codex.types.color', { name: c.name })"
              :disabled="locked"
              @change="recolor(c.id, $event)"
            />
            <QSelect
              :model-value="c.icon"
              :options="iconOptions(c.icon)"
              :aria-label="t('codex.types.icon', { name: c.name })"
              class="icon-select"
              outlined
              dense
              emit-value
              map-options
              options-dense
              :disable="locked"
              @update:model-value="setIcon(c.id, $event)"
            >
              <template #selected><QIcon :name="c.icon" /></template>
              <template #option="{ opt, itemProps }">
                <QItem v-bind="itemProps">
                  <QItemSection avatar><QIcon :name="opt.value" /></QItemSection>
                  <QItemSection>{{ opt.label }}</QItemSection>
                </QItem>
              </template>
            </QSelect>
            <input
              class="name"
              :value="c.name"
              :aria-label="t('codex.types.rename', { name: c.name })"
              :readonly="locked"
              @change="rename(c.id, $event)"
              @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
            />
            <span class="count">{{ t('codex.types.entryCount', entryCount(c.id)) }}</span>
            <QBtn
              flat
              round
              dense
              icon="delete_outline"
              :aria-label="t('codex.types.delete', { name: c.name })"
              :disable="locked || store.types.length <= 1"
              @click="askDelete(c.id)"
            />
          </li>
        </ul>
        <p v-if="!store.types.length" class="muted">{{ t('codex.types.none') }}</p>
        <p v-else-if="store.types.length === 1" class="muted">{{ t('codex.types.last') }}</p>
        <form v-if="!locked" class="row add" @submit.prevent="add">
          <input
            v-model="newColor"
            type="color"
            class="swatch"
            :aria-label="t('codex.types.newColor')"
          />
          <QSelect
            v-model="newIcon"
            :options="iconOptions(newIcon)"
            :aria-label="t('codex.types.newIcon')"
            class="icon-select"
            outlined
            dense
            emit-value
            map-options
            options-dense
          >
            <template #selected><QIcon :name="newIcon" /></template>
            <template #option="{ opt, itemProps }">
              <QItem v-bind="itemProps">
                <QItemSection avatar><QIcon :name="opt.value" /></QItemSection>
                <QItemSection>{{ opt.label }}</QItemSection>
              </QItem>
            </template>
          </QSelect>
          <input
            v-model="newName"
            class="name"
            :placeholder="t('codex.types.newName')"
            :aria-label="t('codex.types.newName')"
          />
          <QBtn
            unelevated
            no-caps
            type="submit"
            class="btn-section"
            :label="t('codex.types.add')"
            :disable="!newName.trim()"
          />
        </form>
      </QCardSection>
      <QCardActions align="right">
        <QBtn flat no-caps :label="t('codex.types.close')" @click="open = false" />
      </QCardActions>
    </QCard>
  </QDialog>

  <QDialog :model-value="!!deleting" @update:model-value="deleteId = null">
    <QCard v-if="deleting" class="dialog" role="alertdialog" aria-labelledby="codex-type-del-title">
      <QCardSection>
        <h2 id="codex-type-del-title" class="title">
          {{ t('codex.types.deleteTitle', { name: deleting.name }) }}
        </h2>
        <p v-if="moving === 0">{{ t('codex.types.deleteEmpty') }}</p>
        <template v-else>
          <p>{{ t('codex.types.deleteMoves', moving) }}</p>
          <QSelect
            v-model="target"
            :options="targets"
            :label="t('codex.types.moveTo')"
            outlined
            dense
            emit-value
            map-options
            options-dense
          />
        </template>
      </QCardSection>
      <QCardActions align="right">
        <QBtn flat no-caps :label="t('codex.cancel')" @click="deleteId = null" />
        <QBtn
          flat
          no-caps
          color="negative"
          :label="t('codex.types.deleteConfirm')"
          :disable="!canDelete"
          @click="doDelete"
        />
      </QCardActions>
    </QCard>
  </QDialog>
</template>

<style scoped>
.dialog {
  min-width: min(36rem, 90vw);
  background: var(--bg-raised);
  color: var(--text-primary);
}
.title {
  margin: 0 0 0.75rem;
  font-size: 1.15rem;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
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
.icon-select {
  flex: none;
  width: 4.5rem;
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
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.count {
  flex: none;
  min-width: 5rem;
  text-align: end;
}
.btn-section {
  background: var(--section-codex);
  color: var(--section-codex-on);
}
</style>
