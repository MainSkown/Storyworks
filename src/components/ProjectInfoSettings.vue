<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '../project/store'

const { t } = useI18n()
const project = useProjectStore()
const readOnly = computed(() => !!project.readOnly)
const isScreenplay = computed(() => project.project?.manifest.kind === 'screenplay')

const form = reactive({ ...project.bookInfo })
// Follow reloads (e.g. an outside change) but not our own typing.
watch(
  () => project.bookInfo,
  (v) => Object.assign(form, v),
)

// A blank title is not saved; the field snaps back to the saved one on blur.
function save(): void {
  if (!project.setBookInfo({ ...form })) Object.assign(form, project.bookInfo)
}
</script>

<template>
  <div
    v-if="project.project"
    id="project-info"
    class="group"
    role="group"
    aria-labelledby="set-info"
  >
    <h2 id="set-info">{{ t(isScreenplay ? 'settings.info.titlePage' : 'settings.info.title') }}</h2>
    <p v-if="readOnly" class="hint">{{ t('settings.info.readOnly') }}</p>
    <QInput
      v-model="form.title"
      outlined
      dense
      :label="t('settings.info.bookTitle')"
      :disable="readOnly"
      @blur="save"
    />
    <QInput
      v-model="form.author"
      outlined
      dense
      :label="t('settings.info.author')"
      :disable="readOnly"
      @blur="save"
    />
    <template v-if="isScreenplay">
      <QInput
        v-model="form.contact"
        outlined
        dense
        type="textarea"
        autogrow
        :label="t('settings.info.contact')"
        :disable="readOnly"
        @blur="save"
      />
      <QInput
        v-model="form.date"
        outlined
        dense
        :label="t('settings.info.date')"
        :disable="readOnly"
        @blur="save"
      />
    </template>
  </div>
</template>

<style scoped>
.group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 28rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}
.group h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}
.hint {
  margin: 0;
  color: var(--text-secondary);
}
</style>
