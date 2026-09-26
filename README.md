# EVB Player

EVB Player plays video and audio courses stored in local folders. Point it at a folder and it builds a playlist from the numbered files inside, remembers where you stopped in every lesson, and keeps several courses open in tabs. Nothing is uploaded; the app works offline.

Downloads for macOS (Apple Silicon), Windows 10 and 11 (x64), and Ubuntu (x64 `.deb`) are on [evb-player.vercel.app](https://evb-player.vercel.app) and on the [releases page](https://github.com/evb0110/evb-player/releases/latest). Installed apps update themselves from new releases.

## Features

- Folders are scanned recursively. Lessons are sorted by numeric filename prefixes such as `0001.` or `12 -`, and subfolders become playlist sections.
- Durations are read from the files' own headers when a folder is opened, so course totals are known before anything is played.
- Video and audio play in the app: MP4, M4V, MOV, MKV, WebM, MP3, M4A, AAC, FLAC, WAV, Ogg and Opus. Files the built-in player can't decode, such as AVI or WMV, open in the system's default media app.
- The player has play/pause, ten-second skip, seeking, volume, playback speed, theater mode, full window and fullscreen. Volume and speed are remembered.
- Playback position is saved as you watch. Ended lessons are marked complete and the next one starts.
- Mark any lesson complete without watching it by clicking its number in the playlist; click the check again to undo. Lessons with saved progress show a reset button, and a course menu resets the whole course.
- Several courses can be open in tabs. Recent folders and the last opened course are restored on launch. The Library tab lists your courses; Add course opens another folder.
- Switching to the Library keeps the current lesson playing, with a compact player to pause or return.
- Show in folder reveals a course in Finder, Explorer or the Linux file manager.

### Keyboard shortcuts

- `Space` or `K`: play/pause; `J`/`L`: seek 10 seconds; `←`/`→`: seek 5 seconds.
- `↑`/`↓`: volume; `M`: mute; `F`: fullscreen; `T`: theater mode; `W`: full window (`Esc` also exits).
- `0`–`9`, `Home`, `End`: seek; `Shift+N`/`Shift+P`: next/previous lesson.
- `<`/`>`: playback speed; `,`/`.`: frame step while paused.

## Where data is kept

Progress and the course list are stored in `evb-player-state.json` in the app's data folder:

- macOS: `~/Library/Application Support/EVB Player/`
- Windows: `%APPDATA%\EVB Player\`
- Linux: `~/.config/EVB Player/`

Media files are never modified. Version 0.2.0 renamed the app from Course Shelf; on first launch it picks up Course Shelf's saved progress.

## Development

```bash
pnpm install
pnpm dev
```

`pnpm dev` and `pnpm start` run as "EVB Player Dev" with their own data folder, so they run alongside the installed app without sharing its progress. `fixtures/sample-course` is a small generated course with one file per supported format.

`pnpm package:mac`, `pnpm package:win` and `pnpm package:linux` build installers into `release/`. The macOS build signs with a Developer ID identity from the keychain when one is available and notarizes when `APPLE_API_KEY`, `APPLE_API_KEY_ID` and `APPLE_API_ISSUER` are set.

Icons are bundled into the app, so the interface is complete offline. `pnpm build` runs `pnpm check:icons`, which fails when an icon name is assembled at runtime, does not exist in the installed icon set, or is missing from the bundle; write every icon name as a full literal such as `'i-lucide-play'`.

The main process owns the local media protocol and the progress file. The renderer never receives Node.js access or arbitrary filesystem APIs.

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
