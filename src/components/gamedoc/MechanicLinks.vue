<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { resolveLink } from '../../game/mechanicLinks'
import { useLinkContext } from '../../gamedoc/linkContext'
import { linkLabel } from '../../gamedoc/linkLabels'
import { useMechanicsStore } from '../../gamedoc/mechanicsStore'
import { openLink } from '../../gamedoc/openLink'
import { useLinkNames } from '../../gamedoc/useLinkNames'
import {
  MECHANIC_LINK_KINDS,
  type Mechanic,
  type MechanicLink,
} from '../../project/schemas/mechanic'
import MechanicLinkPicker from './MechanicLinkPicker.vue'
import MechanicRelated from './MechanicRelated.vue'

const props = defineProps<{ mechanic: Mechanic }>()
const { t } = useI18n()
const store = useMechanicsStore()
const ctx = useLinkContext()
const names = useLinkNames()

const pickerOpen = ref(false)
const addEl = ref<{ $el: HTMLElement } | null>(null)
const fallback = computed(() => ({
  missing: t('gamedoc.links.deleted'),
  untitled: t('gamedoc.links.untitled'),
}))

const groups = computed(() =>
  MECHANIC_LINK_KINDS.map((kind) => ({
    kind,
    rows: props.mechanic.links
      .filter((l) => l.kind === kind)
      .map((link) => {
        const r = resolveLink(link, ctx.value)
        return {
          link,
          label: linkLabel(link, names.value, fallback.value),
          broken: r.ok ? null : r.reason,
        }
      }),
  })).filter((g) => g.rows.length),
)

async function remove(link: MechanicLink): Promise<void> {
  store.removeLink(props.mechanic.id, link)
  await nextTick()
  addEl.value?.$el.focus()
}
</script>

<template>
  <section class="links" :aria-label="t('gamedoc.links.title')" data-testid="mechanic-links">
    <div class="head">
      <h3 class="h">{{ t('gamedoc.links.title') }}</h3>
      <QBtn
        ref="addEl"
        flat
        no-caps
        icon="add"
        :label="t('gamedoc.links.add')"
        :disable="!!store.readOnly"
        data-testid="mechanic-link-add"
        @click="pickerOpen = true"
      />
    </div>
    <p v-if="!groups.length" class="note">{{ t('gamedoc.links.none') }}</p>
    <div v-for="g in groups" :key="g.kind" class="group">
      <h4 class="kind">{{ t(`gamedoc.links.kinds.${g.kind}`) }}</h4>
      <ul class="rows">
        <li
          v-for="r in g.rows"
          :key="r.link.id"
          class="row"
          :class="{ broken: r.broken }"
          :data-testid="`mechanic-link-${g.kind}`"
        >
          <span class="name">{{ r.label }}</span>
          <span v-if="r.broken" class="flag">{{ t(`gamedoc.links.${r.broken}`) }}</span>
          <QBtn
            v-if="!r.broken"
            flat
            dense
            no-caps
            icon="open_in_new"
            :aria-label="t('gamedoc.links.open', { name: r.label })"
            :title="t('gamedoc.links.open', { name: r.label })"
            @click="openLink(r.link)"
          />
          <QBtn
            flat
            dense
            no-caps
            icon="close"
            :disable="!!store.readOnly"
            :aria-label="t('gamedoc.links.remove', { name: r.label })"
            :title="t('gamedoc.links.remove', { name: r.label })"
            @click="remove(r.link)"
          />
        </li>
      </ul>
    </div>

    <h4 class="kind">{{ t('gamedoc.links.related') }}</h4>
    <MechanicRelated :mechanic="mechanic" />

    <MechanicLinkPicker v-model="pickerOpen" :mechanic="mechanic" />
  </section>
</template>

<style scoped>
.links {
  margin: 1rem 0;
  padding-block-start: 0.75rem;
  border-top: 1px solid var(--border);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.h {
  margin: 0;
  font-size: 1rem;
  border-inline-start: 3px solid var(--section-gamedoc);
  padding-inline-start: 0.5rem;
}
.kind {
  margin: 0.75rem 0 0.25rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.note {
  margin: 0.25rem 0;
  color: var(--text-secondary);
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.125rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
}
.row.broken {
  border-style: dashed;
  border-color: var(--border-strong);
}
.name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.flag {
  padding: 0 0.4rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 700;
}
</style>
