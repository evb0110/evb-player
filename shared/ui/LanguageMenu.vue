<template>
  <UDropdownMenu :items="items" :content="{align: 'end'}">
    <UButton color="neutral" variant="ghost" class="language-menu-trigger" :aria-label="label" :title="label">
      <UIcon :name="activeOption.flagIcon" />
    </UButton>
  </UDropdownMenu>
</template>

<script setup>
// Plain JavaScript for the same reason as ThemeToggle.vue.
import {computed} from 'vue';
import {UButton, UDropdownMenu, UIcon} from '#components';
import {LOCALE_OPTIONS} from '../i18n/locales';

const props = defineProps({
  locale: {type: String, required: true},
  label: {type: String, required: true},
});

const emit = defineEmits(['change']);

const activeOption = computed(() => LOCALE_OPTIONS.find((option) => option.code === props.locale) ?? LOCALE_OPTIONS[0]);
const items = computed(() => LOCALE_OPTIONS.map((option) => ({
  label: option.nativeName,
  icon: option.flagIcon,
  ...(option.code === props.locale ? {trailingIcon: 'i-lucide-check'} : {}),
  onSelect: () => emit('change', option.code),
})));
</script>

<style scoped>
.language-menu-trigger {
  width: 36px;
  height: 36px;
  padding: 0;
}
</style>
