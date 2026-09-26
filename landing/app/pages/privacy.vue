<template>
  <div class="page">
    <SiteHeader :version="release?.version" />

    <main class="privacy-content">
      <h1>{{ t('privacy.title') }}</h1>
      <p>{{ t('privacy.media') }}</p>
      <p>{{ t('privacy.updates') }}</p>
      <p>{{ t('privacy.analytics') }}</p>
      <p>{{ t('privacy.cookies') }}</p>
      <p>
        <i18n-t keypath="privacy.questions" scope="global">
          <template #issue><a href="https://github.com/evb0110/evb-player/issues" target="_blank" rel="noreferrer">{{ t('privacy.issueLink') }}</a></template>
        </i18n-t>
      </p>
    </main>

    <SiteFooter />
  </div>
</template>

<script setup lang="ts">
import type { ILatestRelease } from '#shared/release';

const { t } = useI18n();
const { data: release } = await useFetch<ILatestRelease | null>('/api/release', { default: () => null });

useSeoMeta({
  title: () => t('privacy.metaTitle'),
  description: () => t('privacy.metaDescription'),
  robots: 'index, follow',
});
</script>

<style scoped>
/* The page fills the window so the footer sits at the bottom under the short text. */
.page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 28px;
}

.privacy-content {
  flex: 1;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 54px 0 80px;
}

h1 {
  margin: 0 0 28px;
  font-size: clamp(34px, 3.7vw, 46px);
  font-weight: 650;
  line-height: 1.08;
  letter-spacing: -0.035em;
}

p {
  margin: 18px 0 0;
  color: var(--ink-muted);
  font-size: 16px;
  line-height: 1.7;
}

a {
  color: var(--accent-ink);
}

@media (max-width: 580px) {
  .page {
    padding: 0 18px;
  }

  .privacy-content {
    padding-top: 38px;
  }
}
</style>
