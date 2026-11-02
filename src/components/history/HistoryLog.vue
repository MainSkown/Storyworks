<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DiffLine } from '../../history/diff'
import { describeError } from '../../history/errorText'
import type { SnapshotInfo } from '../../history/engine'
import { itemLabel } from '../../history/itemLabel'
import type { ChangeItem } from '../../history/items'
import { useHistoryStore } from '../../history/store'
import { useProjectStore } from '../../project/store'
import ConfirmDialog from './ConfirmDialog.vue'
import DiffView from './DiffView.vue'

const { t, te, locale } = useI18n()
const history = useHistoryStore()
const project = useProjectStore()

const readOnly = computed(() => !!project.readOnly)
const label = (i: ChangeItem) => itemLabel(i, (k) => t(k))
const when = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' })
}
const fail = (e: unknown) => (problem.value = describeError(e, (k) => t(k), (k) => te(k)))

const selectedId = ref<string | null>(null)
const detail = ref<ChangeItem[]>([])
const problem = ref('')
const done = ref(false)
const counts = ref<Record<string, number>>({})

// Number of changed items per snapshot, filled in lazily and kept.
watch(
  () => history.snapshots,
  async (list) => {
    if (selectedId.value && !list.some((s) => s.id === selectedId.value)) selectedId.value = null
    for (const s of list) {
      if (s.id in counts.value) continue
      try {
        counts.value = { ...counts.value, [s.id]: (await history.snapshotChangesOf(s.id)).length }
      } catch {
        return
      }
    }
  },
  { immediate: true },
)

type Preview =
  | { mode: 'view'; item: ChangeItem; text: string | null }
  | { mode: 'current' | 'previous'; item: ChangeItem; lines: DiffLine[] | null }
const preview = ref<Preview | null>(null)

watch(selectedId, async (id) => {
  preview.value = null
  detail.value = []
  problem.value = ''
  done.value = false
  if (!id) return
  try {
    detail.value = await history.snapshotChangesOf(id)
  } catch (e) {
    fail(e)
  }
})

const selected = computed<SnapshotInfo | null>(() => history.snapshots.find((s) => s.id === selectedId.value) ?? null)
const inSnapshot = (i: ChangeItem) => !i.kinds.includes('deleted')

async function view(i: ChangeItem): Promise<void> {
  try {
    preview.value = { mode: 'view', item: i, text: await history.itemAsOf(selectedId.value!, i.key) }
  } catch (e) {
    fail(e)
  }
}
async function compare(i: ChangeItem, against: 'current' | 'previous'): Promise<void> {
  try {
    preview.value = { mode: against, item: i, lines: await history.diffItem(selectedId.value!, i.key, against) }
  } catch (e) {
    fail(e)
  }
}

const itemAsk = ref<{ item: ChangeItem; present: boolean } | null>(null)
const askingItem = computed({ get: () => itemAsk.value !== null, set: (v) => void (v || (itemAsk.value = null)) })
const askingBook = ref(false)

async function askRestore(i: ChangeItem): Promise<void> {
  try {
    itemAsk.value = { item: i, present: (await history.itemNow(i.key)) !== null }
  } catch (e) {
    fail(e)
  }
}
async function restoreItem(): Promise<void> {
  const ask = itemAsk.value
  if (!ask || !selectedId.value) return
  problem.value = ''
  try {
    await history.restoreItem(selectedId.value, ask.item.key)
    done.value = true
    preview.value = null
  } catch (e) {
    fail(e)
  } finally {
    itemAsk.value = null
  }
}
async function restoreBook(): Promise<void> {
  if (!selectedId.value) return
  problem.value = ''
  try {
    await history.restoreProject(selectedId.value)
    done.value = true
    preview.value = null
  } catch (e) {
    fail(e)
  } finally {
    askingBook.value = false
  }
}

const itemLines = computed(() => {
  const ask = itemAsk.value
  if (!ask) return []
  const l = label(ask.item)
  return [t(ask.present ? 'history.confirm.itemReplace' : 'history.confirm.itemBack', { label: l }), t('history.confirm.safety')]
})
const bookLines = computed(() => [
  t('history.confirm.bookBody'),
  t('history.confirm.bookTrash'),
  ...(history.changeCount > 0 ? [t('history.confirm.bookUnsaved', history.changeCount)] : []),
  t('history.confirm.safety'),
])
const previewTitle = computed(() =>
  !preview.value
    ? ''
    : t(
        { view: 'history.log.viewing', current: 'history.log.vsCurrent', previous: 'history.log.vsPrevious' }[
          preview.value.mode
        ],
      ),
)
</script>

