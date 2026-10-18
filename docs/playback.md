# Desktop playback

Desktop playback uses libmpv rather than Chromium's HTML media decoders. The browser build retains native browser media elements. The controls share a small media interface; the existing progress file and identifiers are unchanged.

## Why the engine changed

A reported 1080p H.264/AAC MP4 stuttered in EVB Player and macOS Preview but played normally in IINA. Inspection found B-frames, equal packet presentation and decoding timestamps, and no MP4 composition-time (`ctts`) table. Its sequence header advertised only one reorder frame. Enabling software decoding in Chromium did not resolve the cadence issue. Both Chromium decoders reported zero dropped frames while presenting irregular image intervals, so that counter alone was inadequate.

H.264 B-frames require presentation order to differ from decode order. FFmpeg explicitly cautions against assigning PTS equal to DTS when B-frames are involved: [setts documentation](https://ffmpeg.org/ffmpeg-bitstream-filters.html#setts). Chromium's [H.264 decoder](https://github.com/chromium/chromium/blob/main/media/gpu/h264_decoder.cc) uses the sequence header's reorder bound and diagnoses out-of-order output as a broken stream.

IINA delegates decoding and synchronization to libmpv: [MPVController.swift](https://github.com/iina/iina/blob/5c15f815/iina/MPVController.swift). mpv includes timestamp-correction behavior beyond a simple codec switch: [mpv manual](https://mpv.io/manual/stable/#options-correct-pts). Using that engine addresses a class of timing and format compatibility problems without a per-file rewrite or transcoding cache. This does not imply identical codec availability across every operating system and libmpv build.

## Integration

- `vendor/electron-mpv-video` contains the MIT-licensed Node-API and rendering bridge, pinned to upstream commit `4944079b4133715848ea3c3bdaf99742b8c68406`, with local adaptations recorded in `THIRD_PARTY_NOTICES.md`.
- `electron/main.ts` attaches it to the trusted main window. Opening a source must pass the same canonical-path and Library-root authorization as the media protocol. Arbitrary filesystem paths and network URLs are rejected. mpv configuration, scripts, online extractors, external references, and automatic neighboring-file loading are disabled.
- `app/plugins/native-media.client.ts` adapts native playback events and methods to the existing controls. libmpv owns the audio clock, frame scheduling, demuxing, decoding, and timing recovery.
- macOS and Windows can transfer GPU surfaces through Electron's [sharedTexture API](https://www.electronjs.org/docs/latest/api/shared-texture). When unavailable, the bridge uses libmpv's software rendering API and a WebGL or Canvas surface. Linux currently uses that software rendering path.
- A render context is destroyed with its own graphics context current, as required by [libmpv's rendering API](https://github.com/mpv-player/mpv/blob/master/libmpv/render.h). Window ownership is captured before destruction so closing the window cannot strand native sessions.
- Main-frame navigation and renderer termination release that renderer's sessions. Repeated reloads must not retain audio players or exhaust the session limit.
- Playback commands and property changes use libmpv's asynchronous APIs, which are explicitly safe on its render thread. Calling the synchronous APIs on Electron's rendering thread could stall initialization until mpv's internal deadlock timeout. `video-timing-offset=0` lets mpv schedule frame callbacks at presentation time without holding Electron's main thread ahead of the audio clock.
- `scripts/build-native.mjs` compiles the bridge and stages its runtime dependencies outside the app archive. macOS library install names and Linux rpaths resolve to that private directory. Release CI signs and notarizes the complete macOS bundle.

## Regression evidence

`scripts/test-playback.mjs` synthesizes H.264 with B-frames and deliberately broken `PTS=DTS`. Each decoded image has increasing luminance, allowing the test to detect backwards displayed images rather than merely checking that playback time advances. It also checks exact seeking, speed changes, common non-browser codecs, audio, the native source boundary, and the unchanged progress format.

Automated fixtures use mpv's null audio output, while retaining audio decoding and clocking. They neither require a hosted sound device nor play test tones on the user's desktop; physical audio-output quality is not measured by this suite.

Real user media remains outside the repository. All automation uses generated fixtures or explicitly supplied media read-only, task-owned profiles, and hidden app copies.

The same generated timing sample, played through Chromium for comparison with `EVB_PLAYER_TEST_ENGINE=chromium pnpm test:playback`, produced 13 backwards image transitions and failed the ordering assertion. The libmpv path produced none. This comparison measures displayed image order, independently of decoder drop counters.
