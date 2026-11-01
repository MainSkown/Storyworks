<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { groupPickerRules } from '../../rules/nodeRules'
import { useRulesStore } from '../../rules/store'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ linked: readonly string[] }>()
const emit = defineEmits<{ pick: [ruleId: string] }>()

const { t } = useI18n()
const rules = useRulesStore()

const query = ref('')
const active = ref(0)
const listEl = ref<HTMLElement | null>(null)

const groups = computed(() => groupPickerRules(rules.rules, rules.categories, query.value, props.linked))
const flat = computed(() => groups.value.flatMap((g) => g.rules))
const offsets = computed(() => {
  let n = 0
  return groups.value.map((g) => {
    const start = n
    n += g.rules.length
    return start
  })
})
const noRules = computed(() => rules.rules.length === 0)
const allLinked = computed(() => !noRules.value && rules.rules.every((r) => props.linked.includes(r.id)))

const rowId = (i: number) => `rule-picker-row-${i}`

watch(open, (v) => {
  if (v) {
    query.value = ''
    active.value = 0
  }
})
watch(query, () => (active.value = 0))

function move(delta: number): void {
  if (flat.value.length === 0) return
  active.value = (active.value + delta + flat.value.length) % flat.value.length
  listEl.value?.querySelector(`#${rowId(active.value)}`)?.scrollIntoView({ block: 'nearest' })
}

function choose(i: number): void {
  const r = flat.value[i]
  if (!r) return
  open.value = false
  emit('pick', r.id)
}
</script>

<template>
  <QDialog v-model="open">
    <QCard class="dialog" role="dialog" aria-labelledby="rule-picker-title">
      <QCardSection>
        <h2 id="rule-picker-title" class="title">{{ t('nodeRules.pickerTitle') }}</h2>
        <p v-if="noRules" class="empty">{{ t('nodeRules.empty') }}</p>
        <p v-else-if="allLinked" class="empty">{{ t('nodeRules.allLinked') }}</p>
        <template v-else>
          <input
            v-model="query"
            class="search"
            type="search"
            autofocus
            role="combobox"
            aria-expanded="true"
            aria-controls="rule-picker-list"
            :aria-activedescendant="flat.length ? rowId(active) : undefined"
            :aria-label="t('nodeRules.search')"
            :placeholder="t('nodeRules.search')"
            @keydown.down.prevent="move(1)"
            @keydown.up.prevent="move(-1)"
            @keydown.enter.prevent="choose(active)"
          />
          <p v-if="flat.length === 0" class="empty" role="status">{{ t('nodeRules.noMatch') }}</p>
          <div v-else id="rule-picker-list" ref="listEl" class="list" role="listbox">
            <div
              v-for="(g, gi) in groups"
              :key="g.categoryId ?? 'none'"
              role="group"
              :aria-label="g.name || t('nodeRules.uncategorized')"
            >
              <div class="group-name">{{ g.name || t('nodeRules.uncategorized') }}</div>
              <div
                v-for="(r, ri) in g.rules"
                :id="rowId(offsets[gi]! + ri)"
                :key="r.id"
                class="row"
                :class="{ active: offsets[gi]! + ri === active }"
                role="option"
                :aria-selected="offsets[gi]! + ri === active"
                @click="choose(offsets[gi]! + ri)"
                @mousemove="active = offsets[gi]! + ri"
              >
                <span class="name">{{ r.title || t('nodeRules.untitled') }}</span>
              </div>
            </div>
          </div>
        </template>
      </QCardSection>
      <QCardActions align="right">
        <QBtn flat no-caps :label="t('nodeRules.cancel')" @click="open = false" />
      </QCardActions>
    </QCard>
  </QDialog>
</template>

<style scoped>
.dialog {
  width: min(30rem, 92vw);
  background: var(--bg-raised);
  color: var(--text-primary);
}
.title {
  margin: 0 0 0.75rem;
  font-size: 1.15rem;
}
.empty {
  margin: 0;
  color: var(--text-secondary);
}
.search {
  box-sizing: border-box;
  width: 100%;
  margin-bottom: 0.5rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
}
.search:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.list {
  max-height: min(24rem, 55vh);
  overflow-y: auto;
}
.group-name {
  position: sticky;
  top: 0;
  padding: 0.35rem 0.5rem;
  background: var(--bg-raised);
  border-bottom: 1px solid var(--border);
  color: var(--section-rules);
  font-size: 0.8125rem;
  font-weight: 600;
}
.row {
  padding: 0.4rem 0.5rem;
  border-inline-start: 3px solid transparent;
  cursor: pointer;
}
.row.active {
  background: var(--bg-selected);
  border-inline-start-color: var(--focus-ring);
}
.name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
</style>
