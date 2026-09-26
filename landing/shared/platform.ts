import type { TPlatform } from './release';

/**
 * The visitor's desktop platform, from the Sec-CH-UA-Platform client hint that Chromium browsers send
 * with every request, else from the user agent, which every browser sends. Phones and unknown agents
 * get macOS.
 */
export function detectPlatform(userAgent = '', platformHint = ''): TPlatform {
  const hint = platformHint.replace(/"/gu, '').toLowerCase();
  if (hint === 'windows') return 'win';
  if (hint === 'linux' || hint === 'chrome os') return 'linux';
  if (hint) return 'mac';
  if (/windows/iu.test(userAgent)) return 'win';
  if (/linux|cros/iu.test(userAgent) && !/android/iu.test(userAgent)) return 'linux';
  return 'mac';
}
