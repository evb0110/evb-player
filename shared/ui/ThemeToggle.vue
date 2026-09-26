<template>
  <UButton
    color="neutral"
    variant="ghost"
    class="theme-toggle"
    :aria-label="label"
    :title="label"
    @click="toggleTheme"
  >
    <span class="theme-toggle-icons" aria-hidden="true">
      <span class="theme-toggle-icon" :class="{ 'theme-toggle-icon-visible': theme === 'light' }"><UIcon name="i-lucide-sun" /></span>
      <span class="theme-toggle-icon" :class="{ 'theme-toggle-icon-visible': theme === 'dark' }"><UIcon name="i-lucide-moon" /></span>
    </span>
  </UButton>
</template>

<script setup>
// Plain JavaScript: the landing compiles shared components on Vercel without the root app's generated
// .nuxt/tsconfig.json, and Vite's TypeScript transform for a .vue file here would need it.
import {computed, nextTick} from 'vue';
import {UButton, UIcon} from '#components';

const props = defineProps({
  theme: {type: String, required: true},
  switchToLightLabel: {type: String, required: true},
  switchToDarkLabel: {type: String, required: true},
});

const emit = defineEmits(['change']);

const label = computed(() => props.theme === 'light' ? props.switchToDarkLabel : props.switchToLightLabel);

function toggleTheme(event) {
  const nextTheme = props.theme === 'light' ? 'dark' : 'light';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof document.startViewTransition !== 'function' || reducedMotion) {
    emit('change', nextTheme);
    return;
  }

  const target = event.currentTarget;
  const rect = target.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--theme-switch-x', `${x}px`);
  rootStyle.setProperty('--theme-switch-y', `${y}px`);
  rootStyle.setProperty('--theme-switch-radius', `${radius}px`);

  const transition = document.startViewTransition(async () => {
    emit('change', nextTheme);
    await nextTick();
  });
  const clearRevealOrigin = () => {
    rootStyle.removeProperty('--theme-switch-x');
    rootStyle.removeProperty('--theme-switch-y');
    rootStyle.removeProperty('--theme-switch-radius');
  };
  void transition.finished.then(clearRevealOrigin, clearRevealOrigin);
}
</script>

<style scoped>
.theme-toggle-icons {
  position: relative;
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  font-size: 20px;
}

.theme-toggle-icon {
  position: absolute;
  display: grid;
  place-items: center;
  opacity: 0;
  transform: rotate(-90deg) scale(0.72);
  transition: opacity 180ms ease, transform 220ms ease;
}

.theme-toggle-icon-visible {
  opacity: 1;
  transform: rotate(0) scale(1);
}

:global(::view-transition-old(root)) {
  animation: none;
}

:global(::view-transition-new(root)) {
  animation: theme-switch-reveal 400ms ease-out both;
}

@keyframes theme-switch-reveal {
  from {
    clip-path: circle(0 at var(--theme-switch-x) var(--theme-switch-y));
  }
  to {
    clip-path: circle(var(--theme-switch-radius) at var(--theme-switch-x) var(--theme-switch-y));
  }
}

@media (prefers-reduced-motion: reduce) {
  .theme-toggle-icon {
    transition: none;
  }
}
</style>
