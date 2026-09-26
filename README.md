# EVB Player

EVB Player plays folders of video and audio files stored on your computer. Point it at a folder and it builds a playlist from the numbered files inside, remembers where you stopped in every file, and keeps several folders open in tabs. Nothing is uploaded; the app works offline.

Downloads for macOS (Apple Silicon), Windows 10 and 11 (x64), and Ubuntu (x64 `.deb`) are on [evb-player.vercel.app](https://evb-player.vercel.app) and on the [releases page](https://github.com/evb0110/evb-player/releases/latest). Installed apps update themselves from new releases.

## Browser version

The browser version uses the same player interface for folders, playlists, playback progress, theme and language settings, theater mode, and fullscreen. It scans a selected folder recursively and plays media formats supported by the visitor's browser. AVI, WMV, and FLV files cannot be played in the browser. Use the desktop app to play those in the system media app, reveal folders in the file manager, or receive app updates.

Chrome and Edge can save folder handles. When access is still granted, the last folder opens on launch; otherwise it stays in the Library and one click can restore permission. Firefox and Safari use a folder file chooser, so a recent folder asks you to choose it again when opened. Progress resumes for a folder with the same name in those browsers.

The browser stores the Library and lesson progress in local storage under `evb-player-web-state`, and language and skipped update version under `evb-player-web-settings`. The theme toggle follows the browser's system preference until you choose light or dark. An explicit choice is stored for one year in the `theme` cookie; `CH-prefers-color-scheme` records the current system preference so the server can render the correct theme. Both cookies use `SameSite=Lax`, path `/`, and `Secure` on HTTPS. Media stays in the browser and is not uploaded.

Run the browser version with `pnpm dev:web`. `pnpm build:web` creates a Nitro Vercel Build Output API build in `.vercel/output`; the server renders the HTML shell from those cookies. The desktop `pnpm build` remains a static renderer build for the Electron custom protocol.

## Features

- Folders are scanned recursively. Lessons are sorted by numeric filename prefixes such as `0001.` or `12 -`, and subfolders become playlist sections.
- Durations are read from the files' own headers when a folder is opened, so a folder's total length is known before anything is played.
- Video and audio play in the app: MP4, M4V, MOV, MKV, WebM, MP3, M4A, AAC, FLAC, WAV, Ogg and Opus. Files the built-in player can't decode, such as AVI or WMV, open in the system's default media app.
- The player has play/pause, ten-second skip, seeking, volume, playback speed, theater mode, full window and fullscreen. Volume and speed are remembered.
- Playback position is saved as you watch. Ended lessons are marked complete and the next one starts.
- Mark any lesson complete without watching it by clicking its number in the playlist; click the check again to undo. Lessons with saved progress show a reset button, and the folder menu resets the whole folder.
- Several folders can be open in tabs. Recent folders and the last opened folder are restored on launch. The Library tab lists your folders; Add folder opens another one.
- The application menu includes Add Folder, text editing commands, fullscreen, help, and an About panel. On Windows and Linux, press `Alt` to show the menu; on macOS it appears in the system menu bar. Help includes the keyboard shortcuts and EVB Player website.
- Use the animated theme toggle to switch between light and dark. Until you choose a theme, the app follows the operating system. Switch the interface among English, Russian, French, German, Spanish, Italian, Portuguese, Brazilian Portuguese and Dutch from the language menu.
- Switching to the Library keeps the current lesson playing, with a compact player to pause or return.
- Show in folder reveals a folder in Finder, Explorer or the Linux file manager.

### Keyboard shortcuts

- `Space` or `K`: play/pause; `J`/`L`: seek 10 seconds; `←`/`→`: seek 5 seconds.
- `↑`/`↓`: volume; `M`: mute; `F`: fullscreen; `T`: theater mode, or the playlist beside the video in full window and fullscreen; `W`: full window (`Esc` also exits).
- `0`–`9`, `Home`, `End`: seek; `Shift+N`/`Shift+P`: next/previous lesson.
- `<`/`>`: playback speed; `,`/`.`: frame step while paused.

## Where data is kept

Progress and the folder list are stored in `evb-player-state.json` in the app's data folder:

- macOS: `~/Library/Application Support/EVB Player/`
- Windows: `%APPDATA%\EVB Player\`
- Linux: `~/.config/EVB Player/`

Theme, language, and the skipped update version are stored separately in `evb-player-settings.json` in the same folder. Its optional `theme` field is `light` or `dark`; when absent, the app follows the operating system. Old `system` values are treated as absent. The other fields are `locale` and `skippedUpdateVersion`; the last field is `null` until a version is skipped, then stores that version string. When no language is saved, the app chooses the closest supported system language or English.

The About panel shows EVB Player, its current version, and the translated copyright line. On macOS and Windows it lists `evb-stack.com`; on Linux it lists Eugene Barsky and links to [evb-stack.com](https://evb-stack.com).

Packaged desktop builds check for updates shortly after launch and every six hours. When an update is found, choose Download to fetch it in the background. The dialog can be closed while it downloads. Once ready, choose Restart Now to install, or Later to wait. Linux shows a note that installation asks for your password. Skip This Version stores that version in the settings file; a later, newer version is offered normally. Check for Updates in Help performs an immediate check and reports when the app is current or the check fails. The browser version does not offer updates.

Media files are never modified. If the progress file can't be read, for example after an older version wrote it in another format, it is kept as `evb-player-state.json.unreadable-<time>` before a new one replaces it.

## Development

```bash
pnpm install
pnpm dev
```

`pnpm dev` and `pnpm start` run as "EVB Player Dev" with their own data folder, so they run alongside the installed app without sharing its progress. `fixtures/sample-media` is a small generated folder with one file per supported format.

`pnpm package:mac`, `pnpm package:win` and `pnpm package:linux` build installers into `release/`. The macOS build signs with a Developer ID identity from the keychain when one is available and notarizes when `APPLE_API_KEY`, `APPLE_API_KEY_ID` and `APPLE_API_ISSUER` are set.

Icons are bundled into the app, so the interface is complete offline. `pnpm build` runs `pnpm check:icons`, which fails when an icon name is assembled at runtime, does not exist in the installed icon set, or is missing from the bundle; write every icon name as a full literal such as `'i-lucide-play'`.

The main process owns the local media protocol and the progress file. The renderer never receives Node.js access or arbitrary filesystem APIs.

## Landing page

`landing/` is the site at [evb-player.vercel.app](https://evb-player.vercel.app), a separate Nuxt app with a film recorded from the real app. See [landing/README.md](landing/README.md).

## Releases

Bump `version` in `package.json`, commit, then push a matching tag:

```bash
git tag v0.2.1
git push origin v0.2.1
```

The Release workflow builds the signed and notarized macOS DMG and ZIP, the Windows installer and the Ubuntu `.deb`, uploads them with their update metadata to a draft release, and publishes it once all three platforms succeed. Running the workflow by hand builds the same files as workflow artifacts without publishing anything.

The Windows installer is not code-signed, so Windows SmartScreen asks for confirmation on first install.

## License

[MIT](LICENSE)

Copyright © 2026 Eugene Barsky · [evb-stack.com](https://evb-stack.com)
