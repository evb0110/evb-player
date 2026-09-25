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
- Volume and playback speed are remembered between launches. Theater mode expands the player; full window fills the app window with the player and hides the tabs and course panels, while the window's title bar stays; the keyboard button lists available shortcuts.
- Playback position is saved while a lesson is watched.
- Lessons can be manually marked complete; ended lessons are completed automatically and advance to the next lesson when available.
- Every playlist row has a reset-progress button, including tracks that are not selected. Resetting another track does not interrupt playback. Confirmed resets clear only saved positions and completion state, never media files; a separate button resets the entire course.
- Clicking a playlist row or the in-player previous/next buttons switches lessons and starts playback.
- Several courses can be open in tabs. Recent folders and the last opened course are restored on launch.
- Use the × beside a folder in the sidebar to remove it from the collection and close its tab. Media files and saved progress are kept; opening the folder again restores its progress.
- The Library tab shows recent courses with quick reopen and removal. Removal offers an Undo action. Add course in the Library heading opens a folder chooser to add another course.
- Switching to Library keeps the current lesson playing and advancing through the playlist. A compact player offers play/pause and a return to the course. Selecting another course switches the player; closing or removing the playing course stops it.
- Show in Finder is available in each Library card and the course heading, and reveals the course folder without changing playback.
- Missing or unsupported media shows an explanation, a retry button, and an option to open the file in the default media app. Opening another folder does not interrupt the active lesson unless the new course opens successfully.
- Progress is stored in `~/Library/Application Support/Course Shelf/course-shelf-state.json`.
- `pnpm dev` and `pnpm start` run as "Course Shelf Dev" with a separate profile in `~/Library/Application Support/Course Shelf Dev/`, so they run alongside the installed app without sharing its progress or settings.

### Keyboard shortcuts

- `Space` or `K`: play/pause; `J`/`L`: seek 10 seconds; `←`/`→`: seek 5 seconds.
- `↑`/`↓`: volume; `M`: mute; `F`: fullscreen; `T`: theater mode; `W`: full window (`Esc` also exits).
- `0`–`9`, `Home`, `End`: seek; `Shift+N`/`Shift+P`: next/previous lesson.
- `<`/`>`: playback speed; `,`/`.`: frame step while paused.

The main process owns the local media protocol and progress file. The renderer never receives Node.js access or arbitrary filesystem APIs.
