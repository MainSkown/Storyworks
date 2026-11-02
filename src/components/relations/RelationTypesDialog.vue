<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import { useRelationsStore } from '../../relations/store'
import InvalidFiles from './InvalidFiles.vue'

const open = defineModel<boolean>({ required: true })
const { t } = useI18n()
const store = useRelationsStore()

const newName = ref('')
const newReverse = ref('')
const newColor = ref('#8e4a9e')

const locked = computed(() => !!store.readOnly)
const invalid = computed(() => store.typeList.filter((e) => e.status !== 'ok'))
const useCount = (typeId: string) => store.relationships.filter((r) => r.typeId === typeId).length

function notifyFail(): void {
  Notify.create({ type: 'negative', message: t('relations.types.failed'), position: 'bottom', timeout: 5000 })
}

async function add(): Promise<void> {
  const id = await store.createType(newName.value, { reverseLabel: newReverse.value, color: newColor.value })
  if (!id) return notifyFail()
  newName.value = ''
  newReverse.value = ''
}

const typeOf = (id: string) => store.types.find((c) => c.id === id)
function rename(id: string, ev: Event): void {
  const input = ev.target as HTMLInputElement
  if (!store.updateType(id, { name: input.value }).ok) input.value = typeOf(id)?.name ?? ''
}
function setReverse(id: string, ev: Event): void {
  const input = ev.target as HTMLInputElement
  if (!store.updateType(id, { reverseLabel: input.value }).ok) input.value = typeOf(id)?.reverseLabel ?? ''
}
const recolor = (id: string, ev: Event) =>
  store.updateType(id, { color: (ev.target as HTMLInputElement).value })

// ---- delete ----
const deleteId = ref<string | null>(null)
const target = ref<string | null>(null)
const deleting = computed(() => (deleteId.value ? (typeOf(deleteId.value) ?? null) : null))
const moving = computed(() => (deleteId.value ? useCount(deleteId.value) : 0))
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
    <QCard class="dialog" role="dialog" aria-labelledby="rel-types-title">
      <QCardSection>
        <h2 id="rel-types-title" class="title">{{ t('relations.types.title') }}</h2>
        <ul class="list">
          <li v-for="c in store.types" :key="c.id" class="row">
            <input
              type="color"
              class="swatch"
              :value="c.color"
              :aria-label="t('relations.types.color', { name: c.name })"
              :disabled="locked"
              @change="recolor(c.id, $event)"
            />
            <input
              class="name"
              :value="c.name"
              :aria-label="t('relations.types.rename', { name: c.name })"
              :readonly="locked"
              @change="rename(c.id, $event)"
              @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
            />
            <input
              class="name"
              :value="c.reverseLabel"
              :placeholder="t('relations.types.reversePlaceholder')"
              :aria-label="t('relations.types.reverse', { name: c.name })"
              :readonly="locked"
              @change="setReverse(c.id, $event)"
              @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
            />
            <span class="count">{{ t('relations.types.count', useCount(c.id)) }}</span>
            <QBtn
              flat
              round
              dense
              icon="delete_outline"
              :aria-label="t('relations.types.delete', { name: c.name })"
              :disable="locked"
              @click="askDelete(c.id)"
            />
          </li>
        </ul>
        <p v-if="!store.types.length" class="muted">{{ t('relations.types.none') }}</p>
        <form v-if="!locked" class="row add" @submit.prevent="add">
          <input
            v-model="newColor"
            type="color"
            class="swatch"
            :aria-label="t('relations.types.newColor')"
          />
          <input
            v-model="newName"
            class="name"
            :placeholder="t('relations.types.newName')"
            :aria-label="t('relations.types.newName')"
          />
          <input
            v-model="newReverse"
            class="name"
            :placeholder="t('relations.types.newReverse')"
            :aria-label="t('relations.types.newReverse')"
          />
          <QBtn
            unelevated
            no-caps
            type="submit"
            class="btn-section"
            :label="t('relations.types.add')"
            :disable="!newName.trim()"
          />
        </form>
        <InvalidFiles :items="invalid" :heading="t('relations.invalid.heading')" />
      </QCardSection>
      <QCardActions align="right">
        <QBtn flat no-caps :label="t('relations.types.close')" @click="open = false" />
      </QCardActions>
    </QCard>
  </QDialog>

  <QDialog :model-value="!!deleting" @update:model-value="deleteId = null">
    <QCard v-if="deleting" class="dialog small" role="alertdialog" aria-labelledby="rel-type-del-title">
      <QCardSection>
        <h2 id="rel-type-del-title" class="title">
          {{ t('relations.types.deleteTitle', { name: deleting.name }) }}
        </h2>
        <p v-if="moving === 0">{{ t('relations.types.deleteEmpty') }}</p>
        <template v-else>
          <p>{{ t('relations.types.deleteMoves', moving) }}</p>
          <QSelect
            v-model="target"
            :options="targets"
            :label="t('relations.types.moveTo')"
            outlined
            dense
            emit-value
            map-options
            options-dense
          />
        </template>
      </QCardSection>
      <QCardActions align="right">
        <QBtn flat no-caps :label="t('relations.types.cancel')" @click="deleteId = null" />
        <QBtn
          flat
          no-caps
          color="negative"
          :label="t('relations.types.deleteConfirm')"
          :disable="!canDelete"
          @click="doDelete"
        />
      </QCardActions>
    </QCard>
  </QDialog>
</template>

<style scoped>
.dialog {
  min-width: min(44rem, 94vw);
  background: var(--bg-raised);
  color: var(--text-primary);
}
.dialog.small {
  min-width: min(24rem, 90vw);
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
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.count {
  flex: none;
  min-width: 6rem;
  text-align: end;
}
.btn-section {
  background: var(--section-codex);
  color: var(--section-codex-on);
}
</style>