<template>
  <div class="log">
    <p v-if="history.snapshots.length === 0" class="hint">{{ t('history.log.empty') }}</p>
    <template v-else>
      <nav class="list" :aria-label="t('history.log.list')">
        <ul>
          <li v-for="s in history.snapshots" :key="s.id">
            <button
              type="button"
              class="snap"
              :class="{ on: s.id === selectedId }"
              :aria-current="s.id === selectedId ? 'true' : undefined"
              @click="selectedId = s.id"
            >
              <span class="snap-msg">{{ s.message }}</span>
              <span class="snap-meta">
                {{ when(s.time) }}
                <template v-if="s.id in counts"> · {{ t('history.log.changed', counts[s.id]!) }}</template>
              </span>
            </button>
          </li>
        </ul>
      </nav>

      <section class="detail" aria-live="polite">
        <p v-if="!selected" class="hint">{{ t('history.log.pick') }}</p>
        <template v-else>
          <h3 class="detail-title">{{ selected.message }}</h3>
          <p class="snap-meta">{{ when(selected.time) }}</p>
          <p v-if="readOnly" class="hint">{{ t('history.readOnly') }}</p>
          <QBtn
            outline
            no-caps
            icon="history"
            class="book-restore"
            :label="t('history.log.restoreBook')"
            :disable="readOnly || history.busy"
            @click="askingBook = true"
          />

          <h4 class="items-title">{{ t('history.log.items') }}</h4>
          <p v-if="detail.length === 0" class="hint">{{ t('history.log.noItems') }}</p>
          <ul v-else class="items">
            <li v-for="i in detail" :key="i.key" class="item">
              <span class="item-label">{{ label(i) }}</span>
              <span class="item-actions">
                <QBtn flat dense no-caps :label="t('history.log.view')" :disable="!inSnapshot(i)" @click="view(i)" />
                <QBtn flat dense no-caps :label="t('history.log.compareCurrent')" @click="compare(i, 'current')" />
                <QBtn flat dense no-caps :label="t('history.log.comparePrevious')" @click="compare(i, 'previous')" />
                <QBtn
                  flat
                  dense
                  no-caps
                  :label="t('history.log.restore')"
                  :disable="readOnly || history.busy || !inSnapshot(i)"
                  @click="askRestore(i)"
                />
              </span>
            </li>
          </ul>

          <div v-if="preview" class="preview">
            <div class="preview-head">
              <strong>{{ label(preview.item) }}</strong>
              <span class="snap-meta">{{ previewTitle }}</span>
              <QBtn flat dense no-caps icon="close" :aria-label="t('history.log.close')" @click="preview = null" />
            </div>
            <template v-if="preview.mode === 'view'">
              <p v-if="preview.text === null" class="hint">{{ t('history.log.notThere') }}</p>
              <pre v-else class="text">{{ preview.text }}</pre>
            </template>
            <template v-else>
              <p v-if="preview.lines === null" class="hint">{{ t('history.log.nothing') }}</p>
              <DiffView v-else :lines="preview.lines" />
            </template>
          </div>

          <p v-if="done" class="ok" role="status">{{ t('history.restored') }}</p>
          <p v-if="problem" class="err" role="alert">{{ problem }}</p>
        </template>
      </section>
    </template>

    <ConfirmDialog
      v-model="askingItem"
      :title="t('history.confirm.itemTitle')"
      :lines="itemLines"
      :confirm-label="t('history.confirm.itemDo')"
      :busy="history.busy"
      @confirm="restoreItem"
    />
    <ConfirmDialog
      v-model="askingBook"
      :title="t('history.confirm.bookTitle')"
      :lines="bookLines"
      :confirm-label="t('history.confirm.bookDo')"
      :busy="history.busy"
      @confirm="restoreBook"
    />
  </div>
</template>

<style scoped>
.log {
  display: grid;
  grid-template-columns: 16rem minmax(0, 1fr);
  gap: 1.25rem;
  align-items: start;
}
.log > .hint {
  grid-column: 1 / -1;
}
.hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.list ul,
.items {
  list-style: none;
  margin: 0;
  padding: 0;
}
.list ul {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 32rem;
  overflow: auto;
}
.snap {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-sheet);
  color: var(--text-primary);
  text-align: start;
  cursor: pointer;
}
.snap.on {
  background: var(--bg-selected);
  border-color: var(--border-strong);
}
.snap-msg {
  font-weight: 600;
  overflow-wrap: anywhere;
}
.snap-meta {
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.detail {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
}
.detail-title {
  margin: 0;
  font-size: 1.05rem;
}
.book-restore {
  align-self: flex-start;
}
.items-title {
  margin: 0.5rem 0 0;
  font-size: 0.8125rem;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-secondary);
}
.item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem 1rem;
  padding: 0.25rem 0;
  border-bottom: 1px solid var(--border);
}
.item-actions {
  display: flex;
  flex-wrap: wrap;
}
.preview {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  background: var(--bg-sheet);
}
.preview-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}
.preview-head .snap-meta {
  flex: 1;
}
.text {
  margin: 0;
  max-height: 24rem;
  overflow: auto;
  white-space: pre-wrap;
  font-family: inherit;
}
.ok,
.err {
  margin: 0;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--bg-sheet);
}
.err {
  border-color: var(--section-checks);
}
@media (max-width: 52rem) {
  .log {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
