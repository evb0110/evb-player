<template>
  <div class="page">
    <header class="site-header">
      <a class="brand" href="/">
        <img class="brand-icon" src="/icon.png" alt="" width="30" height="30">
        <span class="brand-name">EVB Player</span>
        <span v-if="release" class="brand-version">v{{ release.version }}</span>
      </a>
      <a class="header-link" href="https://github.com/evb0110/evb-player" aria-label="EVB Player on GitHub">
        <UIcon name="i-simple-icons-github" />
      </a>
    </header>

    <main>
      <section class="hero">
        <p class="kicker">Offline course player</p>
        <h1>Play course folders like a course</h1>
        <p class="lede">
          EVB Player turns a folder of numbered videos or audio files into a course: a playlist with sections and durations,
          progress that is saved as you watch, and tabs for several courses at once. It runs offline on macOS, Windows, and
          Linux, and it is free and MIT licensed.
        </p>

        <div class="downloads">
          <div class="platform-tabs" role="tablist" aria-label="Operating system">
            <button
              v-for="option in platforms"
              :key="option.id"
              class="platform-tab"
              :class="{ 'platform-tab-active': platform === option.id }"
              type="button"
              role="tab"
              :aria-selected="platform === option.id"
              @click="platform = option.id"
            >
              <UIcon :name="option.icon" />
              {{ option.label }}
            </button>
          </div>

          <a class="download-row" :href="selectedAsset?.url ?? RELEASES_URL" role="tabpanel">
            <span class="download-copy">
              <strong>{{ selected.title }}</strong>
              <span>{{ selected.detail }}</span>
              <small>{{ selected.format }}<template v-if="selectedAsset"> · {{ formatSize(selectedAsset.size) }}</template></small>
            </span>
            <span class="download-button">
              <UIcon name="i-lucide-download" />
              <span>{{ selectedAsset ? 'Download' : 'Releases' }}</span>
            </span>
          </a>
          <p class="download-note">{{ selected.note }}</p>
        </div>

        <p class="release-line">
          <template v-if="release">Version {{ release.version }} · </template>Installed apps update themselves ·
          <a :href="release?.pageUrl ?? RELEASES_URL">All releases</a>
        </p>
      </section>

      <section class="demo" aria-label="Demo">
        <FilmPlayer
          id="player"
          title="EVB Player"
          label="EVB Player opening a TypeScript course from the Library, playing a lesson, marking another lesson complete, switching lessons, filling the window with the video, and returning to the Library while the lesson keeps playing."
          :width="1280"
          :height="800"
        />
        <p class="demo-caption">Recorded from the real app with a generated demo course.</p>
      </section>

      <section class="features" aria-labelledby="features-title">
        <h2 id="features-title" class="kicker">What it does</h2>
        <div class="feature-grid">
          <article v-for="feature in features" :key="feature.title" class="feature">
            <UIcon class="feature-icon" :name="feature.icon" />
            <h3>{{ feature.title }}</h3>
            <p>{{ feature.text }}</p>
          </article>
        </div>
        <p class="formats">
          Plays MP4, MOV, MKV, WebM, MP3, M4A, AAC, FLAC, WAV, Ogg and Opus. Files the built-in player can't decode, such as AVI,
          open in your usual media player.
        </p>
      </section>
    </main>

    <footer class="site-footer">
      <span>© 2026 Eugene Barsky · MIT License</span>
      <span>
        <a href="https://github.com/evb0110/evb-player">Source on GitHub</a> ·
        <a href="https://evb-viewer.com">EVB Viewer</a>
      </span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { RELEASES_URL, type ILatestRelease, type TPlatform } from '#shared/release';

interface IPlatformOption {
  id: TPlatform;
  label: string;
  icon: string;
  title: string;
  detail: string;
  format: string;
  note: string;
}

const platforms: IPlatformOption[] = [
  {
    id: 'mac',
    label: 'macOS',
    icon: 'i-simple-icons-apple',
    title: 'Apple Silicon',
    detail: 'For Macs with M-series chips',
    format: 'DMG installer',
    note: 'Signed and notarized by Apple. Open the DMG and drag EVB Player to Applications.',
  },
  {
    id: 'win',
    label: 'Windows',
    icon: 'i-lucide-monitor',
    title: 'Windows 10 and 11',
    detail: 'For 64-bit PCs (x64)',
    format: 'Installer',
    note: 'The installer is not code-signed yet, so Windows SmartScreen may ask you to confirm: choose More info, then Run anyway.',
  },
  {
    id: 'linux',
    label: 'Linux',
    icon: 'i-simple-icons-linux',
    title: 'Ubuntu and Debian',
    detail: 'For 64-bit PCs (x64)',
    format: '.deb package',
    note: 'Install with sudo apt install ./ followed by the file name. Updates ask for your password before installing.',
  },
];

const features = [
  {
    icon: 'i-lucide-folder-tree',
    title: 'Folders become courses',
    text: 'Files are sorted by their numbers and subfolders become sections. Nothing is copied, converted or uploaded.',
  },
  {
    icon: 'i-lucide-timer',
    title: 'Durations up front',
    text: 'Lesson and course lengths are read from the files when a folder opens, before you play anything.',
  },
  {
    icon: 'i-lucide-history',
    title: 'Resume where you stopped',
    text: 'Your position in every lesson is saved as you watch. Finished lessons are ticked off and the next one starts.',
  },
  {
    icon: 'i-lucide-circle-check',
    title: 'Skip what you know',
    text: 'Mark any lesson complete without watching it, or reset one lesson or a whole course.',
  },
  {
    icon: 'i-lucide-panels-top-left',
    title: 'Several courses in tabs',
    text: 'Keep a few courses open at once. The Library keeps the current lesson playing in a compact player.',
  },
  {
    icon: 'i-lucide-expand',
    title: 'Room for the lesson',
    text: 'Theater mode, full window and fullscreen, speed control, and keyboard shortcuts for everything.',
  },
];

