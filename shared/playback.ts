// The controls use this common surface for native desktop and browser playback.
export interface IPlaybackMedia extends HTMLElement {
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  volume: number;
  muted: boolean;
  playbackRate: number;
  load(): void;
  play(): Promise<void>;
  pause(): void;
}
