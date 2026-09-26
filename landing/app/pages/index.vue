<template>
  <div class="page">
    <header class="site-header">
      <NuxtLink class="brand" :to="localePath('/')">
        <img class="brand-icon" src="/icon.png" alt="" width="30" height="30">
        <span class="brand-name">EVB Player</span>
        <span v-if="release" class="brand-version">v{{ release.version }}</span>
      </NuxtLink>
      <div class="header-actions">
        <UDropdownMenu :items="themeItems" :content="{ align: 'end' }">
          <UButton color="neutral" :icon="activeTheme.icon" variant="ghost" :aria-label="t('header.theme')" :title="t('header.theme')" class="theme-control" />
        </UDropdownMenu>
        <UDropdownMenu :items="languageItems" :content="{ align: 'end' }">
          <UButton color="neutral" :icon="activeLanguage.icon" variant="ghost" :aria-label="t('header.language')" :title="t('header.language')" class="language-control" />
        </UDropdownMenu>
        <UButton color="neutral" icon="i-simple-icons-github" variant="ghost" to="https://github.com/evb0110/evb-player" :aria-label="t('header.github')" :title="t('header.github')" />
      </div>
    </header>

    <main>
      <section class="hero">
        <p class="kicker">{{ t('hero.kicker') }}</p>
        <h1>{{ t('hero.title') }}</h1>
        <p class="lede">{{ t('hero.lede') }}</p>

        <div class="downloads">
          <div class="platform-tabs" role="tablist" :aria-label="t('downloads.operatingSystem')">
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
              {{ t(`downloads.platforms.${option.id}`) }}
            </button>
          </div>

          <a class="download-row" :href="selectedAsset?.url ?? RELEASES_URL" role="tabpanel">
            <span class="download-copy">
              <strong>{{ selectedDetails.title }}</strong>
              <span>{{ selectedDetails.detail }}</span>
              <small>{{ selectedDetails.format }}<template v-if="selectedAsset"> · {{ formatSize(selectedAsset.size) }}</template></small>
            </span>
            <span class="download-button">
              <UIcon name="i-lucide-download" />
              <span>{{ t(selectedAsset ? 'downloads.download' : 'downloads.releases') }}</span>
            </span>
          </a>
          <p class="download-note">{{ selectedDetails.note }}</p>
        </div>

        <p class="release-line">
          <template v-if="release">{{ t('downloads.version', { version: release.version }) }} · </template>{{ t('downloads.installed') }} ·
          <a :href="release?.pageUrl ?? RELEASES_URL">{{ t('downloads.allReleases') }}</a>
        </p>
        <p class="release-line">
          <a href="https://evb-player-web.vercel.app">{{ t('downloads.web') }}</a>
        </p>
      </section>

      <section class="demo">
        <FilmPlayer
          id="player"
          :locale="locale"
          :theme="resolvedTheme"
          title="EVB Player"
          :label="t('demo.ariaLabel')"
          :play-label="t('demo.play')"
          :pause-label="t('demo.pause')"
          :position-label="t('demo.position')"
          :width="1280"
          :height="800"
        />
        <p class="demo-caption">{{ t('demo.caption') }}</p>
      </section>

      <section class="features" aria-labelledby="features-title">
        <h2 id="features-title" class="kicker">{{ t('features.title') }}</h2>
        <div class="feature-grid">
          <article v-for="feature in features" :key="feature.title" class="feature">
            <UIcon class="feature-icon" :name="feature.icon" />
            <h3>{{ feature.title }}</h3>
            <p>{{ feature.text }}</p>
          </article>
        </div>
        <p class="formats">{{ t('features.formats') }}</p>
      </section>
    </main>

    <footer class="site-footer">
      <span>
        <i18n-t keypath="footer.copyright" scope="global">
          <template #name><a href="https://evb-stack.com" title="evb-stack.com">Eugene Barsky</a></template>
        </i18n-t>
        · {{ t('footer.license') }}
      </span>
      <span>
        <a href="https://github.com/evb0110/evb-player">{{ t('footer.source') }}</a> ·
        <a href="https://evb-viewer.com">{{ t('footer.viewer') }}</a>
      </span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { RELEASES_URL, type ILatestRelease, type TPlatform } from '#shared/release';
import { LOCALE_OPTIONS, type TLocale } from '~/i18n/languages';

interface IPlatformOption {
  id: TPlatform;
  icon: string;
}

interface IThemeOption {
  value: 'system' | 'light' | 'dark';
  icon: string;
  label: string;
}

