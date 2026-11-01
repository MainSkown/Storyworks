<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '../project/store'
import { targetOptions } from '../project/inboxTargets'

const props = defineProps<{ noteId: string; label: string }>()

const { t } = useI18n()
const store = useProjectStore()

const mode = ref<'move' | 'new' | null>(null)
const target = ref<string | null>(null)
const error = ref('')
const busy = ref(false)

const ROOT = '__root' // stands for the top level; null means nothing chosen
const scenes = computed(() => targetOptions(store.tree, ['scene']))
const places = computed(() => [
  { id: ROOT, label: t('inbox.bookRoot') },
  ...targetOptions(store.tree, ['part', 'chapter']),
])
const options = computed(() => (mode.value === 'move' ? scenes.value : places.value))

function start(m: 'move' | 'new'): void {
  mode.value = m
  error.value = ''
  target.value = m === 'new' ? ROOT : null
}

async function confirm(): Promise<void> {
  if (target.value === null || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const id =
      mode.value === 'move'
        ? (await store.moveNoteToScene(props.noteId, target.value))
          ? target.value
          : null
        : await store.createSceneFromNote(props.noteId, target.value === ROOT ? null : target.value)
    if (id) {
      store.selectedId = id
      mode.value = null
    } else error.value = t('inbox.errorGeneric')
  } catch (e) {
    error.value = t('inbox.error', { message: e instanceof Error ? e.message : String(e) })
  } finally {
    busy.value = false
  }
}

async function remove(): Promise<void> {
  try {
    await store.deleteNote(props.noteId)
  } catch (e) {
    console.error(e)
  }
}
</script>

<template>
  <QBtn
    flat
    dense
    round
    size="sm"
    icon="more_vert"
    :aria-label="t('inbox.actions', { title: label })"
    :disable="!!store.readOnly"
  >
    <QMenu auto-close>
      <QList dense>
        <QItem clickable :disable="scenes.length === 0" @click="start('move')">
          <QItemSection avatar><QIcon name="drive_file_move" /></QItemSection>
          <QItemSection>{{ t('inbox.moveToScene') }}</QItemSection>
        </QItem>
        <QItem clickable @click="start('new')">
          <QItemSection avatar><QIcon name="note_add" /></QItemSection>
          <QItemSection>{{ t('inbox.newScene') }}</QItemSection>
        </QItem>
        <QItem clickable @click="remove">
          <QItemSection avatar><QIcon name="delete" /></QItemSection>
          <QItemSection>{{ t('inbox.delete') }}</QItemSection>
        </QItem>
      </QList>
    </QMenu>
  </QBtn>

  <QDialog :model-value="mode !== null" @update:model-value="mode = null">
    <QCard class="dialog" role="dialog">
      <QCardSection>
        <h2 class="title">{{ mode === 'move' ? t('inbox.moveTitle') : t('inbox.newTitle') }}</h2>
        <p class="hint">{{ mode === 'move' ? t('inbox.moveHint') : t('inbox.newHint') }}</p>
        <QSelect
          v-model="target"
          :options="options"
          option-value="id"
          option-label="label"
          emit-value
          map-options
          outlined
          dense
          :label="mode === 'move' ? t('inbox.targetScene') : t('inbox.targetParent')"
        />
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </QCardSection>
      <QCardActions align="right">
        <QBtn flat no-caps :label="t('inbox.cancel')" @click="mode = null" />
        <QBtn
          flat
          no-caps
          color="primary"
          :disable="target === null || busy"
          :label="mode === 'move' ? t('inbox.confirmMove') : t('inbox.confirmCreate')"
          @click="confirm"
        />
      </QCardActions>
    </QCard>
  </QDialog>
</template>

<style scoped>
.dialog {
  min-width: min(26rem, 90vw);
  background: var(--bg-raised);
  color: var(--text-primary);
}
.title {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
}
.hint {
  margin: 0 0 0.75rem;
  color: var(--text-secondary);
}
.error {
  margin: 0.75rem 0 0;
  color: var(--text-primary);
}
</style>
