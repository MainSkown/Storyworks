<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { docToText } from '../project/plainText'
import type { InboxNote } from '../project/schemas/inbox'
import { useProjectStore } from '../project/store'
import CollapsibleSection from './CollapsibleSection.vue'
import InboxNoteActions from './InboxNoteActions.vue'

const { t } = useI18n()
const store = useProjectStore()

const LABEL_MAX = 40

function label(note: InboxNote): string {
  const text = note.title || docToText(note.content).trim().replace(/\s+/g, ' ').slice(0, LABEL_MAX)
  return text || t('inbox.untitled')
}

async function add(): Promise<void> {
  try {
    store.openNote(await store.addNote())
  } catch (e) {
    console.error(e)
  }
}
</script>

<template>
  <CollapsibleSection id="inbox" :title="t('inbox.title')" :count="store.inboxNotes.length">
    <p v-if="store.inboxInvalid" class="msg" role="alert">{{ t('inbox.invalid') }}</p>
    <template v-else>
      <ul v-if="store.inboxNotes.length" class="notes" :aria-label="t('inbox.listLabel')">
        <li v-for="n in store.inboxNotes" :key="n.id" class="note">
          <button
            type="button"
            class="open"
            :class="{ current: store.openNoteId === n.id }"
            :aria-current="store.openNoteId === n.id ? 'true' : undefined"
            @click="store.openNote(n.id)"
          >
            {{ label(n) }}
          </button>
          <InboxNoteActions :note-id="n.id" :label="label(n)" />
        </li>
      </ul>
      <p v-else class="msg">{{ t('inbox.empty') }}</p>
      <QBtn
        flat
        dense
        no-caps
        icon="add"
        class="add"
        :label="t('inbox.add')"
        :disable="!!store.readOnly"
        @click="add"
      />
    </template>
  </CollapsibleSection>
</template>

<style scoped>
.notes {
  margin: 0;
  padding: 0;
  list-style: none;
}
.note {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.open {
  flex: 1;
  min-width: 0;
  padding: 0.25rem 0.375rem;
  overflow: hidden;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  text-align: start;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.open:hover,
.open.current {
  background: var(--bg-selected);
}
.open:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.msg {
  margin: 0 0 0.25rem;
  color: var(--text-secondary);
}
.add {
  margin-inline-start: -0.5rem;
  color: var(--text-secondary);
}
</style>
