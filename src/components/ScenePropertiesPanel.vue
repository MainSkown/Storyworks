<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { newId } from '../project/ids'
import { useProjectStore } from '../project/store'
import { sceneStatusSchema, type Scene } from '../project/schemas/scene'
import { findNode } from '../project/tree'

const { t } = useI18n()
const store = useProjectStore()

const node = computed(() => {
  const n = store.selectedId ? findNode(store.tree, store.selectedId) : null
  return n?.type === 'scene' ? n : null
})
const meta = computed(() => (node.value ? store.sceneMeta.get(node.value.id) : undefined))
const usable = computed(
  () =>
    !!node.value?.path &&
    !!meta.value &&
    !store.readOnly &&
    !store.project?.isInvalid(node.value.path),
)
const statuses = sceneStatusSchema.options

const synopsis = ref('')
watch(
  () => [node.value?.id, meta.value?.synopsis] as const,
  () => {
    if (document.activeElement?.id !== 'scene-synopsis') synopsis.value = meta.value?.synopsis ?? ''
  },
  { immediate: true },
)

function setStatus(status: Scene['status']): void {
  if (node.value) void store.setSceneMeta(node.value.id, { status })
}
function saveSynopsis(): void {
  if (node.value && usable.value && synopsis.value !== meta.value?.synopsis)
    void store.setSceneMeta(node.value.id, { synopsis: synopsis.value })
}

// ---- to-dos ----
const todos = ref<Scene['todos']>([])
const newTodo = ref('')
watch(
  () => [node.value?.path, node.value ? store.itemVersion(node.value.path ?? '') : 0] as const,
  async ([path]) => {
    todos.value = []
    if (!path) return
    const r = await store.loadScene(path)
    if (path === node.value?.path && r.ok) todos.value = r.value.todos
  },
  { immediate: true },
)

function saveTodos(next: Scene['todos']): void {
  if (!node.value || !usable.value) return
  todos.value = next
  void store.setSceneTodos(node.value.id, next)
}
function addTodo(): void {
  const text = newTodo.value.trim()
  if (!text) return
  newTodo.value = ''
  saveTodos([...todos.value, { id: newId(), text, done: false }])
}
const toggle = (id: string, done: boolean) =>
  saveTodos(todos.value.map((x) => (x.id === id ? { ...x, done } : x)))
const remove = (id: string) => saveTodos(todos.value.filter((x) => x.id !== id))

const emit = defineEmits<{ openTodos: [count: number] }>()
watch(
  () => todos.value.filter((x) => !x.done).length,
  (n) => emit('openTodos', n),
  { immediate: true },
)
</script>

<template>
  <p v-if="!meta" class="note">{{ t('sceneProps.noScene') }}</p>
  <div v-else class="props">
    <label class="label" for="scene-status">{{ t('sceneProps.status') }}</label>
    <select
      id="scene-status"
      class="control"
      :value="meta.status"
      :disabled="!usable"
      @change="setStatus(($event.target as HTMLSelectElement).value as Scene['status'])"
    >
      <option v-for="s in statuses" :key="s" :value="s">{{ t(`outline.status.${s}`) }}</option>
    </select>

    <label class="label" for="scene-synopsis">{{ t('sceneProps.synopsis') }}</label>
    <textarea
      id="scene-synopsis"
      v-model="synopsis"
      class="control"
      rows="3"
      :readonly="!usable"
      @blur="saveSynopsis"
    ></textarea>

    <label class="label" for="scene-pov">{{ t('sceneProps.pov') }}</label>
    <select id="scene-pov" class="control" disabled aria-describedby="scene-pov-note">
      <option value=""></option>
    </select>
    <p id="scene-pov-note" class="note">{{ t('sceneProps.povNote') }}</p>

    <h4 class="label heading">{{ t('sceneProps.todos') }}</h4>
    <ul class="todos">
      <li v-for="x in todos" :key="x.id" class="todo">
        <input
          type="checkbox"
          :checked="x.done"
          :disabled="!usable"
          :aria-label="t('sceneProps.todoDone', { text: x.text })"
          @change="toggle(x.id, ($event.target as HTMLInputElement).checked)"
        />
        <span class="todo-text" :class="{ done: x.done }">{{ x.text }}</span>
        <button
          type="button"
          class="icon-btn"
          :disabled="!usable"
          :aria-label="t('sceneProps.todoDelete', { text: x.text })"
          :title="t('sceneProps.todoDelete', { text: x.text })"
          @click="remove(x.id)"
        >
          <QIcon name="close" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <form class="add" @submit.prevent="addTodo">
      <input
        v-model="newTodo"
        class="control"
        :aria-label="t('sceneProps.todoNew')"
        :placeholder="t('sceneProps.todoNew')"
        :readonly="!usable"
      />
      <button
        type="submit"
        class="icon-btn"
        :disabled="!usable"
        :aria-label="t('sceneProps.todoAdd')"
        :title="t('sceneProps.todoAdd')"
      >
        <QIcon name="add" aria-hidden="true" />
      </button>
    </form>
  </div>
</template>

<style scoped>
.props {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.label {
  margin: 0.5rem 0 0;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.heading {
  font-size: 0.75rem;
}
.control {
  width: 100%;
  box-sizing: border-box;
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
}
textarea.control {
  resize: vertical;
}
.control:focus-visible,
.icon-btn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.control:disabled {
  opacity: 0.6;
}
.note {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.todos {
  margin: 0;
  padding: 0;
  list-style: none;
}
.todo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.125rem 0;
  color: var(--text-primary);
}
.todo-text {
  flex: 1;
  overflow-wrap: anywhere;
}
.todo-text.done {
  color: var(--text-secondary);
  text-decoration: line-through;
}
.add {
  display: flex;
  gap: 0.25rem;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 1.75rem;
  height: 1.75rem;
  border: 0;
  border-radius: 0.375rem;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.icon-btn:hover:not(:disabled) {
  background: var(--bg-selected);
}
.icon-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
