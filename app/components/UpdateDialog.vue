<template>
  <UModal v-model:open="isOpen" :title="dialogTitle">
    <template #body>
      <p v-if="status.phase === 'available'" class="update-dialog-copy">
        {{ t('updates.available', {version: status.version, currentVersion: status.currentVersion}) }}
      </p>
      <p v-else-if="status.phase === 'error'" class="update-dialog-copy" role="alert">
        {{ t('updates.checkFailed') }}
      </p>
      <div v-else-if="status.phase === 'downloading'" class="update-progress" role="status">
        <UProgress :model-value="percent" :aria-label="t('updates.progress', {percent})" />
        <p>{{ t('updates.progress', {percent}) }}</p>
      </div>
      <p v-if="status.phase === 'ready' && status.requiresPassword" class="update-dialog-copy">
        {{ t('updates.requiresPassword') }}
      </p>
    </template>
    <template #footer>
      <template v-if="status.phase === 'available'">
        <UButton color="neutral" :label="t('updates.later')" variant="ghost" @click="close" />
        <UButton color="neutral" :label="t('updates.skip')" variant="outline" @click="emit('skip')" />
        <UButton color="primary" icon="i-lucide-download" :label="t('updates.download')" @click="emit('download')" />
      </template>
      <UButton v-else-if="status.phase === 'downloading'" color="neutral" :label="t('updates.later')" variant="ghost" @click="close" />
      <template v-else-if="status.phase === 'ready'">
        <UButton color="neutral" :label="t('updates.later')" variant="ghost" @click="close" />
        <UButton color="primary" icon="i-lucide-refresh-cw" :label="t('updates.restartNow')" @click="emit('install')" />
      </template>
      <UButton v-else-if="status.phase === 'error'" color="primary" :label="t('updates.tryAgain')" @click="emit('retry')" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import {useI18n} from 'vue-i18n';
import type {IUpdateStatus} from '../../shared/types';

const props = defineProps<{
  status: IUpdateStatus;
  open: boolean;
}>();

const emit = defineEmits<{
  'update:open': [open: boolean];
  download: [];
  install: [];
  retry: [];
  skip: [];
}>();

const {t} = useI18n();
const isOpen = computed({
  get: () => props.open,
  set: (open: boolean) => emit('update:open', open),
});
const percent = computed(() => Math.max(0, Math.min(100, Math.round(props.status.percent ?? 0))));
const dialogTitle = computed(() => {
  if (props.status.phase === 'checking') {
    return t('updates.checking');
  }
  if (props.status.phase === 'up-to-date') {
    return t('updates.latest', {version: props.status.currentVersion});
  }
  if (props.status.phase === 'downloading') {
    return t('updates.downloading', {version: props.status.version});
  }
  if (props.status.phase === 'ready') {
    return t('updates.ready', {version: props.status.version});
  }
  return t('updates.title');
});

function close() {
  isOpen.value = false;
}
</script>

<style scoped>
.update-dialog-copy {
  color: var(--ui-text-muted);
  line-height: 1.6;
}

.update-progress {
  display: grid;
  gap: 0.75rem;
}

.update-progress p {
  color: var(--ui-text-muted);
  font-size: 0.875rem;
  text-align: right;
}
</style>
