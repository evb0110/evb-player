import {MpvVideoElement} from '../../vendor/electron-mpv-video/src/renderer/mpv-video';
import type {PlayerEvent} from '../../vendor/electron-mpv-video/src/shared/types';

// Keep the existing media controls and progress lifecycle while libmpv handles
// demuxing, decoding, timestamp recovery and audio/video synchronization.
class NativeMediaElement extends MpvVideoElement {
  private mediaVolume = 1;
  private mediaMuted = false;
  private mediaRate = 1;
  private mediaPaused = true;
  private loadGeneration = 0;
  private currentLoad: Promise<void> = Promise.resolve();
  private pendingSeek: number | null = null;
  private seekStarted = false;
  readyState = 0;

  constructor() {
    super();
    this.addEventListener('mpv-error', () => this.dispatchEvent(new Event('error')));
    this.addEventListener('mpv-event', event => this.onMediaEvent((event as CustomEvent<PlayerEvent>).detail));
  }

  override get currentTime() { return this.pendingSeek ?? super.currentTime; }
  override set currentTime(value: number) {
    this.pendingSeek = value;
    this.seekStarted = false;
    void this.seek(value).catch(() => {
      if (this.pendingSeek === value) this.pendingSeek = null;
      this.dispatchEvent(new Event('error'));
    });
  }
  get paused() { return this.mediaPaused; }
  override get volume() { return this.mediaVolume; }
  override set volume(value: number) {
    this.mediaVolume = Math.max(0, Math.min(1, value));
    this.applyVolume();
  }
  get muted() { return this.mediaMuted; }
  set muted(value: boolean) { this.mediaMuted = value; this.applyVolume(); }
  get playbackRate() { return this.mediaRate; }
  set playbackRate(value: number) {
    this.mediaRate = value;
    void this.setRate(value).catch(() => this.dispatchEvent(new Event('error')));
  }

  load() {
    const generation = ++this.loadGeneration;
    this.readyState = 0;
    this.pendingSeek = null;
    this.mediaPaused = true;
    this.currentLoad = this.open(this.src).then(() => {
      if (generation !== this.loadGeneration || !this.isConnected) return;
      this.applyVolume();
      return this.setRate(this.mediaRate);
    });
    void this.currentLoad.catch(() => this.dispatchEvent(new Event('error')));
  }

  override async play() {
    await this.currentLoad;
    if (!this.isConnected) return;
    await super.play();
    this.mediaPaused = false;
    this.dispatchEvent(new Event('play'));
  }

  override async pause() {
    this.mediaPaused = true;
    if (!this.isConnected) return;
    await super.pause().catch(() => undefined);
    this.dispatchEvent(new Event('pause'));
  }

  private applyVolume() {
    // The bridge uses mpv's 0..100 range; HTML media uses 0..1.
    void this.setVolume(this.mediaMuted ? 0 : this.mediaVolume * 100).catch(() => this.dispatchEvent(new Event('error')));
  }

  private onMediaEvent(event: PlayerEvent) {
    if (event.error) { this.dispatchEvent(new Event('error')); return; }
    if (event.type === 'file-loaded') {
      this.readyState = 4;
      this.dispatchEvent(new Event('loadedmetadata'));
      this.dispatchEvent(new Event('canplay'));
    }
    if (event.name === 'duration') this.dispatchEvent(new Event('durationchange'));
    if (event.name === 'pause' && typeof event.data === 'boolean') this.mediaPaused = event.data;
    if (event.name === 'time-pos') {
      if (this.pendingSeek !== null && typeof event.data === 'number' && Math.abs(event.data - this.pendingSeek) < 0.15) this.pendingSeek = null;
      this.dispatchEvent(new Event('timeupdate'));
    }
    if (event.name === 'eof-reached' && event.data === true) this.dispatchEvent(new Event('ended'));
    if (event.name === 'seeking') {
      if (event.data) this.seekStarted = true;
      else if (this.seekStarted) { this.pendingSeek = null; this.seekStarted = false; }
      this.dispatchEvent(new Event(event.data ? 'seeking' : 'seeked'));
    }
    if (event.name === 'paused-for-cache') this.dispatchEvent(new Event(event.data ? 'waiting' : 'playing'));
  }
}

export default defineNuxtPlugin(() => {
  if (window._electronMpvVideo && !customElements.get('evb-media')) customElements.define('evb-media', NativeMediaElement);
});
