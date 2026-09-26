export type TPlatform = 'mac' | 'win' | 'linux';

export interface IReleaseAsset {
  name: string;
  url: string;
  size: number;
}

export interface ILatestRelease {
  version: string;
  publishedAt: string;
  pageUrl: string;
  assets: Partial<Record<TPlatform, IReleaseAsset>>;
}

export const RELEASES_URL = 'https://github.com/evb0110/evb-player/releases';
