<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHistoryStore } from '../../history/store'
import { describeError } from '../../history/errorText'
import { localStamp } from '../../history/stamp'
import { GROUP_ORDER, itemGroup, itemLabel } from '../../history/itemLabel'
import type { ChangeItem } from '../../history/items'
import { useProjectStore } from '../../project/store'

const { t, te } = useI18n()
const history = useHistoryStore()
const project = useProjectStore()

const message = ref('')
const notice = ref<{ pulledIn: string[]; forcedAll: boolean } | null>(null)
const problem = ref('')

const readOnly = computed(() => !!project.readOnly)
const label = (i: ChangeItem) => itemLabel(i, (k) => t(k))
const groups = computed(() =>
  GROUP_ORDER.map((g) => ({ g, rows: history.items.filter((i) => itemGroup(i.type) === g) })).filter(
    (x) => x.rows.length > 0,
  ),
)
const picked = computed(() => history.selected.size)
const blockedReason = computed(() =>
  readOnly.value ? t('history.readOnly') : picked.value === 0 ? t('history.changes.needOne') : '',
)

async function make(all: boolean): Promise<void> {
  const labels = new Map(history.items.map((i) => [i.key, label(i)]))
  problem.value = ''
  notice.value = null
  try {
    const r = all ? await history.snapshotAll(message.value || localStamp()) : await history.snapshot(message.value || localStamp())
    message.value = ''
    notice.value = {
      pulledIn: r.pulledIn.map((k) => labels.get(k) ?? k),
      forcedAll: r.forcedAll,
    }
  } catch (e) {
    problem.value = describeError(e, (k) => t(k), (k) => te(k))
  }
}
</script>

<template>
  <div class="changes">
    <p class="count" role="status">
      {{ t('history.changes.count', history.changeCount) }}
    </p>
    <p v-if="history.snapshots.length === 0 && history.changeCount > 0" class="hint">
      {{ t('history.changes.never') }}
    </p>

    <p v-if="history.changeCount === 0" class="empty">{{ t('history.changes.empty') }}</p>

    <template v-else>
      <div class="row">
        <QBtn flat dense no-caps :label="t('history.changes.selectAll')" @click="history.selectAll()" />
        <QBtn flat dense no-caps :label="t('history.changes.selectNone')" @click="history.selectNone()" />
      </div>

      <section
        v-for="grp in groups"
        :key="grp.g"
        class="group"
        :aria-label="t('history.group.' + grp.g)"
      >
        <h3 class="group-title">{{ t('history.group.' + grp.g) }}</h3>
        <ul class="rows">
          <li v-for="i in grp.rows" :key="i.key">
            <QCheckbox
              :model-value="history.selected.has(i.key)"
              :label="label(i)"
              :aria-label="`${t('history.changes.include')}: ${label(i)}`"
              @update:model-value="history.toggle(i.key)"
            />
          </li>
        </ul>
      </section>

      <QInput
        v-model="message"
        dense
        outlined
        class="message"
        :label="t('history.changes.message')"
        :hint="t('history.changes.messageHint')"
        :disable="readOnly"
        @keydown.enter.prevent="blockedReason ? undefined : make(false)"
      />
      <div class="row actions">
        <QBtn
          unelevated
          no-caps
          color="primary"
          :label="t('history.changes.snapshotAll')"
          :disable="readOnly || history.busy"
          @click="make(true)"
        />
        <QBtn
          outline
          no-caps
          :label="t('history.changes.snapshotSelected', { n: picked })"
          :disable="!!blockedReason || history.busy"
          @click="make(false)"
        />
      </div>
      <p v-if="blockedReason" class="hint">{{ blockedReason }}</p>
    </template>

    <div v-if="notice" class="ok" role="status">
      <p>{{ t('history.changes.done') }}</p>
      <template v-if="notice.pulledIn.length">
        <p>{{ t('history.changes.pulledIn') }}</p>
        <ul>
          <li v-for="p in notice.pulledIn" :key="p">{{ p }}</li>
        </ul>
      </template>
      <p v-if="notice.forcedAll">{{ t('history.changes.forcedAll') }}</p>
    </div>
    <p v-if="problem" class="err" role="alert">{{ problem }}</p>
  </div>
</template>

<style scoped>
.changes {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.count {
  margin: 0;
  font-weight: 600;
}
.hint,
.empty {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.group {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.5rem 1rem 0.75rem;
}
.group-title {
  margin: 0 0 0.25rem;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-secondary);
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
}
.message {
  max-width: 28rem;
}
.ok,
.err {
  padding: 0.75rem 1rem;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--bg-sheet);
}
.err {
  margin: 0;
  border-color: var(--section-checks);
}
.ok p {
  margin: 0 0 0.25rem;
}
.ok ul {
  margin: 0 0 0.25rem;
  padding-inline-start: 1.1rem;
}
</style>
