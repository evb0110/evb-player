import { RELEASES_URL, type ILatestRelease, type TPlatform } from '#shared/release';

const PLATFORMS = new Set<string>(['mac', 'win', 'linux']);

function referrerPath(referrer: string | undefined) {
  try {
    return referrer ? new URL(referrer).pathname : '/';
  } catch {
    return '/';
  }
}

/** Counts a download, then sends the browser to the platform's installer in the latest GitHub release. */
export default defineEventHandler(async (event) => {
  const platform = getRouterParam(event, 'platform') ?? '';
  if (!PLATFORMS.has(platform)) {
    throw createError({ statusCode: 404 });
  }
  const release = await $fetch<ILatestRelease | null>('/api/release');
  const asset = release?.assets[platform as TPlatform];
  if (asset) {
    await recordLandingEvent(event, {
      kind: 'download',
      platform: platform as TPlatform,
      version: release?.version,
      pagePath: referrerPath(getRequestHeader(event, 'referer')),
    });
  }
  setHeader(event, 'Cache-Control', 'private, no-store');
  return sendRedirect(event, asset?.url ?? RELEASES_URL, 302);
});
