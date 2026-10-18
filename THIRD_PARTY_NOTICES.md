# Playback components

EVB Player's desktop playback uses [mpv/libmpv](https://github.com/mpv-player/mpv), the playback engine also used by IINA, and its FFmpeg dependencies. The browser version uses the browser's media engine.

The native rendering bridge in `vendor/electron-mpv-video` is adapted from [electron-mpv-video](https://github.com/yscoder/electron-mpv-video/tree/4944079b4133715848ea3c3bdaf99742b8c68406), copyright 2026 electron-mpv-video contributors, under its included MIT license. EVB Player adds source authorization, playback-rate control, media events, packaging, and Linux support.

libmpv is distributed under GPL-2.0-or-later by default; some builds use LGPL-2.1-or-later. Its linked FFmpeg and codec libraries retain their own licenses. The bundled desktop distribution, including these components, is available under the applicable GPL terms. EVB Player's own source remains available under MIT, a GPL-compatible license. No IINA source code is incorporated.

Corresponding source and build instructions:

- EVB Player and bridge modifications: <https://github.com/evb0110/evb-player>
- mpv: <https://github.com/mpv-player/mpv>, license <https://github.com/mpv-player/mpv/blob/master/Copyright>
- FFmpeg: <https://ffmpeg.org/download.html>, license <https://ffmpeg.org/legal.html>
- macOS dependency recipes: <https://github.com/Homebrew/homebrew-core>
- Windows runtime and build recipes: <https://github.com/zhongfly/mpv-winbuild>, <https://github.com/shinchiro/mpv-winbuild-cmake>
- Ubuntu dependency sources: <https://packages.ubuntu.com/jammy/libmpv-dev>
