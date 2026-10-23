import { el } from '@/core/dom';

import { box } from './kit';
import { commits } from './scenes/commits';
import { follow } from './scenes/follow';
import { intro } from './scenes/intro';
import { outro } from './scenes/outro';
import { peek } from './scenes/peek';
import { pip } from './scenes/pip';
import { preview } from './scenes/preview';
import { rewrite } from './scenes/rewrite';
import { themes } from './scenes/themes';
import { EASE, Timeline } from './timeline';

/** The picture is drawn on a stage of this size and scaled to fit, so it looks the same however big the dialog is. */
export const STAGE_WIDTH = 512;
export const STAGE_HEIGHT = 288;

/** Each scene is a short loop that shows one feature working, drawn with the same pieces as the site's own interface. */
export interface Scene {
  /** The site's lane colour the picture is tinted with. */
  lane: number;
  /** How long the loop is, in milliseconds. */
  duration: number;
  /** The moment that says the most when nothing moves: for people who ask their system for less motion. */
  poster: number;
  /** Builds the scene's pieces and writes their motion into the timeline. */
  build: (timeline: Timeline) => HTMLElement;
}

export const SCENES = { intro, themes, rewrite, preview, peek, pip, commits, follow, outro } as const satisfies Record<
  string,
  Scene
>;

export type SceneId = keyof typeof SCENES;

export interface Picture {
  element: HTMLElement;
  /** Starts the loop, or holds its poster for people who ask their system for less motion. */
  play(reduceMotion: boolean): void;
  /** Holds the loop at one moment, exactly. */
  seek(at: number): void;
  readonly scene: Scene;
  destroy(): void;
}

/** How long the picture takes to fade in and out at the ends of the loop, so it begins and ends from nothing. */
const FADE_IN = 300;
const FADE_OUT = 380;

/** A picture for one scene, in the box where the step's picture goes. */
export function createPicture(id: SceneId): Picture {
  const scene: Scene = SCENES[id];
  const timeline = new Timeline(scene.duration);
  const stage = box('stage', [scene.build(timeline)]);
  const element = el('div', { className: 'picture', attrs: { 'data-scene': id, 'aria-hidden': 'true' } }, [stage]);

  element.style.setProperty('--tint', `var(--lane-${String(scene.lane)})`);

  timeline.track(stage, [
    [0, { opacity: 0 }, EASE.out],
    [FADE_IN, { opacity: 1 }, EASE.hold],
    [scene.duration - FADE_OUT, { opacity: 1 }, EASE.in],
    [scene.duration, { opacity: 0 }],
  ]);

  // The stage keeps its own size and is scaled to whatever the box turns out to be.
  const fit = (): void => {
    const { width, height } = element.getBoundingClientRect();

    if (width > 0 && height > 0) {
      stage.style.setProperty('--fit', String(Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT)));
    }
  };
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);

  observer?.observe(element);
  fit();

  return {
    element,
    scene,
    play: (reduceMotion) => {
      if (reduceMotion) {
        timeline.seek(scene.poster);
      } else {
        timeline.play();
      }
    },
    seek: (at) => {
      timeline.seek(at);
    },
    destroy: () => {
      observer?.disconnect();
      timeline.destroy();
    },
  };
}
