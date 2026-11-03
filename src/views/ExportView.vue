<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '../project/store'
import BookExportView from './BookExportView.vue'
import ScriptExportView from './ScriptExportView.vue'

const project = useProjectStore()
const isScript = computed(() => project.project?.manifest.kind === 'screenplay')
</script>

<template>
  <ScriptExportView v-if="isScript" />
  <BookExportView v-else />
</template>
