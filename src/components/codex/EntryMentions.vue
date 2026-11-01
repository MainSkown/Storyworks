<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import { ignoreMention, linkMention, linkMentions } from '../../codex/mentionActions'
import { mentionSegments } from '../../codex/mentionView'
import type { Mention } from '../../codex/mentions'
import { jumpToBlock } from '../../composables/useJump'
import { useProjectStore } from '../../project/store'
import { findNode } from '../../project/tree'

const props = defineProps<{ mentions: readonly Mention[]; loading: boolean; readOnly: boolean }>()
const emit = defineEmits<{ changed: [] }>()

const { t } = useI18n()
const project = useProjectStore()
const CONFIRM_ABOVE = 10

const rows = computed(() =>
  props.mentions.map((m) => ({
    m,
    scene: findNode(project.tree, m.sceneId)?.title || t('codex.untitledScene'),
    segments: mentionSegments(m.text, m.ranges),
  })),
)

const notify = (type: 'info' | 'warning', message: string) =>
  Notify.create({ type, message, position: 'bottom', timeout: 4000 })

async function link(m: Mention): Promise<void> {
  const r = await linkMention(m)
  if (!r.ok || r.added === 0) notify('warning', t('codex.mentionLinkFailed'))
  emit('changed')
}
async function ignore(m: Mention): Promise<void> {
  const r = await ignoreMention(m)
  if (!r.ok) notify('warning', t('codex.mentionIgnoreFailed'))
  emit('changed')
}
async function jump(m: Mention): Promise<void> {
  if (!(await jumpToBlock(m.sceneId, m.blockId)).ok) notify('warning', t('codex.passageGone'))
}

const confirmOpen = ref(false)
function askAll(): void {
  if (props.mentions.length > CONFIRM_ABOVE) confirmOpen.value = true
  else void linkAll()
}
async function linkAll(): Promise<void> {
  confirmOpen.value = false
  const r = await linkMentions(props.mentions)
  if (!r.ok) notify('warning', t('codex.mentionLinkFailed'))
  else notify('info', t('codex.linkedCount', r.added))
  emit('changed')
}
</script>

<template>
  <p class="muted">{{ t('codex.mentionsHint') }}</p>
  <p v-if="!rows.length && loading" class="muted" role="status">{{ t('codex.scanning') }}</p>
  <p v-else-if="!rows.length" class="muted" role="status">{{ t('codex.mentionsNone') }}</p>
  <template v-else>
    <div class="bar">
      <QBtn
        flat
        no-caps
        icon="add_link"
        :label="t('codex.linkAll', rows.length)"
        :disable="readOnly"
        @click="askAll"
      />
    </div>
    <ul class="cards" :aria-label="t('codex.tabMentions')">
      <li v-for="r in rows" :key="r.m.id" class="card">
        <div class="name">{{ r.scene }}</div>
        <p class="snippet">
          <template v-for="(s, i) in r.segments" :key="i"
            ><mark v-if="s.hit">{{ s.text }}</mark
            ><template v-else>{{ s.text }}</template></template
          >
        </p>
        <div class="actions">
          <button type="button" class="btn" @click="jump(r.m)">{{ t('codex.jump') }}</button>
          <button type="button" class="btn" :disabled="readOnly" @click="ignore(r.m)">
            {{ t('codex.notThisOne') }}
          </button>
          <button type="button" class="btn primary" :disabled="readOnly" @click="link(r.m)">
            {{ t('codex.linkMention') }}
          </button>
        </div>
      </li>
    </ul>
  </template>

  <QDialog v-model="confirmOpen">
    <QCard class="dialog" role="alertdialog" aria-labelledby="mention-all-title">
      <QCardSection>
        <h2 id="mention-all-title" class="dlg-title">{{ t('codex.linkAllTitle') }}</h2>
        <p>{{ t('codex.linkAllConfirm', rows.length) }}</p>
      </QCardSection>
      <QCardActions align="right">
        <QBtn flat no-caps :label="t('codex.cancel')" @click="confirmOpen = false" />
        <QBtn flat no-caps :label="t('codex.linkAll', rows.length)" @click="linkAll" />
      </QCardActions>
    </QCard>
  </QDialog>
</template>

<style scoped>
.muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.bar {
  display: flex;
  justify-content: flex-end;
}
.cards {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.card {
  padding: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
}
.name {
  font-size: 0.875rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.snippet {
  margin: 0.25rem 0 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}
mark {
  padding: 0 0.125rem;
  border-radius: 0.125rem;
  background: var(--section-codex);
  color: var(--section-codex-on);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.375rem;
}
.btn {
  padding: 0.125rem 0.625rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}
.btn:hover:not(:disabled) {
  background: var(--bg-selected);
}
.btn.primary {
  border-color: var(--section-codex);
  background: var(--section-codex);
  color: var(--section-codex-on);
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.btn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.dialog {
  min-width: min(24rem, 90vw);
  background: var(--bg-raised);
  color: var(--text-primary);
}
.dlg-title {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
}
</style>
