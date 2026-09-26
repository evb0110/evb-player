<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>

<script setup lang="ts">
const localeHead = useLocaleHead({ seo: { canonicalQueries: [] } });
const { theme } = useTheme();

useHead(() => ({
  htmlAttrs: { lang: localeHead.value.htmlAttrs.lang },
  link: localeHead.value.link,
  meta: [
    ...localeHead.value.meta,
    { name: 'theme-color', content: theme.value === 'dark' ? '#17150f' : '#f4f1ea' },
  ],
}));
</script>
