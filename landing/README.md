# EVB Player landing

The site at [evb-player.vercel.app](https://evb-player.vercel.app): downloads for the latest release and a film of the app. It is a separate Nuxt app with its own dependencies; Vercel builds it from this folder.

```bash
pnpm install
pnpm dev
```

The download panel reads the latest GitHub release through `server/api/release.get.ts`, which caches release data for ten minutes.

The animated theme toggle follows the browser's system preference until you choose light or dark. An explicit choice is stored for one year in the `theme` cookie. `CH-prefers-color-scheme` stores the current system preference so the server can render the right theme on the first page response. Both cookies use `SameSite=Lax`, path `/`, and `Secure` on HTTPS. A small head script updates a missing or stale preference cookie and reloads once if the page was rendered in the other theme; later system changes update the page without a reload.

## Search and link previews

Each locale page renders its title, description, canonical URL, hreflang links, Open Graph and Twitter tags on the server. Share previews use dark 1200×630 JPEG cards in `public/social/`; each card combines the app icon, that locale's short description, and a cropped frame from its dark player film. The cards are kept under 150 KB for messaging apps.

After updating the recorded films or the share text, render the cards from this directory with headless Chrome:

```bash
node recorder/social-cards.mjs
node recorder/social-cards.mjs --locale ru
```

Telegram and Facebook cache images by URL. The initial cards use version 1; whenever published cards are re-rendered, increment `SOCIAL_CARD_VERSION` in `app/pages/index.vue` so shared links use a fresh image URL. `robots.txt` points crawlers to the generated `sitemap.xml`. Root requests from link-preview and search crawlers keep the English page even if they send a different language or an old locale cookie; browser language selection remains enabled.

## Films

The film is recorded from the real app, not drawn by hand. `recorder/` drives the app with Playwright, captures each state as SVG with dom-to-svg, and writes each locale/theme variant to `public/films/<film>/<locale>-<theme>/` with a manifest at `app/films/manifests/<film>.<locale>.<theme>.json`. `app/films/RealFilm.tsx` plays the selected recording with Remotion, adding the pointer, clicks and camera moves. The player loads only the selected manifest; when a recording is missing, it tries English in the same theme and then English dark.

To record again after the app's interface changes:

```bash
pnpm --dir .. build            # the app's renderer and main process
pnpm films:demo                # generated demo folders in ../.devkit/films
node recorder/record.mjs player                         # all nine locales in light and dark
node recorder/record.mjs player --locale ru             # one locale, both themes
node recorder/record.mjs player --theme dark            # all locales in one theme
node recorder/record.mjs player --locale pt-BR --theme light
```

The recorder writes `evb-player-settings.json` (`{"theme":"light|dark","locale":"<code>"}`) into each isolated app profile before launch. The demo folders are generated slides and tones, so no real media is ever recorded. The recorder starts Electron through `scripts/hidden-launch.mjs`, so on macOS no window or Dock icon appears. On Linux a hidden Wayland window gets no frames, so record inside the private nested session with `FILM_SHOW_WINDOW=1`: `../scripts/with-nested-display.sh ../.devkit/films env FILM_SHOW_WINDOW=1 node recorder/record.mjs player`. The recorder renders at two device pixels per CSS pixel and stops with an error unless the window is exactly the film's size (1280x800), since a smaller window leaves blank strips in the film.
