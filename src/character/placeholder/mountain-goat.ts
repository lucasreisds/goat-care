import type { Texture } from 'pixi.js';
import { PixelBuffer } from '../../render/pixel';

/**
 * PLACEHOLDER art for the first character pack, drawn from code (palette + pixels).
 * Stage 2 moves this behind the pack manifest; the final hand-made PNGs replace it
 * without touching any engine code.
 */
const P = {
  fur: 0xf6f1e8,
  furShade: 0xd7cde0,
  belly: 0xfffbf2,
  snout: 0xfffaf0,
  hoof: 0x4a3f5c,
  hoofLight: 0x6a5f80,
  horn: 0xdcc08a,
  hornShade: 0xb8955a,
  hornTip: 0xf6e8c0,
  earInner: 0xf2a8b0,
  eye: 0xf2d36b,
  pupil: 0x2a1f3a,
  nose: 0x6c6190,
  mouth: 0x7a5a6a,
  beard: 0xf0e8f6,
  beardShade: 0xcfc4dc,
  outline: 0x4a3f78,
} as const;

const HORN_POINTS: ReadonlyArray<readonly [number, number]> = [
  [26, 11],
  [25, 9],
  [24, 7],
  [24, 5],
  [25, 4],
  [27, 4],
];

function drawGoat(blink: boolean): PixelBuffer {
  const main = new PixelBuffer(64, 64);

  // fur is painted on its own layer so shading only touches fur
  const fur = new PixelBuffer(64, 64);
  fur.rect(22, 50, 7, 10, P.fur); // legs
  fur.rect(35, 50, 7, 10, P.fur);
  fur.ellipse(32, 40, 13, 12, P.fur); // torso
  fur.ellipse(17, 39, 3.5, 9, P.fur); // arms
  fur.ellipse(47, 39, 3.5, 9, P.fur);
  fur.rect(28, 27, 8, 5, P.fur); // neck
  fur.ellipse(20, 18, 4, 2, P.fur); // ears
  fur.ellipse(16, 20, 3, 2, P.fur);
  fur.ellipse(44, 18, 4, 2, P.fur);
  fur.ellipse(48, 20, 3, 2, P.fur);
  fur.ellipse(32, 19, 10, 9, P.fur); // head
  fur.ellipse(32, 42, 7, 8, P.belly);
  fur.ellipse(32, 24, 6, 4.5, P.snout);

  fur.ctx.globalCompositeOperation = 'source-atop';
  fur.rect(37, 0, 27, 64, P.furShade);
  for (let y = 0; y < 64; y += 1) {
    fur.px(35 + (y & 1), y, P.furShade); // dithered terminator
  }
  fur.rect(26, 27, 12, 3, P.furShade, 0.6); // shadow under the chin
  fur.ctx.globalCompositeOperation = 'source-over';
  main.ctx.drawImage(fur.canvas, 0, 0);

  // ear insides
  main.px(19, 18, P.earInner);
  main.px(20, 18, P.earInner);
  main.px(43, 18, P.earInner);
  main.px(44, 18, P.earInner);

  // hooves and hands
  main.rect(21, 60, 9, 3, P.hoof);
  main.rect(34, 60, 9, 3, P.hoof);
  main.rect(22, 60, 7, 1, P.hoofLight);
  main.rect(35, 60, 7, 1, P.hoofLight);
  main.ellipse(17, 48, 3, 2.5, P.hoof);
  main.ellipse(47, 48, 3, 2.5, P.hoof);

  // horns (kid stage): mirrored pair, outer edge shaded
  HORN_POINTS.forEach(([x, y], i) => {
    const tip = i === HORN_POINTS.length - 1;
    main.rect(x, y, 2, 1, tip ? P.hornTip : P.horn);
    main.px(x, y, P.hornShade);
    main.rect(62 - x, y, 2, 1, tip ? P.hornTip : P.horn);
    main.px(63 - x, y, P.hornShade);
  });

  // eyes: yellow with a HORIZONTAL pupil
  for (const ex of [27, 37]) {
    if (blink) {
      main.rect(ex - 2, 19, 5, 1, P.pupil);
    } else {
      main.rect(ex - 2, 18, 5, 2, P.eye);
      main.rect(ex - 1, 17, 3, 4, P.eye);
      main.rect(ex - 1, 19, 3, 1, P.pupil);
      main.px(ex - 1, 18, 0xffffff);
    }
  }

  // nostrils and mouth
  main.px(30, 23, P.nose);
  main.px(33, 23, P.nose);
  main.px(30, 26, P.mouth);
  main.rect(31, 27, 2, 1, P.mouth);
  main.px(33, 26, P.mouth);

  // goatee
  main.rect(30, 28, 4, 2, P.beard);
  main.rect(31, 30, 2, 2, P.beard);
  main.px(31, 32, P.beard);
  main.px(32, 30, P.beardShade);
  main.px(32, 31, P.beardShade);
  main.px(33, 28, P.beardShade);

  main.outline(P.outline);
  return main;
}

export interface GoatPlaceholder {
  idle: Texture;
  blink: Texture;
}

export function createGoatPlaceholder(): GoatPlaceholder {
  return { idle: drawGoat(false).toTexture(), blink: drawGoat(true).toTexture() };
}
