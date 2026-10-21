import '@fontsource/geist-sans/latin-400.css';
import '@fontsource/geist-sans/latin-500.css';
import '@fontsource/geist-sans/latin-600.css';
import '@fontsource/geist-mono/latin-400.css';
import '@fontsource/geist-mono/latin-500.css';
import './tokens.css';

import motion from '@/features/welcome/motion/motion.css?inline';
import { createPicture, SCENES, type SceneId } from '@/features/welcome/motion/picture';
import welcome from '@/features/welcome/welcome.css?inline';

/**
 * One of the welcome's pictures on a page of its own, held at whatever moment it is asked for, so every frame of the
 * README's pictures is drawn by the same code the extension runs. See render.ts.
 */

declare global {
  interface Window {
    stage: { duration: number; poster: number; seek: (at: number) => void };
  }
}

const params = new URLSearchParams(location.search);
const id = params.get('scene') ?? '';
const host = document.querySelector('#stage');

if (host === null || !(id in SCENES)) {
  throw new Error(`There is no picture called "${id}".`);
}

document.documentElement.classList.toggle('dark', params.get('theme') === 'dark');

const picture = createPicture(id as SceneId);

const style = document.createElement('style');

style.textContent = `${welcome}${motion}
  .picture { width: ${params.get('width') ?? '960'}px; max-height: none; border-bottom: 0; }`;
host.attachShadow({ mode: 'open' }).append(style, picture.element);

window.stage = {
  duration: picture.scene.duration,
  poster: picture.scene.poster,
  seek: (at) => {
    picture.seek(at);
  },
};
