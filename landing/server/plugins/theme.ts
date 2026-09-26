import {CLIENT_HINT_CHECK_SCRIPT, COLOR_SCHEME_HINT_COOKIE, readCookieValue, resolveTheme, THEME_COOKIE} from '../../../shared/theme';

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
  });
});
