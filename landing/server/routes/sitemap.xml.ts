import { LOCALE_OPTIONS } from '../../../shared/i18n/locales';

function escapeXml(value: string) {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&apos;');
}

export default defineEventHandler((event) => {
  const siteUrl = useRuntimeConfig(event).public.siteUrl;
  const urls = ['', '/privacy'].map((path) => {
    const localizedPages = LOCALE_OPTIONS.map(({ code, language }) => ({
      language,
      url: new URL(code === 'en' ? path || '/' : `/${code}${path}`, siteUrl).toString(),
    }));
    const defaultUrl = new URL(path || '/', siteUrl).toString();

    return localizedPages.map(({ url }) => {
      const alternates = [
        ...localizedPages.map(({ language, url: alternateUrl }) => `    <xhtml:link rel="alternate" hreflang="${escapeXml(language)}" href="${escapeXml(alternateUrl)}" />`),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(defaultUrl ?? '')}" />`,
      ].join('\n');
      return `  <url>\n    <loc>${escapeXml(url)}</loc>\n${alternates}\n  </url>`;
    });
  }).flat().join('\n');

  setHeader(event, 'Content-Type', 'application/xml; charset=utf-8');
  setHeader(event, 'Cache-Control', 'public, max-age=3600, s-maxage=3600');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>`;
});
