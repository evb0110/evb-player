<template>
  <footer class="site-footer">
    <span>
      <i18n-t keypath="footer.copyright" scope="global">
        <template #name><a href="https://evb-stack.com" title="evb-stack.com" target="_blank" rel="noreferrer">Eugene Barsky</a></template>
      </i18n-t>
      · {{ t('footer.license') }}
    </span>
    <span>
      <NuxtLink :to="localePath('/privacy')">{{ t('footer.privacy') }}</NuxtLink> ·
      <a href="https://github.com/evb0110/evb-player" target="_blank" rel="noreferrer">{{ t('footer.source') }}</a> ·
      <a href="https://evb-viewer.com" target="_blank" rel="noreferrer">{{ t('footer.viewer') }}</a>
    </span>
  </footer>
</template>

<script setup lang="ts">
const { t } = useI18n();
const localePath = useLocalePath();
</script>

<style scoped>
.site-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  padding: 26px 0 36px;
  border-top: 1px solid var(--line);
  color: var(--ink-subtle);
  font-family: var(--mono);
  font-size: 12px;
}
</style>
