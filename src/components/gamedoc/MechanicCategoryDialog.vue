<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import { useMechanicsStore } from '../../gamedoc/mechanicsStore'

const open = defineModel<boolean>({ required: true })
const { t } = useI18n()
const store = useMechanicsStore()

const newName = ref('')
const newColor = ref('#3e7b5a')

const locked = computed(() => !!store.readOnly)
const mechanicCount = (categoryId: string) =>
  store.mechanics.filter((r) => r.categoryId === categoryId).length

function notifyFail(): void {
  Notify.create({
    type: 'negative',
    message: t('gamedoc.mechanicsTab.categories.failed'),
    position: 'bottom',
    timeout: 5000,
  })
}

async function add(): Promise<void> {
  const id = await store.createCategory(newName.value, newColor.value)
  if (!id) return notifyFail()
  newName.value = ''
}

function rename(id: string, ev: Event): void {
  const input = ev.target as HTMLInputElement
  const r = store.updateCategory(id, { name: input.value })
  if (!r.ok) input.value = store.categories.find((c) => c.id === id)?.name ?? ''
}
const recolor = (id: string, ev: Event) =>
  store.updateCategory(id, { color: (ev.target as HTMLInputElement).value })

// ---- delete ----
const deleteId = ref<string | null>(null)
const target = ref<string | null>(null)
const deleting = computed(() => store.categories.find((c) => c.id === deleteId.value) ?? null)
const moving = computed(() => (deleteId.value ? mechanicCount(deleteId.value) : 0))
const targets = computed(() =>
  store.categories
    .filter((c) => c.id !== deleteId.value)
    .map((c) => ({ value: c.id, label: c.name })),
)
const canDelete = computed(
  () => !!deleteId.value && store.planDeleteCategory(deleteId.value, target.value).ok,
)

function askDelete(id: string): void {
  deleteId.value = id
  target.value = store.categories.find((c) => c.id !== id)?.id ?? null
}
async function doDelete(): Promise<void> {
  const id = deleteId.value
  if (!id) return
  deleteId.value = null
  const r = await store.deleteCategory(id, target.value)
  if (!r.ok) notifyFail()
}
</script>

<template>
  <QDialog v-model="open">
    <QCard class="dialog" role="dialog" aria-labelledby="mech-cats-title">
      <QCardSection>
        <h2 id="mech-cats-title" class="title">{{ t('gamedoc.mechanicsTab.categories.title') }}</h2>
        <ul class="list">
          <li v-for="c in store.categories" :key="c.id" class="row">
            <input
              type="color"
              class="swatch"
              :value="c.color"
              :aria-label="t('gamedoc.mechanicsTab.categories.color', { name: c.name })"
              :disabled="locked"
              @change="recolor(c.id, $event)"
            />
            <input
              class="name"
              :value="c.name"
              :aria-label="t('gamedoc.mechanicsTab.categories.rename', { name: c.name })"
              :readonly="locked"
              @change="rename(c.id, $event)"
              @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
            />
            <span class="count">{{
              t('gamedoc.mechanicsTab.categories.mechanicCount', mechanicCount(c.id))
            }}</span>
            <QBtn
              flat
              round
              dense
              icon="delete_outline"
              :aria-label="t('gamedoc.mechanicsTab.categories.delete', { name: c.name })"
              :disable="locked || store.categories.length <= 1"
              @click="askDelete(c.id)"
            >
              <QTooltip v-if="store.categories.length <= 1">{{
                t('gamedoc.mechanicsTab.categories.last')
              }}</QTooltip>
            </QBtn>
          </li>
        </ul>
        <p v-if="!store.categories.length" class="muted">
          {{ t('gamedoc.mechanicsTab.categories.none') }}
        </p>
        <p v-else-if="store.categories.length === 1" class="muted">
          {{ t('gamedoc.mechanicsTab.categories.last') }}
        </p>
        <form v-if="!locked" class="row add" @submit.prevent="add">
          <input
            v-model="newColor"
            type="color"
            class="swatch"
            :aria-label="t('gamedoc.mechanicsTab.categories.newColor')"
          />
          <input
            v-model="newName"
            class="name"
            :placeholder="t('gamedoc.mechanicsTab.categories.newName')"
            :aria-label="t('gamedoc.mechanicsTab.categories.newName')"
          />
          <QBtn
            unelevated
            no-caps
            type="submit"
            class="btn-section"
            :label="t('gamedoc.mechanicsTab.categories.add')"
            :disable="!newName.trim()"
          />
        </form>
      </QCardSection>
      <QCardActions align="right">
        <QBtn
          flat
          no-caps
          :label="t('gamedoc.mechanicsTab.categories.close')"
          @click="open = false"
        />
      </QCardActions>
    </QCard>
  </QDialog>

  <QDialog :model-value="!!deleting" @update:model-value="deleteId = null">
    <QCard v-if="deleting" class="dialog" role="alertdialog" aria-labelledby="mech-cat-del-title">
      <QCardSection>
        <h2 id="mech-cat-del-title" class="title">
          {{ t('gamedoc.mechanicsTab.categories.deleteTitle', { name: deleting.name }) }}
        </h2>
        <p v-if="moving === 0">{{ t('gamedoc.mechanicsTab.categories.deleteEmpty') }}</p>
        <template v-else>
          <p>{{ t('gamedoc.mechanicsTab.categories.deleteMoves', moving) }}</p>
          <QSelect
            v-model="target"
            :options="targets"
            :label="t('gamedoc.mechanicsTab.categories.moveTo')"
            outlined
            dense
            emit-value
            map-options
            options-dense
          />
        </template>
      </QCardSection>
      <QCardActions align="right">
        <QBtn flat no-caps :label="t('gamedoc.mechanicsTab.cancel')" @click="deleteId = null" />
        <QBtn
          flat
          no-caps
          color="negative"
          :label="t('gamedoc.mechanicsTab.categories.deleteConfirm')"
          :disable="!canDelete"
          @click="doDelete"
        />
      </QCardActions>
    </QCard>
  </QDialog>
</template>

<style scoped>
.dialog {
  min-width: min(32rem, 90vw);
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
  background: var(--section-gamedoc);
  color: var(--section-gamedoc-on);
}
</style>
