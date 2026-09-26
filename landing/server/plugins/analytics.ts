import { detectPlatform } from '#shared/platform';

// Counts rendered landing pages. Crawlers, prefetches and error pages don't count.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', async (_html, { event }) => {
    const purpose = getRequestHeader(event, 'sec-purpose') ?? getRequestHeader(event, 'purpose') ?? '';
    if (event.method !== 'GET' || event.node.res.statusCode !== 200 || purpose.includes('prefetch')) {
      return;
    }
    await recordLandingEvent(event, {
      kind: 'view',
      platform: detectPlatform(getRequestHeader(event, 'user-agent'), getRequestHeader(event, 'sec-ch-ua-platform')),
      pagePath: event.path,
    });
  });
});
