import type { ILatestRelease, TPlatform } from '#shared/release';

interface IGithubRelease {
  tag_name: string;
  published_at: string;
  html_url: string;
  assets: Array<{ name: string; browser_download_url: string; size: number }>;
}

// Installer file names from electron-builder.yml, per platform.
const INSTALLERS: Record<TPlatform, RegExp> = {
  mac: /^EVB-Player-[\d.]+-arm64\.dmg$/,
  win: /^EVB-Player-[\d.]+-x64-setup\.exe$/,
  // electron-builder names the .deb with Debian's architecture, amd64.
  linux: /^EVB-Player-[\d.]+-amd64\.deb$/,
};

/** The latest published release and its three installers, or null before the first release. */
export default defineCachedEventHandler(async (): Promise<ILatestRelease | null> => {
  const release = await $fetch<IGithubRelease>('https://api.github.com/repos/evb0110/evb-player/releases/latest', {
    headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'evb-player-landing' },
    timeout: 8000,
  }).catch(() => null);
  if (!release) {
    return null;
  }
  const assets: ILatestRelease['assets'] = {};
  for (const [platform, pattern] of Object.entries(INSTALLERS) as Array<[TPlatform, RegExp]>) {
    const asset = release.assets.find((candidate) => pattern.test(candidate.name));
    if (asset) {
      assets[platform] = { name: asset.name, url: asset.browser_download_url, size: asset.size };
    }
  }
  return {
    version: release.tag_name.replace(/^v/, ''),
    publishedAt: release.published_at,
    pageUrl: release.html_url,
    assets,
  };
}, { name: 'latest-release', maxAge: 600, swr: true });
