# EVB Player landing

The site at [evb-player.vercel.app](https://evb-player.vercel.app): downloads for the latest release and a film of the app. It is a separate Nuxt app with its own dependencies; Vercel builds it from this folder.

```bash
pnpm install
pnpm dev
```

The download panel reads the latest GitHub release through `server/api/release.get.ts`. Vercel regenerates the page at most every ten minutes, so a new release shows up without a redeploy.

## Films

The film is recorded from the real app, not drawn by hand. `recorder/` drives the app with Playwright, captures each state as SVG with dom-to-svg, and writes the states to `public/films/<film>/` and a manifest to `app/films/manifests/<film>.json`. `app/films/RealFilm.tsx` plays them with Remotion, adding the pointer, clicks and camera moves.

To record again after the app's interface changes:

```bash
pnpm --dir .. build            # the app's renderer and main process
pnpm films:demo                # generated demo folders in ../.devkit/films
pnpm films:record player       # records flows/player.mjs
```

The demo folders are generated slides and tones, so no real media is ever recorded. The app runs from source with a hidden window and its own profile. On macOS, set `FILM_ELECTRON` to an Electron binary whose app bundle sets `LSUIElement`, so no Dock icon appears while recording. On Linux a hidden Wayland window gets no frames, so record inside a nested compositor such as `kwin_wayland --virtual` with `FILM_SHOW_WINDOW=1`, which keeps the window off your desktop.
