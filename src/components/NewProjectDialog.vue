<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isTauri, pickFolder } from '../project/pickFolder'
import { useProjectStore } from '../project/store'

const open = defineModel<boolean>({ required: true })
const { t } = useI18n()
const store = useProjectStore()

const title = ref('')
const author = ref('')
const language = ref('en')
const folder = ref('')
const busy = ref(false)
const error = ref('')
const native = isTauri()

const languages = [
  { label: 'English', value: 'en' },
  { label: 'Polski', value: 'pl' },
]

const canCreate = computed(
  () => !busy.value && title.value.trim() !== '' && folder.value.trim() !== '',
)

watch(open, (isOpen) => {
  if (!isOpen) return
  title.value = ''
  author.value = ''
  language.value = 'en'
  folder.value = ''
  error.value = ''
  busy.value = false
})

async function choose(): Promise<void> {
  const picked = await pickFolder()
  if (picked) folder.value = picked
}

async function submit(): Promise<void> {
  if (!canCreate.value) return
  busy.value = true
  error.value = ''
  const outcome = await store.create(folder.value, {
    title: title.value.trim(),
    author: author.value.trim(),
    language: language.value,
  })
  busy.value = false
  if (outcome === 'failed') {
    const msg = store.openError && 'message' in store.openError ? store.openError.message : ''
    error.value = msg.includes('already exists')
      ? t('newProject.exists')
      : t('newProject.failed', { message: msg })
    return
  }
  open.value = false
}
</script>

<template>
  <QDialog v-model="open">
    <QCard class="dialog" role="dialog" :aria-label="t('newProject.title')">
      <form @submit.prevent="submit">
        <QCardSection>
          <h2 class="heading">{{ t('newProject.title') }}</h2>
        </QCardSection>
        <QCardSection class="fields">
          <QInput
            v-model="title"
            outlined
            dense
            autofocus
            :label="t('newProject.bookTitle')"
            :disable="busy"
          />
          <QInput v-model="author" outlined dense :label="t('newProject.author')" :disable="busy" />
          <QSelect
            v-model="language"
            outlined
            dense
            emit-value
            map-options
            :options="languages"
            :label="t('newProject.language')"
            :disable="busy"
          />
          <div v-if="native" class="folder">
            <QBtn
              no-caps
              unelevated
              class="btn-secondary"
              icon="folder_open"
              :label="t('newProject.chooseFolder')"
              :disable="busy"
              @click="choose"
            />
            <span class="path" :class="{ none: !folder }" aria-live="polite">
              <span class="visually-hidden">{{ t('newProject.folder') }}: </span
              >{{ folder || t('newProject.noFolder') }}
            </span>
          </div>
          <QInput
            v-else
            v-model="folder"
            outlined
            dense
            :label="t('newProject.folderName')"
            :hint="t('newProject.folderHint')"
            :disable="busy"
          />
          <p v-if="error" class="error" role="alert">{{ error }}</p>
        </QCardSection>
        <QCardActions align="right">
          <QBtn
            flat
            no-caps
            :label="t('newProject.cancel')"
            :disable="busy"
            @click="open = false"
          />
          <QBtn
            unelevated
            no-caps
            color="primary"
            type="submit"
            :label="t('newProject.create')"
            :disable="!canCreate"
            :loading="busy"
          />
        </QCardActions>
      </form>
    </QCard>
  </QDialog>
</template>

<style scoped>
.dialog {
  width: min(100vw - 2rem, 28rem);
  background: var(--bg-raised);
  color: var(--text-primary);
}

.heading {
  margin: 0;
  font-size: 1.25rem;
}

.fields {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.folder {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.path {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 0.875rem;
}

.path.none {
  color: var(--text-secondary);
}

.error {
  margin: 0;
  color: var(--section-checks);
  font-size: 0.875rem;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
