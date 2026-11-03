<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '../project/store'
import BookExportView from './BookExportView.vue'
import GameExportView from './GameExportView.vue'
import ScriptExportView from './ScriptExportView.vue'

const project = useProjectStore()
const kind = computed(() => project.project?.manifest.kind)
</script>

<template>
  <ScriptExportView v-if="kind === 'screenplay'" />
  <GameExportView v-else-if="kind === 'game'" />
  <BookExportView v-else />
</template>
