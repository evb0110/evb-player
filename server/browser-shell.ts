import {createHash} from 'node:crypto';
import {CLIENT_HINT_CHECK_SCRIPT, COLOR_SCHEME_HINT_COOKIE, readCookieValue, resolveTheme, THEME_COOKIE} from '../shared/theme';

interface IHtmlContext {
  htmlAttrs: string[];
  head: string[];
  bodyPrepend: string[];
  body: string[];
  bodyAppend: string[];
}

const inlineScriptPattern = /<script(?![^>]*\bsrc=)(?![^>]*\btype=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/gu;

function createContentSecurityPolicy(html: IHtmlContext) {
  const markup = [...html.head, ...html.bodyPrepend, ...html.body, ...html.bodyAppend].join('');
  const hashes = [...markup.matchAll(inlineScriptPattern)].map(([, body]) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`);
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    `script-src 'self' ${hashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
  ].join('; ');
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, {event}) => {
    const cookieHeader = event.node.req.headers.cookie;
    const theme = resolveTheme(
      readCookieValue(cookieHeader, THEME_COOKIE),
      readCookieValue(cookieHeader, COLOR_SCHEME_HINT_COOKIE),
    );
    html.htmlAttrs = html.htmlAttrs.filter((attribute) => !/^(?:class|style)=/u.test(attribute));
    html.htmlAttrs.push(`class="${theme}"`, `style="color-scheme: ${theme}"`);
    html.head.unshift(`<script>${CLIENT_HINT_CHECK_SCRIPT}</script>`);
    event.node.res.setHeader('Cache-Control', 'private, no-store');
    event.node.res.setHeader('Content-Security-Policy', createContentSecurityPolicy(html));
  });
});
