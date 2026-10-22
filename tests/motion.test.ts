import { describe, expect, it, vi } from 'vitest';

import { createPicture, SCENES, type SceneId } from '@/features/welcome/motion/picture';
import { EASE, spring, Timeline, typeText } from '@/features/welcome/motion/timeline';
import { WELCOME_STEPS } from '@/features/welcome/welcome';

const IDS = Object.keys(SCENES) as SceneId[];

describe('the welcome pictures', () => {
  it('has a picture for every step, and each step once', () => {
    expect(WELCOME_STEPS.map((step) => step.scene).sort()).toEqual([...IDS].sort());
  });

  it.each(IDS)('draws %s, with a poster inside its loop', (id) => {
    const picture = createPicture(id);

    expect(picture.element.dataset.scene).toBe(id);
    expect(picture.element.querySelector('.stage')).not.toBeNull();
    expect(picture.scene.poster).toBeGreaterThan(0);
    expect(picture.scene.poster).toBeLessThan(picture.scene.duration);
    expect(picture.scene.duration).toBeLessThanOrEqual(10_000);
    picture.destroy();
  });
});

describe('the timeline', () => {
  const element = (): HTMLElement => document.createElement('div');

  it('holds the first look before the first stop and the last after the last', () => {
    const target = element();
    const animate = vi.spyOn(target, 'animate');
    const timeline = new Timeline(1000);

    timeline.track(target, [
      [200, { opacity: 0 }],
      [600, { opacity: 1 }],
    ]);

    const frames = animate.mock.calls[0]?.[0] as Keyframe[];

    expect(frames.map((frame) => [frame.offset, frame.opacity])).toEqual([
      [0, 0],
      [0.2, 0],
      [0.6, 1],
      [1, 1],
    ]);
    timeline.destroy();
  });

  it('refuses a track whose stops set different properties', () => {
    const timeline = new Timeline(1000);

    expect(() => {
      timeline.track(element(), [
        [0, { opacity: 0 }],
        [500, { opacity: 1, translate: '0px 0px' }],
      ]);
    }).toThrow(/same properties/);
  });

  it('types a letter at a time, with a caret that follows', () => {
    const parent = element();
    const timeline = new Timeline(2000);
    const end = typeText(timeline, parent, 'abc', 100, 50);

    expect(end).toBe(250);
    expect(parent.textContent).toBe('abc');
    expect(parent.querySelectorAll('.ch')).toHaveLength(3);
    expect(parent.querySelectorAll('.caret')).toHaveLength(3);
    timeline.destroy();
  });

  it('makes a spring that settles on one', () => {
    const curve = spring(0.3);
    const points = curve.slice('linear('.length, -1).split(', ').map(Number);

    expect(points[0]).toBe(0);
    expect(points.at(-1)).toBe(1);
    expect(Math.max(...points)).toBeGreaterThan(1);
    expect(EASE.hold).toBe('step-end');
  });
});
