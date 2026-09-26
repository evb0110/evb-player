<template>
  <header class="site-header">
    <NuxtLink class="brand" :to="localePath('/')">
      <img class="brand-icon" src="/icon.png" alt="" width="30" height="30">
      <span class="brand-name">EVB Player</span>
      <span v-if="version" class="brand-version">v{{ version }}</span>
    </NuxtLink>
    <div class="header-actions">
      <UButton color="neutral" variant="ghost" icon="i-lucide-globe" :label="t('header.useInBrowser')" :to="WEB_APP_URL" target="_blank" rel="noreferrer" />
      <ThemeToggle
        :theme="resolvedTheme"
        :switch-to-light-label="t('header.switchToLightTheme')"
        :switch-to-dark-label="t('header.switchToDarkTheme')"
        @change="chooseTheme"
      />
      <LanguageMenu :locale="activeLocale" :label="t('header.language')" @change="selectLocale" />
      <UButton color="neutral" icon="i-simple-icons-github" variant="ghost" to="https://github.com/evb0110/evb-player" target="_blank" rel="noreferrer" :aria-label="t('header.github')" :title="t('header.github')" />
    </div>
  </header>
</template>

<script setup lang="ts">
import type { TLocale } from '../../../shared/types';
import LanguageMenu from '../../../shared/ui/LanguageMenu.vue';
import ThemeToggle from '../../../shared/ui/ThemeToggle.vue';
import { useTheme } from '../composables/useTheme';

defineProps<{ version?: string }>();

const WEB_APP_URL = 'https://evb-player-web.vercel.app';
const { t, locale, setLocale } = useI18n();
const localePath = useLocalePath();
const activeLocale = computed(() => locale.value as TLocale);
const { theme: resolvedTheme, chooseTheme } = useTheme();

async function selectLocale(code: TLocale) {
  if (code !== locale.value) {
    await setLocale(code);
  }
}
</script>

<style scoped>
.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 22px 0;
  border-bottom: 1px solid var(--line);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
}

.brand-icon {
  border-radius: 7px;
}

.brand-name {
  font-size: 16px;
  font-weight: 650;
}

.brand-version {
  color: var(--ink-subtle);
  font-family: var(--mono);
  font-size: 13px;
}

@media (max-width: 580px) {
  .site-header {
    flex-wrap: wrap;
  }

  .header-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
