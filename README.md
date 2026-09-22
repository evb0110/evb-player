# Course Shelf

Course Shelf is a private macOS Electron prototype for watching or listening to media stored in local folders. It borrows the calm course-and-playlist shape of course platforms without trying to become a hosted service.

## Run it

```bash
pnpm install
pnpm dev
```

The first launch opens a library screen. Choose a folder containing videos or audio files. The app reads numeric prefixes and filenames, probes media duration through macOS metadata, and builds a playlist.

For a production-like local run:

```bash
pnpm start
```

To build a macOS DMG:

```bash
pnpm package:mac
```

The local DMG is intentionally unsigned for this private, single-machine prototype.

## Current prototype behavior

- Videos and common audio formats are supported.
- The folder is scanned recursively and lessons are sorted by numeric filename prefixes such as `0001.`.
- The player supports play/pause, ten-second skip, seeking, volume, playback speed, and fullscreen for video.
- Playback position is saved while a lesson is watched.
- Lessons can be manually marked complete; ended lessons are completed automatically and advance to the next lesson when available.
- Progress can be reset for the current lesson or the entire course; reset removes saved positions and completion state without touching media files.
- Clicking a playlist row or the in-player previous/next buttons switches lessons and starts playback.
- Course tabs and recently opened folders are retained.
- Progress is stored in `~/Library/Application Support/Course Shelf/course-shelf-state.json`.

### Keyboard shortcuts

- `Space` or `K`: play/pause; `J`/`L`: seek 10 seconds; `←`/`→`: seek 5 seconds.
- `↑`/`↓`: volume; `M`: mute; `F`: fullscreen; `T`: theater mode.
- `0`–`9`, `Home`, `End`: seek; `Shift+N`/`Shift+P`: next/previous lesson.
- `<`/`>`: playback speed; `,`/`.`: frame step while paused.

The main process owns the local media protocol and progress file. The renderer never receives Node.js access or arbitrary filesystem APIs.
