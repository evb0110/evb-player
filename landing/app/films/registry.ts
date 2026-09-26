// Films recorded from the real app (landing/recorder), played by @remotion/player.
import type { ComponentType } from 'react';
import playerFilm from '~/films/manifests/player.json';
import { type IFilmManifest, makeRealFilm } from '~/films/RealFilm';

interface IComposition {
  component: ComponentType<{ onReady?: () => void }>;
  width: number;
  height: number;
  durationInFrames: number;
  /** Frame shown when the visitor prefers reduced motion. */
  stillFrame: number;
}

function real(manifest: unknown): IComposition {
  const m = manifest as IFilmManifest;
  const { Film, total } = makeRealFilm(m);
  return {
    component: Film,
    width: m.width,
    height: m.height,
    durationInFrames: total,
    stillFrame: Math.round(total * 0.3),
  };
}

export const COMPOSITIONS = {
  player: real(playerFilm),
};

export type TCompositionId = keyof typeof COMPOSITIONS;
