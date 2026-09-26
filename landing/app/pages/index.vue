<template>
  <div class="page">
    <SiteHeader :version="release?.version" />

    <main>
      <section class="hero">
        <div class="hero-intro">
          <h1>{{ t('hero.title') }}</h1>
          <p class="lede">{{ t('hero.lede') }}</p>
        </div>

        <div class="hero-film">
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
        </div>

        <div class="hero-get">
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

            <a class="download-row" :href="selectedAsset ? `/download/${platform}` : RELEASES_URL" :target="selectedAsset ? undefined : '_blank'" :rel="selectedAsset ? 'nofollow' : 'noreferrer'" role="tabpanel">
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
            <a class="release-all" :href="release?.pageUrl ?? RELEASES_URL" target="_blank" rel="noreferrer">{{ t('downloads.allReleases') }}</a>
          </p>
          <p class="release-line release-line-web">
            <a :href="WEB_APP_URL" target="_blank" rel="noreferrer">{{ t('downloads.web') }}</a>
          </p>
        </div>
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
      </section>

      <section class="use-cases" aria-labelledby="use-cases-title">
        <h2 id="use-cases-title" class="kicker">{{ t('whoFor.title') }}</h2>
        <div class="feature-grid use-case-grid">
          <article v-for="item in useCases" :key="item.title" class="feature">
            <UIcon class="feature-icon" :name="item.icon" />
            <h3>{{ item.title }}</h3>
            <p>{{ item.text }}</p>
          </article>
        </div>
      </section>

      <section class="questions" aria-labelledby="questions-title">
        <h2 id="questions-title" class="kicker">{{ t('faq.title') }}</h2>
        <div class="faq-list">
          <article v-for="item in faq" :key="item.key" class="faq-item">
            <h3>{{ item.question }}</h3>
            <p v-if="item.key === 'windows'">
              <i18n-t keypath="faq.items.windows.answer" scope="global">
                <template #sourceCode><a href="https://github.com/evb0110/evb-player" target="_blank" rel="noreferrer">{{ t('faq.links.sourceCode') }}</a></template>
              </i18n-t>
            </p>
            <p v-else-if="item.key === 'browser'">
              <i18n-t keypath="faq.items.browser.answer" scope="global">
                <template #browserUrl><a :href="WEB_APP_URL" target="_blank" rel="noreferrer">{{ t('faq.links.browserUrl') }}</a></template>
              </i18n-t>
            </p>
            <p v-else>{{ item.answer }}</p>
          </article>
        </div>
      </section>
    </main>

    <SiteFooter />
  </div>
</template>

<script setup lang="ts">
import { detectPlatform } from '#shared/platform';
import { RELEASES_URL, type ILatestRelease, type TPlatform } from '#shared/release';
import { LOCALE_OPTIONS } from '../../../shared/i18n/locales';
import { useTheme } from '../composables/useTheme';

const WEB_APP_URL = 'https://evb-player-web.vercel.app';
// Bump after re-rendering social cards; Telegram and Facebook cache images by URL.
const SOCIAL_CARD_VERSION = 3;
const SOCIAL_CARD_SIZE = { width: 1200, height: 630, type: 'image/jpeg' } as const;
const MIT_LICENSE_URL = 'https://opensource.org/license/mit/';
const GITHUB_REPOSITORY_URL = 'https://github.com/evb0110/evb-player';

interface IPlatformOption {
  id: TPlatform;
  icon: string;
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
  { key: 'order', icon: 'i-lucide-list-ordered' },
  { key: 'window', icon: 'i-lucide-expand' },
];

const useCaseIcons = [
  { key: 'courses', icon: 'i-lucide-graduation-cap' },
  { key: 'lectures', icon: 'i-lucide-presentation' },
  { key: 'audiobooks', icon: 'i-lucide-book-headphones' },
  { key: 'languagePractice', icon: 'i-lucide-languages' },
];

const { t, locale } = useI18n();
const localePath = useLocalePath();
const { data: release } = await useFetch<ILatestRelease | null>('/api/release', { default: () => null });

// The server picks the visitor's platform, so the first render already shows the right download and
// hydration keeps it. The browser only computes it itself when there was no server render.
const requestHeaders = useRequestHeaders(['user-agent', 'sec-ch-ua-platform']);
const platform = useState<TPlatform>('download-platform', () => import.meta.server
  ? detectPlatform(requestHeaders['user-agent'], requestHeaders['sec-ch-ua-platform'])
  : detectPlatform(navigator.userAgent, (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform));
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
const useCases = computed(() => useCaseIcons.map(({ key, icon }) => ({
  icon,
  title: t(`whoFor.items.${key}.title`),
  text: t(`whoFor.items.${key}.text`),
})));
const faqKeys = ['free', 'files', 'order', 'formats', 'windows', 'browser', 'updates'] as const;
const faq = computed(() => faqKeys.map((key) => ({
  key,
  question: t(`faq.items.${key}.question`),
  answer: key === 'windows'
    ? t(`faq.items.${key}.answer`, { sourceCode: t('faq.links.sourceCode') })
    : key === 'browser'
      ? t(`faq.items.${key}.answer`, { browserUrl: t('faq.links.browserUrl') })
      : t(`faq.items.${key}.answer`),
})));
const { theme: resolvedTheme } = useTheme();

function formatSize(bytes: number) {
  return new Intl.NumberFormat(locale.value, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 0 }).format(bytes / 1024 ** 2);
}

