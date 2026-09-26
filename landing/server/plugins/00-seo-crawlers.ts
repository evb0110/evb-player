// Link-preview and search crawlers get the English page at / instead of a locale redirect, which Telegram
// and others don't follow for previews.

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    const userAgent = event.node.req.headers['user-agent'] ?? '';
    const pathname = new URL(event.path, 'http://localhost').pathname;
    if (pathname !== '/' || !isCrawler(userAgent)) {
      return;
    }

    const cookies = (event.node.req.headers.cookie ?? '')
      .split(';')
      .map((cookie) => cookie.trim())
      .filter((cookie) => cookie && !/^i18n_locale=/iu.test(cookie));
    event.node.req.headers.cookie = cookies.length ? cookies.join('; ') : undefined;
    event.node.req.headers['accept-language'] = 'en-US,en;q=0.9';
  });
});
