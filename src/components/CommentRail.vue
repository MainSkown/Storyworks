<script setup lang="ts">
import { nextTick, onMounted, onUpdated, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Scene } from '../project/schemas/scene'

type SceneComment = Scene['comments'][number]

const props = defineProps<{
  comments: SceneComment[]
  /** Desired top (px, relative to the rail) per comment id; 'draft' for the new comment. */
  anchors: Record<string, number>
  hasDraft: boolean
  activeId: string | null
  editable: boolean
}>()
const emit = defineEmits<{
  jump: [id: string]
  edit: [id: string, text: string]
  resolve: [id: string, resolved: boolean]
  remove: [id: string]
  submitDraft: [text: string]
  cancelDraft: []
}>()
const { t } = useI18n()

const root = ref<HTMLElement | null>(null)
const draftEl = ref<HTMLTextAreaElement | null>(null)
const draftText = ref('')
const editingId = ref<string | null>(null)
const editText = ref('')
const tops = ref<Record<string, number>>({})

// Cards keep their anchor, pushed down so they never overlap.
function place(): void {
  const cards = [...(root.value?.querySelectorAll<HTMLElement>('[data-card]') ?? [])]
  const entries = cards
    .map((el) => ({ key: el.dataset.card as string, h: el.offsetHeight }))
    .map((e) => ({ ...e, want: props.anchors[e.key] ?? 0 }))
    .sort((a, b) => a.want - b.want)
  const next: Record<string, number> = {}
  let bottom = 0
  for (const e of entries) {
    next[e.key] = Math.max(e.want, bottom)
    bottom = next[e.key]! + e.h + 8
  }
  const same =
    Object.keys(next).length === Object.keys(tops.value).length &&
    Object.entries(next).every(([k, v]) => tops.value[k] === v)
  if (!same) tops.value = next
}
onMounted(() => {
  place()
  if (props.hasDraft) draftEl.value?.focus()
})
onUpdated(place)
watch(
  () => props.anchors,
  () => void nextTick(place),
  { deep: true },
)

watch(
  () => props.hasDraft,
  async (on) => {
    if (!on) return
    draftText.value = ''
    await nextTick()
    draftEl.value?.focus()
  },
)

function startEdit(c: SceneComment): void {
  editingId.value = c.id
  editText.value = c.text
}
function saveEdit(): void {
  const text = editText.value.trim()
  if (editingId.value && text) emit('edit', editingId.value, text)
  editingId.value = null
}
function submitDraft(): void {
  const text = draftText.value.trim()
  if (text) emit('submitDraft', text)
}
const style = (key: string) => ({ top: `${tops.value[key] ?? props.anchors[key] ?? 0}px` })
const date = (iso: string) => new Date(iso).toLocaleDateString()
</script>

<template>
  <aside ref="root" class="rail" :aria-label="t('comments.rail')">
    <form
      v-if="hasDraft"
      class="card draft"
      data-card="draft"
      :style="style('draft')"
      @submit.prevent="submitDraft"
      @keydown.esc.stop.prevent="emit('cancelDraft')"
    >
      <label class="sr-only" for="comment-draft">{{ t('comments.new') }}</label>
      <textarea
        id="comment-draft"
        ref="draftEl"
        v-model="draftText"
        class="field"
        rows="4"
        :placeholder="t('comments.placeholder')"
        @keydown.enter.exact.prevent="submitDraft"
      />
      <div class="row">
        <button type="button" class="btn" @click="emit('cancelDraft')">
          {{ t('comments.cancel') }}
        </button>
        <button type="submit" class="btn primary" :disabled="!draftText.trim()">
          {{ t('comments.add') }}
        </button>
      </div>
    </form>
    <div
      v-for="c in comments"
      :key="c.id"
      class="card"
      :class="{ resolved: c.resolved, active: c.id === activeId }"
      :data-card="c.id"
      :style="style(c.id)"
    >
      <form
        v-if="editingId === c.id"
        @submit.prevent="saveEdit"
        @keydown.esc.stop.prevent="editingId = null"
      >
        <label class="sr-only" :for="`comment-edit-${c.id}`">{{ t('comments.edit') }}</label>
        <textarea
          :id="`comment-edit-${c.id}`"
          v-model="editText"
          class="field"
          rows="3"
          @keydown.enter.exact.prevent="saveEdit"
        />
        <div class="row">
          <button type="button" class="btn" @click="editingId = null">
            {{ t('comments.cancel') }}
          </button>
          <button type="submit" class="btn primary" :disabled="!editText.trim()">
            {{ t('comments.save') }}
          </button>
        </div>
      </form>
      <template v-else>
        <button type="button" class="text" :title="t('comments.jump')" @click="emit('jump', c.id)">
          {{ c.text }}
        </button>
        <div class="meta">
          <span
            >{{ date(c.createdAt)
            }}<template v-if="c.resolved"> · {{ t('comments.resolved') }}</template></span
          >
          <span v-if="editable" class="actions">
            <button
              type="button"
              class="icon"
              :aria-label="t('comments.edit')"
              :title="t('comments.edit')"
              @click="startEdit(c)"
            >
              <QIcon name="edit" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="icon"
              :aria-label="c.resolved ? t('comments.reopen') : t('comments.resolve')"
              :title="c.resolved ? t('comments.reopen') : t('comments.resolve')"
              @click="emit('resolve', c.id, !c.resolved)"
            >
              <QIcon :name="c.resolved ? 'undo' : 'check'" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="icon"
              :aria-label="t('comments.delete')"
              :title="t('comments.delete')"
              @click="emit('remove', c.id)"
            >
              <QIcon name="delete" aria-hidden="true" />
            </button>
          </span>
        </div>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.rail {
  position: relative;
  min-width: 0;
}
.card {
  position: absolute;
  inset-inline: 1rem 0;
  box-sizing: border-box;
  max-width: 18rem;
  padding: 0.75rem 0.875rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--bg-panel);
  color: var(--text-primary);
  font-size: 0.875rem;
}
.card.active,
.card.draft {
  border-color: var(--border-strong);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.2);
}
.card.resolved {
  opacity: 0.55;
}
.text {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
}
.actions {
  display: flex;
  gap: 0.125rem;
}
.icon {
  display: inline-flex;
  padding: 0.125rem;
  border: 0;
  border-radius: 0.25rem;
  background: none;
  color: var(--text-secondary);
  font-size: 1.125rem;
  cursor: pointer;
}
.icon:hover {
  background: var(--bg-selected);
  color: var(--text-primary);
}
.field {
  box-sizing: border-box;
  width: 100%;
  min-height: 5.5rem;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
  resize: vertical;
}
.row {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.btn {
  padding: 0.25rem 0.875rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
}
.btn.primary {
  background: var(--bg-selected);
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.text:focus-visible,
.icon:focus-visible,
.btn:focus-visible,
.field:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
