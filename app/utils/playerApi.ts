import type {IPlayerApi} from '../../shared/types';

let browserPlayerApiPromise: Promise<IPlayerApi> | null = null;

export function getPlayerApi() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('The player platform is only available in the browser.'));
  }
  if (window.evbPlayer) {
    return Promise.resolve(window.evbPlayer);
  }
  browserPlayerApiPromise ??= import('../platform/browserPlayerApi').then(({browserPlayerApi}) => browserPlayerApi);
  return browserPlayerApiPromise;
}