const siteUrl = useRuntimeConfig().public.siteUrl;
const pageUrl = computed(() => new URL(localePath('/'), siteUrl).toString());
const socialCardUrl = computed(() => new URL(`/social/${locale.value}.jpg?v=${SOCIAL_CARD_VERSION}`, siteUrl).toString());
const schemaGraph = computed(() => {
  const downloadUrls = Object.values(release.value?.assets ?? {}).flatMap((asset) => asset ? [asset.url] : []);
  if (!downloadUrls.length && release.value?.pageUrl) {
    downloadUrls.push(release.value.pageUrl);
  }
  const description = t('seo.description');

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': new URL('/#website', siteUrl).toString(),
        url: siteUrl,
        name: 'EVB Player',
        description,
        inLanguage: LOCALE_OPTIONS.find((option) => option.code === locale.value)?.language ?? locale.value,
      },
      {
        '@type': 'SoftwareApplication',
        '@id': new URL('/#software', siteUrl).toString(),
        name: 'EVB Player',
        description,
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'macOS, Windows, Linux',
        softwareVersion: release.value?.version,
        downloadUrl: downloadUrls,
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
        license: MIT_LICENSE_URL,
        url: pageUrl.value,
        image: socialCardUrl.value,
        screenshot: socialCardUrl.value,
        author: { '@id': new URL('/#person', siteUrl).toString() },
        sameAs: [GITHUB_REPOSITORY_URL],
      },
      {
        '@type': 'Person',
        '@id': new URL('/#person', siteUrl).toString(),
        name: 'Eugene Barsky',
        url: 'https://evb-stack.com',
        sameAs: ['https://github.com/evb0110'],
      },
      {
        '@type': 'FAQPage',
        inLanguage: LOCALE_OPTIONS.find((option) => option.code === locale.value)?.language ?? locale.value,
        mainEntity: faq.value.map(({ question, answer }) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      },
    ],
  };
});

useSeoMeta({
  title: () => t('seo.title'),
  description: () => t('seo.description'),
  ogTitle: () => t('seo.ogTitle'),
  ogDescription: () => t('seo.ogDescription'),
  ogSiteName: 'EVB Player',
  ogType: 'website',
  ogImage: () => socialCardUrl.value,
  ogImageSecureUrl: () => socialCardUrl.value,
  ogImageWidth: SOCIAL_CARD_SIZE.width,
  ogImageHeight: SOCIAL_CARD_SIZE.height,
  ogImageType: SOCIAL_CARD_SIZE.type,
  ogImageAlt: () => t('seo.ogImageAlt'),
  twitterCard: 'summary_large_image',
  twitterTitle: () => t('seo.ogTitle'),
  twitterDescription: () => t('seo.ogDescription'),
  twitterImage: () => socialCardUrl.value,
  twitterImageAlt: () => t('seo.ogImageAlt'),
  robots: 'index, follow',
});

useHead(() => ({
  script: [{
    id: 'structured-data',
    type: 'application/ld+json',
    innerHTML: JSON.stringify(schemaGraph.value).replace(/</gu, '\\u003c'),
  }],
}));
</script>

<style scoped>
.page {
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 28px;
}

/* The film sits beside the copy on wide screens, so the whole recording is visible without scrolling. */
.hero {
  display: grid;
  /* The film's height is about 0.73 of its width; its column stops growing before it would pass the fold. */
  grid-template-columns: minmax(300px, 400px) minmax(0, calc((100vh - 150px) * 1.37));
  justify-content: center;
  grid-template-areas:
    "intro film"
    "get film";
  grid-template-rows: auto 1fr;
  gap: 28px 56px;
  padding: 44px 0 40px;
}

.hero-intro {
  grid-area: intro;
}

.hero-film {
  grid-area: film;
  min-width: 0;
}

.hero-get {
  grid-area: get;
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
  margin: 0;
  font-size: clamp(36px, 3.7vw, 50px);
  font-weight: 650;
  line-height: 1.04;
  letter-spacing: -0.035em;
  text-wrap: balance;
}

.lede {
  margin: 18px 0 0;
  color: var(--ink-muted);
  font-size: 17px;
  line-height: 1.55;
}

.downloads {
  width: 100%;
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
  margin: 10px 4px 0;
  color: var(--ink-subtle);
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
}

.release-line {
  margin: 16px 4px 0;
  line-height: 1.6;
  color: var(--ink-subtle);
  font-family: var(--mono);
  font-size: 12px;
}

.release-line a {
  color: var(--accent-ink);
}

.release-line-web {
  margin-top: 6px;
}

.release-all {
  white-space: nowrap;
}

.demo-caption {
  margin: 10px 0 0;
  color: var(--ink-subtle);
  font-size: 13px;
  text-align: center;
}

.features {
  padding: 64px 0 72px;
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

.use-cases {
  padding: 0 0 56px;
  text-align: center;
}

.use-case-grid {
  grid-template-columns: repeat(4, 1fr);
}

.questions {
  padding: 24px 0 72px;
  text-align: center;
}

.faq-list {
  max-width: 850px;
  margin: 30px auto 0;
  text-align: left;
}

.faq-item {
  padding: 20px 0;
  border-bottom: 1px solid var(--line);
}

.faq-item h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
}

.faq-item p {
  margin: 8px 0 0;
  color: var(--ink-muted);
  font-size: 15px;
  line-height: 1.6;
}

.faq-item a {
  color: var(--accent-ink);
}

@media (max-width: 1023px) {
  .hero {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "intro"
      "film"
      "get";
    grid-template-rows: none;
  }

  .hero-get {
    width: min(100%, 460px);
  }
}

@media (max-width: 860px) {
  .feature-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 1100px) {
  .use-case-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 580px) {
  .page {
    padding: 0 18px;
  }

  .hero {
    padding-top: 32px;
  }

  .feature-grid {
    grid-template-columns: 1fr;
  }

  .use-case-grid {
    grid-template-columns: 1fr;
  }

  .download-row {
    padding: 14px;
  }
}
</style>
