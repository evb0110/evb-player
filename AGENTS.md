# EVB Player agent rules

These rules apply to every agent working in this repository, alongside the user's global rules.

## Runs are invisible unless the user asks

Agent-owned runs of the app never show a window, take focus, or put an icon in the Dock on the user's machines. A visible run needs the user's explicit request for that run.

- macOS: start every Electron run, source or packaged, through `scripts/hidden-launch.mjs`, with a task-owned `--user-data-dir` under `.devkit/`. It launches an APFS clone with `LSUIElement` set and its window hidden. Never launch `/Applications/EVB Player.app`, a downloaded bundle, the stock `node_modules` Electron, or `open -a` directly. A hidden copy can't prove the original signature, Gatekeeper, Dock activation, or installing an update (its ad hoc seal fails Squirrel's check); leave those to CI or a visible run the user asked for.
- Linux: run Electron inside `scripts/with-nested-display.sh`, a private nested KWin session with its own config directory, never in the user's desktop session. It gives a 3840x2400 screen at scale 1; pass `--force-device-scale-factor=2` for sharp screenshots.
- Windows: use the BGK Windows VM as described in `~/fleet-hosts.md`.
- Browsers: headless Playwright with the installed Chrome channel.

## Data and fixtures

- Never use the installed app, the user's data folder, or the user's media for tests. Seed task-owned profiles; generate test media with ffmpeg (`fixtures/sample-media`, `landing/recorder/demo-media.mjs`). Real course media must never enter git history or the landing.
- On macOS the updater caches `~/Library/Caches/evb-player-updater` and `~/Library/Caches/com.evb.player.ShipIt` are shared with the installed app. Remove only what your run created.
- The progress file format must stay readable across versions, downgrades included. Don't rename or drop its keys without keeping the old ones readable.

## Wording

The product never says "course", in the UI, the landing, the docs, or code names. It plays folders of video and audio.