const { data: release } = await useFetch<ILatestRelease | null>('/api/release', { default: () => null });

const platform = ref<TPlatform>('mac');
const selected = computed(() => platforms.find((option) => option.id === platform.value) ?? platforms[0]!);
const selectedAsset = computed(() => release.value?.assets[platform.value]);

function formatSize(bytes: number) {
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

// The page is cached for everyone, so the visitor's system is picked in the browser.
onMounted(() => {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const system = `${nav.userAgentData?.platform ?? ''} ${navigator.platform} ${navigator.userAgent}`.toLowerCase();
  if (system.includes('win')) {
    platform.value = 'win';
  } else if (system.includes('linux') && !system.includes('android')) {
    platform.value = 'linux';
  }
});

const siteUrl = useRuntimeConfig().public.siteUrl;
useSeoMeta({
  title: 'EVB Player · Offline course player for macOS, Windows, and Linux',
  description: 'EVB Player turns folders of numbered videos or audio files into courses with a playlist, durations, saved progress and tabs. Free, offline and MIT licensed.',
  ogTitle: 'EVB Player',
  ogDescription: 'Play course folders like a course. Offline, on macOS, Windows, and Linux.',
  ogImage: `${siteUrl}/films/player/poster.jpg`,
  ogUrl: siteUrl,
  twitterCard: 'summary_large_image',
});
</script>

<style scoped>
.page {
  max-width: 1180px;
  margin: 0 auto;
  padding: 0 28px;
}

.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22px 0;
  border-bottom: 1px solid var(--line);
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

.header-link {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 9px;
  font-size: 18px;
}

.header-link:hover {
  background: var(--paper-raised);
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 88px 0 56px;
  text-align: center;
}

.kicker {
  margin: 0;
  color: var(--ink-subtle);
  font-family: var(--mono);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

h1 {
  max-width: 820px;
  margin: 20px 0 0;
  font-size: clamp(40px, 6.4vw, 70px);
  font-weight: 650;
  line-height: 1.04;
  letter-spacing: -0.035em;
  text-wrap: balance;
}

.lede {
  max-width: 640px;
  margin: 26px 0 0;
  color: var(--ink-muted);
  font-size: 18px;
  line-height: 1.6;
}

.downloads {
  width: min(100%, 460px);
  margin-top: 40px;
}

.platform-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--paper-raised);
}

.platform-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 36px;
  border-radius: 8px;
  color: var(--ink-muted);
  font-size: 14px;
  font-weight: 550;
  cursor: pointer;
}

.platform-tab:hover {
  color: var(--ink);
}

.platform-tab-active {
  color: #fff;
  background: var(--ink);
}

.platform-tab-active:hover {
  color: #fff;
}

.download-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 10px;
  padding: 18px 18px 18px 20px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--paper-raised);
  text-align: left;
  text-decoration: none;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}

.download-row:hover {
  border-color: rgb(224 103 60 / 45%);
  box-shadow: 0 10px 30px -18px rgb(178 74 34 / 45%);
}

.download-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.download-copy strong {
  font-size: 16px;
  font-weight: 650;
}

.download-copy span {
  color: var(--ink-muted);
  font-size: 14px;
}

.download-copy small {
  color: var(--ink-subtle);
  font-family: var(--mono);
  font-size: 12px;
}

.download-button {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 16px;
  border-radius: 10px;
  color: #fff;
  background: var(--accent);
  font-size: 14px;
  font-weight: 600;
}

.download-row:hover .download-button {
  background: var(--accent-ink);
}

.download-note {
  margin: 12px 4px 0;
  color: var(--ink-subtle);
  font-size: 13px;
  line-height: 1.5;
  text-align: left;
}

.release-line {
  margin: 22px 0 0;
  color: var(--ink-subtle);
  font-family: var(--mono);
  font-size: 12px;
}

.release-line a {
  color: var(--accent-ink);
}

.demo {
  max-width: 1080px;
  margin: 0 auto;
  padding: 16px 0 24px;
}

.demo-caption {
  margin: 10px 0 0;
  color: var(--ink-subtle);
  font-size: 13px;
  text-align: center;
}

.features {
  padding: 88px 0 72px;
  text-align: center;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  margin-top: 30px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--line);
  text-align: left;
}

.feature {
  padding: 28px 26px 30px;
  background: var(--paper-raised);
}

.feature-icon {
  width: 22px;
  height: 22px;
  color: var(--accent);
}

.feature h3 {
  margin: 16px 0 0;
  font-size: 17px;
  font-weight: 650;
}

.feature p {
  margin: 8px 0 0;
  color: var(--ink-muted);
  font-size: 15px;
  line-height: 1.55;
}

.formats {
  max-width: 680px;
  margin: 26px auto 0;
  color: var(--ink-subtle);
  font-size: 14px;
  line-height: 1.6;
}

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

@media (max-width: 860px) {
  .feature-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 580px) {
  .page {
    padding: 0 18px;
  }

  .hero {
    padding-top: 56px;
  }

  .feature-grid {
    grid-template-columns: 1fr;
  }

  .download-row {
    padding: 14px;
  }
}
</style>