const platforms: IPlatformOption[] = [
  { id: 'mac', icon: 'i-simple-icons-apple' },
  { id: 'win', icon: 'i-lucide-monitor' },
  { id: 'linux', icon: 'i-simple-icons-linux' },
];

const featureIcons = [
  { key: 'folders', icon: 'i-lucide-folder-tree' },
  { key: 'durations', icon: 'i-lucide-timer' },
  { key: 'resume', icon: 'i-lucide-history' },
  { key: 'skip', icon: 'i-lucide-circle-check' },
  { key: 'tabs', icon: 'i-lucide-panels-top-left' },
  { key: 'room', icon: 'i-lucide-expand' },
];

const { t, locale, setLocale } = useI18n();
const localePath = useLocalePath();
const { data: release } = await useFetch<ILatestRelease | null>('/api/release', { default: () => null });

const platform = ref<TPlatform>('mac');
const selectedDetails = computed(() => ({
  title: t(`downloads.options.${platform.value}.title`),
  detail: t(`downloads.options.${platform.value}.detail`),
  format: t(`downloads.options.${platform.value}.format`),
  note: t(`downloads.options.${platform.value}.note`),
}));
const selectedAsset = computed(() => release.value?.assets[platform.value]);
const features = computed(() => featureIcons.map(({ key, icon }) => ({
  icon,
  title: t(`features.items.${key}.title`),
  text: t(`features.items.${key}.text`),
})));
const activeLanguage = computed(() => LOCALE_OPTIONS.find((option) => option.code === locale.value) ?? LOCALE_OPTIONS[0]);
const themeOptions = computed<IThemeOption[]>(() => [
  { value: 'system', icon: 'i-lucide-monitor', label: t('theme.system') },
  { value: 'light', icon: 'i-lucide-sun', label: t('theme.light') },
  { value: 'dark', icon: 'i-lucide-moon', label: t('theme.dark') },
]);
const colorMode = useColorMode();
const resolvedTheme = computed(() => colorMode.value === 'dark' ? 'dark' : 'light');
const activeTheme = computed(() => themeOptions.value.find((option) => option.value === colorMode.preference) ?? themeOptions.value[0]!);
// The same menus as the app's top row: an icon and label per item, with a check on the active one.
const themeItems = computed(() => themeOptions.value.map((option) => ({
  label: option.label,
  icon: option.icon,
  onSelect: () => {
    colorMode.preference = option.value;
  },
  ...(option.value === colorMode.preference ? { trailingIcon: 'i-lucide-check' } : {}),
})));
const languageItems = computed(() => LOCALE_OPTIONS.map((option) => ({
  label: option.name,
  icon: option.icon,
  onSelect: () => void selectLocale(option.code),
  ...(option.code === locale.value ? { trailingIcon: 'i-lucide-check' } : {}),
})));

function formatSize(bytes: number) {
  return new Intl.NumberFormat(locale.value, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 0 }).format(bytes / 1024 ** 2);
}

async function selectLocale(code: TLocale) {
  if (code !== locale.value) {
    await setLocale(code);
  }
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
const pageUrl = computed(() => new URL(localePath('/'), siteUrl).toString());
const ogLocale = computed(() => LOCALE_OPTIONS.find((option) => option.code === locale.value)?.language.replace('-', '_') ?? 'en_US');
useSeoMeta({
  title: () => t('seo.title'),
  description: () => t('seo.description'),
  ogTitle: () => t('seo.ogTitle'),
  ogDescription: () => t('seo.ogDescription'),
  ogImage: `${siteUrl}/films/player/en-dark/poster.jpg`,
  ogImageAlt: () => t('seo.ogImageAlt'),
  ogUrl: () => pageUrl.value,
  ogLocale: () => ogLocale.value,
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
  color: var(--paper-raised);
  background: var(--ink);
}

.platform-tab-active:hover {
  color: var(--paper-raised);
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
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  box-shadow: 0 10px 30px -18px color-mix(in srgb, var(--accent) 48%, transparent);
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
  color: var(--on-accent);
  background: var(--accent-button);
  font-size: 14px;
  font-weight: 600;
}

.download-row:hover .download-button {
  background: color-mix(in srgb, var(--accent-button) 84%, #000);
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

  .site-header {
    flex-wrap: wrap;
  }

  .header-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .feature-grid {
    grid-template-columns: 1fr;
  }

  .download-row {
    padding: 14px;
  }
}
</style>
