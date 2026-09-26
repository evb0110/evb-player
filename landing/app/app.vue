<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>

<script setup lang="ts">
const localeHead = useLocaleHead({ seo: { canonicalQueries: [] } });

useHead(() => ({
  htmlAttrs: { lang: localeHead.value.htmlAttrs.lang },
  link: localeHead.value.link,
  meta: localeHead.value.meta,
}));
</script>
