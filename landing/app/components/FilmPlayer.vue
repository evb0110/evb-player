<template>
  <figure class="film">
    <div class="film-window">
      <div class="film-titlebar" aria-hidden="true">
        <span class="film-light film-light-close" />
        <span class="film-light film-light-min" />
        <span class="film-light film-light-max" />
        <span class="film-title">{{ title }}</span>
      </div>
      <div class="film-screen" :style="{ aspectRatio: `${width} / ${height}` }">
        <div ref="host" class="film-stage" role="img" :aria-label="label" />
        <!-- The first state as a still until the player has drawn the same frame. -->
        <div v-if="showPoster" class="film-poster" :style="posterStyle" />
      </div>
    </div>
    <figcaption class="film-controls">
      <button class="film-toggle" type="button" :aria-label="playing ? pauseLabel : playLabel" @click="toggle">
        <UIcon :name="playing ? 'i-lucide-pause' : 'i-lucide-play'" />
      </button>
      <div
        class="film-track"
        role="slider"
        tabindex="0"
        :aria-label="positionLabel"
        :aria-valuemin="0"
        :aria-valuemax="duration"
        :aria-valuenow="frame"
        @pointerdown="seekFromPointer"
        @keydown.left.prevent="seekBy(-30)"
        @keydown.right.prevent="seekBy(30)"
      >
        <div class="film-fill" :style="{ width: `${(frame / Math.max(duration - 1, 1)) * 100}%` }" />
      </div>
      <span class="film-time">{{ time }}</span>
    </figcaption>
  </figure>
</template>

<script setup lang="ts">
import { useIntersectionObserver, usePreferredReducedMotion } from '@vueuse/core';
import type { IPlayerHandle } from '~/films/mount';
import { resolveFilmVariant, type TCompositionId, type TFilmTheme } from '~/films/registry';

const props = defineProps<{
  id: TCompositionId;
  locale: string;
  theme: TFilmTheme;
  label: string;
  playLabel: string;
  pauseLabel: string;
  positionLabel: string;
  title: string;
  width: number;
  height: number;
}>();

const host = useTemplateRef<HTMLElement>('host');
const reducedMotion = usePreferredReducedMotion();
const frame = ref(0);
const duration = ref(1);
const playing = ref(false);
const showPoster = ref(true);
const visible = ref(false);
let handle: IPlayerHandle | null = null;
/** The film has drawn content; playback may start. */
let ready = false;
let mountVersion = 0;

// Both posters are CSS backgrounds keyed on the color-mode class, which is set before the first paint,
// so the server render never knows the theme yet the browser fetches only the matching still.
const posterStyle = computed(() => ({
  '--poster-light': `url(/films/${resolveFilmVariant(props.id, props.locale, 'light').path}/poster.jpg)`,
  '--poster-dark': `url(/films/${resolveFilmVariant(props.id, props.locale, 'dark').path}/poster.jpg)`,
}));

const time = computed(() => {
  const seconds = frame.value / 30;
  return `${Math.floor(seconds)}.${Math.floor((seconds % 1) * 10)}s`;
});

async function mountVariant() {
  const version = ++mountVersion;
  handle?.unmount();
  handle = null;
  ready = false;
  playing.value = false;
  frame.value = 0;
  duration.value = 1;
  showPoster.value = true;
  if (!host.value) {
    return;
  }

  const { mountComposition } = await import('~/films/mount');
  const mounted = await mountComposition(host.value, props.id, props.locale, props.theme, {
    reducedMotion: reducedMotion.value === 'reduce',
    onReady: () => {
      if (version !== mountVersion) {
        return;
      }
      // Two frames: the player's first content frame is painted before the poster goes.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (version !== mountVersion) {
          return;
        }
        showPoster.value = false;
        ready = true;
        if (visible.value && reducedMotion.value !== 'reduce') {
          mounted.play();
        }
      }));
    },
    onFrame: (value) => {
      frame.value = value;
    },
    onPlayingChange: (value) => {
      playing.value = value;
    },
  });
  if (version !== mountVersion) {
    mounted.unmount();
    return;
  }
  handle = mounted;
  duration.value = mounted.durationInFrames;
}

function toggle() {
  handle?.toggle();
}

function seekBy(frames: number) {
  handle?.seekTo(Math.min(duration.value - 1, Math.max(0, frame.value + frames)));
}

function seekFromPointer(event: PointerEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const seek = (clientX: number) => {
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    handle?.seekTo(Math.round(ratio * (duration.value - 1)));
  };
  seek(event.clientX);
  const move = (e: PointerEvent) => seek(e.clientX);
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

onMounted(() => {
  void mountVariant();
});

watch(() => [props.locale, props.theme], () => {
  void mountVariant();
});

// Plays only while on screen.
useIntersectionObserver(host, ([entry]) => {
  visible.value = Boolean(entry?.isIntersecting);
  if (!ready || reducedMotion.value === 'reduce') {
    return;
  }
  if (visible.value) {
    handle?.play();
  } else {
    handle?.pause();
  }
});

onBeforeUnmount(() => {
  mountVersion++;
  handle?.unmount();
});
</script>

<style scoped>
.film {
  margin: 0;
}

.film-window {
  overflow: hidden;
  border: 1px solid rgb(29 33 37 / 14%);
  border-radius: 12px;
  background: #f5f6f7;
  box-shadow: 0 1px 2px rgb(29 33 37 / 8%), 0 24px 60px -18px rgb(29 33 37 / 38%);
}

.film-titlebar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 14px;
  border-bottom: 1px solid rgb(25 37 43 / 10%);
  background: #e9ecee;
}

.film-light {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.film-light-close {
  background: #ff5f57;
}

.film-light-min {
  background: #febc2e;
}

.film-light-max {
  background: #28c840;
}

.film-title {
  position: absolute;
  left: 50%;
  color: #536169;
  font-size: 12px;
  font-weight: 600;
  transform: translateX(-50%);
}

.film-screen {
  position: relative;
  width: 100%;
  background: #f5f6f7;
}

/* The window frame matches the film's theme, keyed on the color-mode class like the poster. */
:global(html.dark .film-window),
:global(html.dark .film-screen) {
  background: #101214;
}

:global(html.dark .film-titlebar) {
  border-bottom-color: rgb(255 255 255 / 6%);
  background: #1a1d20;
}

:global(html.dark .film-title) {
  color: #9aa2a4;
}

.film-stage,
.film-poster {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.film-poster {
  background: var(--poster-light) center / cover no-repeat;
}

:global(html.dark .film-poster) {
  background-image: var(--poster-dark);
}

.film-controls {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 14px;
  padding: 0 4px;
}

.film-toggle {
  display: grid;
  width: 30px;
  height: 30px;
  flex: none;
  place-items: center;
  border-radius: 8px;
  color: var(--ink);
  cursor: pointer;
}

.film-toggle:hover,
.film-toggle:focus-visible {
  background: rgb(29 33 37 / 7%);
}

.film-track {
  position: relative;
  flex: 1;
  height: 4px;
  overflow: hidden;
  border-radius: 2px;
  background: rgb(29 33 37 / 12%);
  cursor: pointer;
}

.film-fill {
  height: 100%;
  background: var(--accent);
}

.film-time {
  min-width: 44px;
  color: var(--ink-subtle);
  font-family: var(--mono);
  font-size: 12px;
  text-align: right;
}
</style>
