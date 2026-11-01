<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { EntryRef } from '../../codex/entryRefs'
import { openEntry } from '../../codex/openEntry'
import type { CodexEntry } from '../../project/schemas/codexEntry'
import LinkCard from './LinkCard.vue'

defineProps<{ refs: EntryRef<CodexEntry>[]; povId?: string }>()
const { t } = useI18n()
</script>

<template>
  <ul class="cards">
    <LinkCard
      v-for="r in refs"
      :key="r.id"
      :problem="r.missing"
      :tag-kind="r.missing ? undefined : 'codex'"
      :tag="
        r.missing
          ? t('linksPanel.entries.problem')
          : (r.typeName ?? t('linksPanel.entries.noType'))
      "
      :title="r.missing ? t('linksPanel.entries.missing') : r.entry.name || t('codex.untitled')"
      :meta="r.id === povId ? t('linksPanel.entries.pov') : ''"
    >
      <button v-if="!r.missing" type="button" class="btn" @click="openEntry(r.id)">
        {{ t('linksPanel.entries.open') }}
      </button>
    </LinkCard>
  </ul>
</template>

<style scoped>
.cards {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
}
</style>
