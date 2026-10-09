/**
 * Images d'identité de démonstration (logos, cachets, signatures) dessinées
 * sans dépendance, avec l'encodeur PNG de `property-images.ts`. Elles servent
 * aux agences mandantes, aux copropriétés et à l'agence de test : les quittances
 * et documents PDF sortent ainsi avec un en-tête, un cachet et une signature.
 */
import { encodePng } from './property-images';

type RGB = readonly [number, number, number];

class Img {
  readonly data: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
    bg: RGB
  ) {
    this.data = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) this.data.set(bg, i * 3);
  }
  px(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data.set(c, (Math.floor(y) * this.w + Math.floor(x)) * 3);
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }
  disc(cx: number, cy: number, r: number, c: RGB): void {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r) this.px(cx + i, cy + j, c);
  }
  ring(cx: number, cy: number, r: number, thick: number, c: RGB): void {
    const inner = (r - thick) * (r - thick);
    for (let j = -r; j <= r; j++)
      for (let i = -r; i <= r; i++) {
        const d = i * i + j * j;
        if (d <= r * r && d >= inner) this.px(cx + i, cy + j, c);
      }
  }
  line(x0: number, y0: number, x1: number, y1: number, thick: number, c: RGB): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++)
      this.disc(Math.round(x0 + ((x1 - x0) * s) / steps), Math.round(y0 + ((y1 - y0) * s) / steps), thick, c);
  }
  png(): Buffer {
    return encodePng(this.w, this.h, this.data);
  }
}

const WHITE: RGB = [255, 255, 255];

export const BRAND_COLORS: RGB[] = [
  [20, 83, 110],
  [153, 60, 29],
  [22, 101, 52],
  [88, 28, 135],
  [30, 64, 175],
  [146, 64, 14]
];

/** Logo : pastille de couleur, immeuble stylisé et barres de texte. */
export function drawLogo(colorIndex: number, towers: number): Buffer {
  const color = BRAND_COLORS[colorIndex % BRAND_COLORS.length];
  const img = new Img(360, 140, WHITE);
  img.rect(0, 0, 360, 140, color);
  img.rect(0, 118, 360, 22, [255, 196, 61]);
  const heights = [74, 96, 60, 84];
  for (let i = 0; i < Math.min(4, Math.max(2, towers)); i++) {
    const x = 28 + i * 34;
    const h = heights[i];
    img.rect(x, 110 - h, 28, h, WHITE);
    for (let r = 0; r < Math.floor(h / 16); r++) {
      img.rect(x + 5, 110 - h + 8 + r * 16, 6, 8, color);
      img.rect(x + 17, 110 - h + 8 + r * 16, 6, 8, color);
    }
  }
  img.rect(180, 36, 150, 14, WHITE);
  img.rect(180, 60, 112, 10, [255, 255, 255]);
  img.rect(180, 80, 130, 8, [226, 232, 240]);
  return img.png();
}

/** Cachet rond : double anneau, étoile centrale et graduations. */
export function drawStamp(colorIndex: number): Buffer {
  const color = BRAND_COLORS[(colorIndex + 4) % BRAND_COLORS.length];
  const img = new Img(220, 220, WHITE);
  img.ring(110, 110, 104, 5, color);
  img.ring(110, 110, 82, 2, color);
  for (let a = 0; a < 360; a += 15) {
    const rad = (a * Math.PI) / 180;
    img.disc(110 + Math.round(Math.cos(rad) * 93), 110 + Math.round(Math.sin(rad) * 93), 2, color);
  }
  for (let k = 0; k < 5; k++) {
    const a1 = (k * 72 - 90) * (Math.PI / 180);
    const a2 = (((k * 72 + 144) % 360) - 90) * (Math.PI / 180);
    img.line(
      110 + Math.round(Math.cos(a1) * 34),
      110 + Math.round(Math.sin(a1) * 34),
      110 + Math.round(Math.cos(a2) * 34),
      110 + Math.round(Math.sin(a2) * 34),
      1,
      color
    );
  }
  img.rect(52, 52, 116, 4, color);
  img.rect(52, 164, 116, 4, color);
  return img.png();
}

/** Signature manuscrite : trait continu et paraphe souligné. */
export function drawSignature(variant: number): Buffer {
  const ink: RGB = [28, 42, 110];
  const img = new Img(300, 120, WHITE);
  let px = 20;
  let py = 70;
  for (let x = 20; x <= 260; x += 3) {
    const y = 62 + Math.sin((x + variant * 11) / 13) * 22 * Math.cos((x + variant * 7) / 47) - (x - 20) * 0.04;
    img.line(px, py, x, Math.round(y), 2, ink);
    px = x;
    py = Math.round(y);
  }
  img.line(24, 96, 196 + variant * 6, 84, 2, ink);
  img.line(150, 104, 268, 90, 1, ink);
  return img.png();
}
