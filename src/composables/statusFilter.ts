import { computed, ref } from 'vue'
import type { Scene } from '../project/schemas/scene'

export type SceneStatus = Scene['status']

export const STATUSES: SceneStatus[] = ['idea', 'draft', 'revising', 'final']

/** Statuses the outline and corkboard are limited to; empty = show everything. */
export const statusFilter = ref<SceneStatus[]>([])
export const isFiltering = computed(() => statusFilter.value.length > 0)
