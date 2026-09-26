import { detectPlatform } from '#shared/platform';

// Counts views of the landing's home page in each language; other pages such as /privacy, crawlers,
// prefetches and error pages don't count.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', async (_html, { event }) => {
    const purpose = getRequestHeader(event, 'sec-purpose') ?? getRequestHeader(event, 'purpose') ?? '';
    const path = event.path.split('?')[0]!.replace(/\/$/u, '') || '/';
    const isHome = path === '/' || path === `/${localeForPath(path)}`;
    if (event.method !== 'GET' || event.node.res.statusCode !== 200 || purpose.includes('prefetch') || !isHome) {
      return;
    }
    await recordLandingEvent(event, {
      kind: 'view',
      platform: detectPlatform(getRequestHeader(event, 'user-agent'), getRequestHeader(event, 'sec-ch-ua-platform')),
      pagePath: event.path,
    });
  });
});
