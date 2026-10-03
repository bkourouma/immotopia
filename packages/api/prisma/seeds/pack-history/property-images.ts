/**
 * Photos de démonstration des biens des agences de test (staging).
 *
 * Les générateurs d'historique créent des lignes `Property` sans média : les
 * cartes de biens, la fiche et le portail affichaient des vignettes vides. Ce
 * module donne à chaque bien SANS média une photo principale et 2 à 3 photos de
 * galerie, dessinées procéduralement (aucune dépendance, rien de copyrighté) :
 * façade selon le type de bien, intérieurs stylisés (salon, chambre, cuisine,
 * bureau) pour la galerie.
 *
 * Convention de stockage = celle du service des médias de bien
 * (`services/property-media-service.ts`) et de la liste blanche de
 * `middleware/uploads-access-middleware.ts` :
 *   fichier  `<UPLOADS_DIR>/properties/<propertyId>/<fichier>.png` (ce niveau seulement)
 *   filePath chemin absolu du fichier
 *   fileUrl  `/uploads/properties/<propertyId>/<fichier>.png` (le front applique `fileUrl()`)
 *
 * Idempotent (un bien qui porte déjà un média est ignoré), déterministe (le
 * dessin ne dépend que de l'identifiant du bien) et indépendant des générateurs
 * d'historique : il fonctionne sur une agence déjà peuplée.
 */
import { deflateSync } from 'zlib';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createRng, seedFromString, type HistoryContext } from './types';
import { getUploadsRoot } from '../../../src/utils/project-root';

export const IMAGE_WIDTH = 800;
export const IMAGE_HEIGHT = 533;

type RGB = readonly [number, number, number];
type Rng = () => number;

// ---------------------------------------------------------------------------
// Encodeur PNG (RGB 8 bits, filtre « Sub »)
// ---------------------------------------------------------------------------

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  typeAndData.copy(out, 4);
  out.writeUInt32BE(crc32(typeAndData), 8 + data.length);
  return out;
}

/** Encode des pixels RGB (3 octets par pixel, lignes de haut en bas) en PNG. */
export function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  if (rgb.length !== width * height * 3) throw new Error('Taille de tampon RGB incohérente');
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 1; // filtre Sub : chaque octet moins celui du pixel de gauche
    for (let i = 0; i < stride; i++) {
      const left = i >= 3 ? rgb[y * stride + i - 3] : 0;
      raw[rowStart + 1 + i] = (rgb[y * stride + i] - left) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---------------------------------------------------------------------------
// Toile de dessin
// ---------------------------------------------------------------------------

const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t)
];
const shade = (c: RGB, t: number): RGB => (t >= 0 ? mix(c, [255, 255, 255], t) : mix(c, [0, 0, 0], -t));
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

class Canvas {
  readonly data: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number
  ) {
    this.data = new Uint8Array(w * h * 3);
  }

  private put(x: number, y: number, c: RGB, a: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    if (a >= 1) {
      this.data[i] = c[0];
      this.data[i + 1] = c[1];
      this.data[i + 2] = c[2];
    } else {
      this.data[i] = Math.round(this.data[i] + (c[0] - this.data[i]) * a);
      this.data[i + 1] = Math.round(this.data[i + 1] + (c[1] - this.data[i + 1]) * a);
      this.data[i + 2] = Math.round(this.data[i + 2] + (c[2] - this.data[i + 2]) * a);
    }
  }

  rect(x: number, y: number, w: number, h: number, c: RGB, a = 1): void {
    const x0 = Math.max(0, Math.round(x));
    const x1 = Math.min(this.w, Math.round(x + w));
    const y0 = Math.max(0, Math.round(y));
    const y1 = Math.min(this.h, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) this.put(xx, yy, c, a);
  }

  vgrad(x: number, y: number, w: number, h: number, top: RGB, bottom: RGB): void {
    const rows = Math.max(1, Math.round(h));
    for (let r = 0; r < rows; r++) this.rect(x, y + r, w, 1, mix(top, bottom, r / Math.max(1, rows - 1)));
  }

  circle(cx: number, cy: number, r: number, c: RGB, a = 1): void {
    this.ellipse(cx, cy, r, r, c, a);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1): void {
    for (let yy = Math.floor(cy - ry); yy <= Math.ceil(cy + ry); yy++) {
      const dy = (yy + 0.5 - cy) / ry;
      if (Math.abs(dy) > 1) continue;
      const dx = rx * Math.sqrt(1 - dy * dy);
      for (let xx = Math.round(cx - dx); xx < Math.round(cx + dx); xx++) this.put(xx, yy, c, a);
    }
  }

  rrect(x: number, y: number, w: number, h: number, r: number, c: RGB, a = 1): void {
    this.rect(x + r, y, w - 2 * r, h, c, a);
    this.rect(x, y + r, r, h - 2 * r, c, a);
    this.rect(x + w - r, y + r, r, h - 2 * r, c, a);
    for (const [cx, cy] of [
      [x + r, y + r],
      [x + w - r, y + r],
      [x + r, y + h - r],
      [x + w - r, y + h - r]
    ])
      this.circle(cx, cy, r, c, a);
  }

  /** Remplissage scanline (règle pair/impair). */
  poly(points: ReadonlyArray<readonly [number, number]>, c: RGB, a = 1): void {
    const ys = points.map(p => p[1]);
    const yMin = Math.max(0, Math.floor(Math.min(...ys)));
    const yMax = Math.min(this.h - 1, Math.ceil(Math.max(...ys)));
    for (let yy = yMin; yy <= yMax; yy++) {
      const yc = yy + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let xx = Math.round(xs[k]); xx < Math.round(xs[k + 1]); xx++) this.put(xx, yy, c, a);
    }
  }
}

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

const WALLS: readonly RGB[] = [
  [238, 230, 214],
  [225, 200, 160],
  [214, 164, 126],
  [240, 222, 160],
  [184, 204, 174],
  [208, 210, 214],
  [172, 198, 222],
  [232, 202, 192]
];
const ROOFS: readonly RGB[] = [
  [168, 72, 50],
  [96, 100, 112],
  [122, 72, 50],
  [70, 92, 82]
];
const INTERIOR_WALLS: readonly RGB[] = [
  [236, 226, 208],
  [200, 218, 214],
  [232, 206, 196],
  [214, 220, 232],
  [226, 226, 200]
];
const FLOORS: readonly RGB[] = [
  [176, 132, 92],
  [150, 108, 74],
  [196, 176, 150],
  [128, 130, 136]
];
const ACCENTS: readonly RGB[] = [
  [46, 104, 142],
  [176, 74, 60],
  [60, 118, 84],
  [196, 140, 46],
  [112, 78, 140]
];

const pickOf = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length) % items.length];

type Sky = { top: RGB; bottom: RGB; dusk: boolean };
const SKIES: readonly Sky[] = [
  { top: [78, 150, 226], bottom: [206, 228, 246], dusk: false },
  { top: [62, 84, 156], bottom: [252, 192, 128], dusk: true },
  { top: [132, 184, 232], bottom: [248, 242, 226], dusk: false }
];

// ---------------------------------------------------------------------------
// Éléments de décor
// ---------------------------------------------------------------------------

const GROUND_Y = 420;

function drawWindow(c: Canvas, x: number, y: number, w: number, h: number, lit: boolean, frame: RGB): void {
  c.rect(x - 3, y - 3, w + 6, h + 6, frame);
  if (lit) c.vgrad(x, y, w, h, [255, 226, 150], [244, 180, 96]);
  else c.vgrad(x, y, w, h, [146, 196, 230], [74, 124, 176]);
  c.poly(
    [
      [x + w * 0.1, y + h],
      [x + w * 0.45, y],
      [x + w * 0.7, y],
      [x + w * 0.35, y + h]
    ],
    WHITE,
    0.22
  );
  c.rect(x + w / 2 - 1, y, 2, h, frame);
  c.rect(x, y + h / 2 - 1, w, 2, frame);
}

function drawTree(c: Canvas, x: number, base: number, size: number, rng: Rng): void {
  const leaf = mix([40, 120, 60], [86, 150, 70], rng());
  c.ellipse(x, base + 2, size * 0.6, size * 0.12, BLACK, 0.18);
  c.rect(x - size * 0.06, base - size * 0.7, size * 0.12, size * 0.7, [102, 74, 50]);
  c.circle(x, base - size * 1.05, size * 0.5, shade(leaf, -0.12));
  c.circle(x - size * 0.34, base - size * 0.82, size * 0.38, leaf);
  c.circle(x + size * 0.36, base - size * 0.84, size * 0.36, leaf);
  c.circle(x - size * 0.1, base - size * 1.2, size * 0.3, shade(leaf, 0.14));
}

function drawPalm(c: Canvas, x: number, base: number, size: number, lean: number): void {
  const topX = x + lean;
  const topY = base - size;
  c.ellipse(x, base + 2, size * 0.28, size * 0.05, BLACK, 0.18);
  c.poly(
    [
      [x - size * 0.03, base],
      [x + size * 0.03, base],
      [topX + size * 0.02, topY],
      [topX - size * 0.02, topY]
    ],
    [120, 92, 62]
  );
  const frond: RGB = [52, 138, 66];
  for (const [dx, dy] of [
    [-0.5, 0.08],
    [-0.36, -0.12],
    [0, -0.2],
    [0.36, -0.12],
    [0.5, 0.08],
    [-0.22, 0.2],
    [0.22, 0.2]
  ]) {
    c.poly(
      [
        [topX, topY],
        [topX + dx * size * 0.6, topY + dy * size * 0.6 - size * 0.05],
        [topX + dx * size, topY + dy * size + size * 0.12],
        [topX + dx * size * 0.6, topY + dy * size * 0.6 + size * 0.06]
      ],
      frond
    );
  }
  c.circle(topX, topY + 2, size * 0.04, [96, 66, 40]);
}

function drawSkyAndGround(c: Canvas, sky: Sky, rng: Rng, groundColor: RGB): void {
  c.vgrad(0, 0, c.w, GROUND_Y, sky.top, sky.bottom);
  const sunX = 80 + rng() * 640;
  const sunY = sky.dusk ? GROUND_Y - 70 : 60 + rng() * 40;
  const sun: RGB = sky.dusk ? [255, 214, 140] : [255, 244, 200];
  c.circle(sunX, sunY, 46, sun, 0.25);
  c.circle(sunX, sunY, 28, sun, 0.7);
  for (let i = 0; i < 4; i++) {
    const cx = rng() * c.w;
    const cy = 40 + rng() * 110;
    const s = 30 + rng() * 40;
    const cloud = sky.dusk ? ([255, 222, 200] as RGB) : WHITE;
    c.ellipse(cx, cy, s * 1.6, s * 0.42, cloud, 0.8);
    c.ellipse(cx - s * 0.5, cy - s * 0.2, s * 0.8, s * 0.4, cloud, 0.8);
    c.ellipse(cx + s * 0.5, cy - s * 0.16, s * 0.7, s * 0.36, cloud, 0.8);
  }
  // collines lointaines
  const hill = mix(groundColor, sky.bottom, 0.5);
  c.poly(
    [
      [0, GROUND_Y],
      [0, GROUND_Y - 36],
      [160, GROUND_Y - 62],
      [340, GROUND_Y - 30],
      [560, GROUND_Y - 58],
      [800, GROUND_Y - 24],
      [800, GROUND_Y]
    ],
    hill
  );
  c.vgrad(0, GROUND_Y, c.w, c.h - GROUND_Y, groundColor, shade(groundColor, -0.22));
}

function drawRoad(c: Canvas): void {
  c.rect(0, 468, c.w, 12, [196, 192, 184]);
  c.rect(0, 480, c.w, c.h - 480, [84, 86, 92]);
  for (let x = 20; x < c.w; x += 120) c.rect(x, 504, 64, 5, [232, 226, 200]);
}

function drawDoor(c: Canvas, x: number, y: number, w: number, h: number, color: RGB): void {
  c.rect(x - 4, y - 4, w + 8, h + 4, shade(color, -0.35));
  c.vgrad(x, y, w, h, shade(color, 0.08), shade(color, -0.12));
  c.rect(x + w * 0.14, y + h * 0.1, w * 0.72, h * 0.34, shade(color, -0.2));
  c.circle(x + w * 0.82, y + h * 0.55, 3, [226, 190, 90]);
}

// ---------------------------------------------------------------------------
// Façades par type de bien
// ---------------------------------------------------------------------------

type PropertyKind = 'MULTI' | 'VILLA' | 'SHOP' | 'WAREHOUSE' | 'LAND' | 'OFFICE' | 'GARAGE';

const KIND_BY_TYPE: Record<string, { kind: PropertyKind; floors: number }> = {
  APPARTEMENT: { kind: 'MULTI', floors: 3 },
  STUDIO: { kind: 'MULTI', floors: 3 },
  IMMEUBLE: { kind: 'MULTI', floors: 5 },
  LOT_PROGRAMME_NEUF: { kind: 'MULTI', floors: 4 },
  DUPLEX_TRIPLEX: { kind: 'MULTI', floors: 2 },
  CHAMBRE_COLOCATION: { kind: 'MULTI', floors: 2 },
  MAISON_VILLA: { kind: 'VILLA', floors: 2 },
  BOUTIQUE_COMMERCIAL: { kind: 'SHOP', floors: 1 },
  ENTREPOT_INDUSTRIEL: { kind: 'WAREHOUSE', floors: 1 },
  TERRAIN: { kind: 'LAND', floors: 0 },
  BUREAU: { kind: 'OFFICE', floors: 6 },
  PARKING_BOX: { kind: 'GARAGE', floors: 1 }
};

function kindOf(propertyType: string | null | undefined): { kind: PropertyKind; floors: number } {
  return (propertyType && KIND_BY_TYPE[propertyType]) || { kind: 'MULTI', floors: 3 };
}

function drawMulti(c: Canvas, rng: Rng, floors: number, sky: Sky): void {
  const wall = pickOf(rng, WALLS);
  const accent = pickOf(rng, ACCENTS);
  const frame = shade(wall, -0.45);
  const cols = 4;
  const fh = 62;
  const bw = 440 + Math.round(rng() * 60);
  const bx = (c.w - bw) / 2;
  const top = GROUND_Y - floors * fh - 14;
  c.rect(bx - 8, GROUND_Y - 6, bw + 16, 12, BLACK, 0.18);
  c.vgrad(bx, top, bw, GROUND_Y - top, shade(wall, 0.06), shade(wall, -0.1));
  c.rect(bx - 6, top - 12, bw + 12, 14, shade(wall, -0.28)); // acrotère
  c.rect(bx + bw - 90, top - 26, 40, 16, shade(wall, -0.2)); // local technique
  const colW = bw / cols;
  for (let f = 0; f < floors; f++) {
    const fy = top + 14 + f * fh;
    const ground = f === floors - 1;
    c.rect(bx, fy - 4, bw, 3, shade(wall, -0.18));
    for (let k = 0; k < cols; k++) {
      const wx = bx + k * colW + colW / 2 - 21;
      if (ground && k === 1) {
        drawDoor(c, bx + k * colW + colW / 2 - 24, fy + 8, 48, fh - 8, accent);
        continue;
      }
      if (ground && k === 2) {
        // entrée vitrée : seconde porte
        c.rect(wx - 3, fy + 8, 48, fh - 8, frame);
        c.vgrad(wx, fy + 11, 42, fh - 14, [170, 210, 232], [90, 140, 186]);
        c.rect(wx + 20, fy + 11, 2, fh - 14, frame);
        continue;
      }
      drawWindow(c, wx, fy + 12, 42, 32, sky.dusk && rng() > 0.35, frame);
      if (!ground && f % 2 === 1) c.rect(wx - 8, fy + 48, 58, 6, accent); // balcon
    }
  }
  // bandeau coloré
  c.rect(bx, top + 14 + (floors - 1) * fh - 4, bw, 4, accent);
  // haie et arbres
  drawTree(c, bx - 54, GROUND_Y + 14, 62, rng);
  drawTree(c, bx + bw + 54, GROUND_Y + 14, 56, rng);
  c.rrect(bx + 10, GROUND_Y + 2, bw - 20, 14, 7, [48, 112, 60]);
}

function drawVilla(c: Canvas, rng: Rng, sky: Sky): void {
  const wall = pickOf(rng, WALLS);
  const roof = pickOf(rng, ROOFS);
  const accent = pickOf(rng, ACCENTS);
  const frame = shade(wall, -0.45);
  const bx = 180;
  const bw = 440;
  const by = 262;
  c.rect(bx - 10, GROUND_Y - 6, bw + 20, 12, BLACK, 0.18);
  c.vgrad(bx, by, bw, GROUND_Y - by, shade(wall, 0.05), shade(wall, -0.1));
  // toit à quatre pentes
  c.poly(
    [
      [bx - 26, by + 4],
      [bx + 70, by - 78],
      [bx + bw - 70, by - 78],
      [bx + bw + 26, by + 4]
    ],
    roof
  );
  c.poly(
    [
      [bx - 26, by + 4],
      [bx + 70, by - 78],
      [bx + 140, by - 78],
      [bx + 40, by + 4]
    ],
    WHITE,
    0.1
  );
  c.rect(bx - 26, by + 2, bw + 52, 6, shade(roof, -0.3));
  // fenêtres et porte
  drawWindow(c, bx + 40, by + 38, 70, 58, sky.dusk, frame);
  drawWindow(c, bx + bw - 110, by + 38, 70, 58, sky.dusk, frame);
  drawDoor(c, bx + bw / 2 - 28, by + 44, 56, GROUND_Y - by - 44, accent);
  // auvent et colonnes
  c.rect(bx + bw / 2 - 60, by + 30, 120, 8, shade(wall, -0.3));
  c.rect(bx + bw / 2 - 58, by + 38, 6, GROUND_Y - by - 38, shade(wall, 0.2));
  c.rect(bx + bw / 2 + 52, by + 38, 6, GROUND_Y - by - 38, shade(wall, 0.2));
  // perron et allée
  c.poly(
    [
      [bx + bw / 2 - 40, GROUND_Y],
      [bx + bw / 2 + 40, GROUND_Y],
      [bx + bw / 2 + 74, 470],
      [bx + bw / 2 - 74, 470]
    ],
    [214, 204, 186]
  );
  // clôture
  for (let x = 20; x < c.w; x += 22) {
    if (x > bx + bw / 2 - 90 && x < bx + bw / 2 + 90) continue;
    c.rect(x, GROUND_Y + 14, 6, 40, shade(wall, 0.15));
  }
  c.rect(0, GROUND_Y + 26, c.w, 5, shade(wall, 0.05));
  drawPalm(c, 96, GROUND_Y + 22, 190, 14);
  drawTree(c, 710, GROUND_Y + 22, 84, rng);
}

function drawShop(c: Canvas, rng: Rng, sky: Sky): void {
  const wall = pickOf(rng, WALLS);
  const accent = pickOf(rng, ACCENTS);
  const frame = shade(wall, -0.5);
  const bx = 110;
  const bw = 580;
  const by = 250;
  c.rect(bx - 8, GROUND_Y - 6, bw + 16, 12, BLACK, 0.18);
  c.vgrad(bx, by, bw, GROUND_Y - by, shade(wall, 0.05), shade(wall, -0.12));
  c.rect(bx - 8, by - 14, bw + 16, 16, shade(wall, -0.3));
  c.rect(bx + 40, by + 10, bw - 80, 40, accent); // enseigne
  c.rect(bx + 54, by + 22, bw - 108, 16, WHITE, 0.85);
  // vitrines
  const lit = sky.dusk;
  c.rect(bx + 30, by + 100, 230, 120, frame);
  c.vgrad(bx + 36, by + 106, 218, 108, lit ? [255, 226, 160] : [158, 204, 232], lit ? [236, 170, 90] : [86, 136, 186]);
  c.rect(bx + bw - 260, by + 100, 230, 120, frame);
  c.vgrad(
    bx + bw - 254,
    by + 106,
    218,
    108,
    lit ? [255, 226, 160] : [158, 204, 232],
    lit ? [236, 170, 90] : [86, 136, 186]
  );
  for (let i = 0; i < 4; i++) {
    c.rect(bx + 50 + i * 52, by + 170, 36, 44, mix(accent, WHITE, 0.2 + i * 0.12), 0.9);
    c.rect(bx + bw - 240 + i * 52, by + 170, 36, 44, mix(pickOf(rng, ACCENTS), WHITE, 0.2), 0.9);
  }
  drawDoor(c, bx + bw / 2 - 30, by + 96, 60, GROUND_Y - by - 96, shade(accent, -0.1));
  // store à rayures
  for (let i = 0; i < 14; i++) {
    const sx = bx + 20 + i * ((bw - 40) / 14);
    c.rect(sx, by + 58, (bw - 40) / 14, 28, i % 2 === 0 ? accent : WHITE);
    c.circle(sx + (bw - 40) / 28, by + 86, (bw - 40) / 28, i % 2 === 0 ? accent : WHITE);
  }
  drawTree(c, 60, GROUND_Y + 14, 60, rng);
  drawPalm(c, 744, GROUND_Y + 16, 150, -10);
}

function drawWarehouse(c: Canvas, rng: Rng, sky: Sky): void {
  const wall = pickOf(rng, [
    [184, 192, 200],
    [214, 208, 192],
    [170, 184, 176]
  ] as RGB[]);
  const accent = pickOf(rng, ACCENTS);
  const bx = 60;
  const bw = 680;
  const by = 240;
  c.rect(bx - 8, GROUND_Y - 6, bw + 16, 12, BLACK, 0.2);
  c.vgrad(bx, by, bw, GROUND_Y - by, shade(wall, 0.05), shade(wall, -0.15));
  for (let x = bx; x < bx + bw; x += 14) c.rect(x, by, 2, GROUND_Y - by, shade(wall, -0.2), 0.5);
  c.poly(
    [
      [bx - 12, by + 4],
      [bx + 40, by - 40],
      [bx + bw - 40, by - 40],
      [bx + bw + 12, by + 4]
    ],
    shade(wall, -0.3)
  );
  c.rect(bx, by + 24, bw, 10, accent);
  for (let i = 0; i < 3; i++) {
    const dx = bx + 60 + i * 210;
    c.rect(dx - 4, by + 80, 158, GROUND_Y - by - 76, shade(wall, -0.5));
    c.vgrad(dx, by + 84, 150, GROUND_Y - by - 84, shade(accent, 0.12), shade(accent, -0.15));
    for (let k = 1; k < 8; k++) c.rect(dx, by + 84 + k * 14, 150, 2, shade(accent, -0.35), 0.6);
  }
  for (let i = 0; i < 6; i++)
    drawWindow(c, bx + 40 + i * 110, by + 44, 40, 20, sky.dusk && rng() > 0.4, shade(wall, -0.5));
  // conteneurs
  const palette = [ACCENTS[1], ACCENTS[0], ACCENTS[2]];
  palette.forEach((col, i) => {
    c.rect(560 + i * 62, GROUND_Y + 8, 58, 28, col);
    for (let k = 0; k < 6; k++) c.rect(564 + i * 62 + k * 9, GROUND_Y + 10, 2, 24, shade(col, -0.3), 0.7);
  });
  drawTree(c, 30, GROUND_Y + 14, 50, rng);
}

function drawOffice(c: Canvas, rng: Rng, sky: Sky): void {
  const glass = pickOf(rng, [
    [70, 120, 170],
    [60, 130, 150],
    [80, 100, 150]
  ] as RGB[]);
  const bx = 230;
  const bw = 340;
  const by = 96;
  c.rect(bx - 8, GROUND_Y - 6, bw + 16, 12, BLACK, 0.2);
  c.vgrad(bx, by, bw, GROUND_Y - by, shade(glass, 0.3), shade(glass, -0.1));
  const rows = 11;
  const cols = 6;
  const cw = bw / cols;
  const rh = (GROUND_Y - by - 40) / rows;
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < cols; k++) {
      const lit = sky.dusk && rng() > 0.45;
      const x = bx + k * cw + 3;
      const y = by + r * rh + 4;
      c.vgrad(
        x,
        y,
        cw - 6,
        rh - 6,
        lit ? [255, 226, 150] : shade(glass, 0.35),
        lit ? [240, 190, 110] : shade(glass, 0.05)
      );
    }
  c.poly(
    [
      [bx + 40, GROUND_Y - 40],
      [bx + 140, by],
      [bx + 200, by],
      [bx + 100, GROUND_Y - 40]
    ],
    WHITE,
    0.12
  );
  c.rect(bx - 6, by - 10, bw + 12, 12, shade(glass, -0.45));
  c.rect(bx + bw / 2 - 2, by - 40, 4, 30, shade(glass, -0.5));
  c.rect(bx, GROUND_Y - 40, bw, 40, shade(glass, -0.35));
  c.vgrad(bx + bw / 2 - 50, GROUND_Y - 36, 100, 36, [180, 214, 234], [96, 140, 184]);
  c.rect(bx + bw / 2 - 1, GROUND_Y - 36, 2, 36, shade(glass, -0.5));
  // bâtiments voisins
  c.rect(60, 250, 130, GROUND_Y - 250, [188, 192, 200]);
  c.rect(610, 220, 130, GROUND_Y - 220, [200, 196, 190]);
  for (let r = 0; r < 6; r++)
    for (let k = 0; k < 3; k++) {
      c.rect(72 + k * 40, 264 + r * 24, 26, 14, [120, 150, 180]);
      c.rect(622 + k * 40, 234 + r * 28, 26, 16, [130, 154, 176]);
    }
  drawTree(c, 200, GROUND_Y + 16, 50, rng);
  drawTree(c, 600, GROUND_Y + 16, 50, rng);
}

function drawGarage(c: Canvas, rng: Rng, sky: Sky): void {
  const wall = pickOf(rng, WALLS);
  const bx = 80;
  const bw = 640;
  const by = 290;
  c.rect(bx - 8, GROUND_Y - 6, bw + 16, 12, BLACK, 0.2);
  c.vgrad(bx, by, bw, GROUND_Y - by, shade(wall, 0.05), shade(wall, -0.15));
  c.rect(bx - 10, by - 14, bw + 20, 16, shade(wall, -0.35));
  const n = 5;
  const dw = (bw - 40) / n;
  for (let i = 0; i < n; i++) {
    const dx = bx + 20 + i * dw + 6;
    const col = i % 2 === 0 ? ACCENTS[0] : ACCENTS[3];
    c.rect(dx - 3, by + 18, dw - 6, GROUND_Y - by - 18, shade(wall, -0.5));
    c.vgrad(dx, by + 21, dw - 12, GROUND_Y - by - 21, shade(col, 0.1), shade(col, -0.15));
    for (let k = 1; k < 7; k++) c.rect(dx, by + 21 + k * 14, dw - 12, 2, shade(col, -0.35), 0.6);
    c.rect(dx + (dw - 12) / 2 - 8, by + 4, 16, 10, WHITE, 0.9);
  }
  if (sky.dusk) c.rect(bx, by - 2, bw, 2, [255, 230, 160]);
  drawPalm(c, 40, GROUND_Y + 22, 170, 12);
  drawTree(c, 760, GROUND_Y + 22, 66, rng);
}

function drawLand(c: Canvas, rng: Rng, _sky: Sky): void {
  // piquets et grillage
  for (let x = 16; x < c.w; x += 54) {
    c.rect(x, GROUND_Y + 8, 6, 54, [120, 92, 62]);
  }
  c.rect(0, GROUND_Y + 22, c.w, 3, [186, 188, 192]);
  c.rect(0, GROUND_Y + 44, c.w, 3, [186, 188, 192]);
  // parcelle bornée
  c.poly(
    [
      [140, GROUND_Y + 6],
      [660, GROUND_Y + 6],
      [740, GROUND_Y - 24],
      [60, GROUND_Y - 24]
    ],
    [150, 168, 80],
    0.7
  );
  for (const [x, y] of [
    [60, GROUND_Y - 24],
    [740, GROUND_Y - 24],
    [140, GROUND_Y + 6],
    [660, GROUND_Y + 6]
  ])
    c.rect(x - 4, y - 8, 8, 12, [226, 222, 212]);
  // panneau « à vendre »
  c.rect(396, GROUND_Y - 120, 8, 120, [90, 70, 50]);
  c.rrect(300, GROUND_Y - 190, 200, 80, 8, WHITE);
  c.rect(308, GROUND_Y - 182, 184, 18, ACCENTS[1]);
  c.rect(318, GROUND_Y - 150, 164, 6, [90, 94, 100]);
  c.rect(318, GROUND_Y - 134, 120, 6, [90, 94, 100]);
  drawTree(c, 110, GROUND_Y + 2, 96, rng);
  drawPalm(c, 690, GROUND_Y + 4, 210, -16);
  drawTree(c, 600, GROUND_Y - 6, 60, rng);
}

function drawExterior(c: Canvas, propertyType: string, rng: Rng, variant: number): void {
  const { kind, floors } = kindOf(propertyType);
  const sky = SKIES[variant % SKIES.length];
  const grass = kind === 'LAND' ? mix([176, 160, 96], [150, 168, 80], rng()) : mix([96, 160, 74], [70, 140, 80], rng());
  drawSkyAndGround(c, sky, rng, grass);
  drawRoad(c);
  switch (kind) {
    case 'VILLA':
      return drawVilla(c, rng, sky);
    case 'SHOP':
      return drawShop(c, rng, sky);
    case 'WAREHOUSE':
      return drawWarehouse(c, rng, sky);
    case 'OFFICE':
      return drawOffice(c, rng, sky);
    case 'GARAGE':
      return drawGarage(c, rng, sky);
    case 'LAND':
      return drawLand(c, rng, sky);
    default:
      return drawMulti(c, rng, floors, sky);
  }
}

// ---------------------------------------------------------------------------
// Intérieurs
// ---------------------------------------------------------------------------

export type Scene = 'EXTERIEUR' | 'SALON' | 'CHAMBRE' | 'CUISINE' | 'BUREAU';

function interiorBase(c: Canvas, rng: Rng, floorY: number): { wall: RGB; floor: RGB } {
  const wall = pickOf(rng, INTERIOR_WALLS);
  const floor = pickOf(rng, FLOORS);
  c.vgrad(0, 0, c.w, floorY, shade(wall, 0.08), shade(wall, -0.06));
  c.vgrad(0, floorY, c.w, c.h - floorY, shade(floor, 0.1), shade(floor, -0.25));
  c.rect(0, floorY - 10, c.w, 10, shade(wall, 0.35)); // plinthe
  for (let x = -200; x < c.w + 200; x += 90)
    c.poly(
      [
        [x, c.h],
        [x + 3, c.h],
        [x + 3 + (x - 400) * 0.18, floorY],
        [x + (x - 400) * 0.18, floorY]
      ],
      shade(floor, -0.3),
      0.45
    );
  return { wall, floor };
}

function bigWindow(c: Canvas, x: number, y: number, w: number, h: number, curtain: RGB): void {
  c.rect(x - 8, y - 8, w + 16, h + 16, [246, 244, 238]);
  c.vgrad(x, y, w, h, [150, 204, 238], [214, 236, 232]);
  c.circle(x + w * 0.7, y + h * 0.3, 18, [255, 246, 210], 0.8);
  c.rect(x, y + h - 40, w, 40, [96, 160, 84]);
  c.rect(x + w / 2 - 2, y, 4, h, [246, 244, 238]);
  c.rect(x - 22, y - 14, 34, h + 40, curtain);
  c.rect(x + w - 12, y - 14, 34, h + 40, curtain);
  for (let k = 0; k < 4; k++) {
    c.rect(x - 22 + k * 9, y - 14, 2, h + 40, shade(curtain, -0.18), 0.6);
    c.rect(x + w - 12 + k * 9, y - 14, 2, h + 40, shade(curtain, -0.18), 0.6);
  }
  c.rect(x - 30, y - 22, w + 60, 6, [90, 70, 52]);
}

function drawLamp(c: Canvas, x: number, floorY: number, h: number): void {
  c.rect(x - 2, floorY - h, 4, h, [70, 66, 62]);
  c.ellipse(x, floorY - 2, 16, 4, BLACK, 0.2);
  c.poly(
    [
      [x - 24, floorY - h + 4],
      [x + 24, floorY - h + 4],
      [x + 14, floorY - h - 36],
      [x - 14, floorY - h - 36]
    ],
    [250, 232, 176]
  );
  c.circle(x, floorY - h - 14, 60, [255, 240, 190], 0.1);
}

function drawPlant(c: Canvas, x: number, floorY: number): void {
  c.poly(
    [
      [x - 18, floorY - 40],
      [x + 18, floorY - 40],
      [x + 12, floorY],
      [x - 12, floorY]
    ],
    [176, 100, 70]
  );
  for (let k = -3; k <= 3; k++)
    c.poly(
      [
        [x, floorY - 40],
        [x + k * 14 - 8, floorY - 90 - Math.abs(k) * -6],
        [x + k * 14 + 8, floorY - 96 + Math.abs(k) * 4]
      ],
      k % 2 === 0 ? [54, 130, 70] : [78, 150, 78]
    );
}

function drawFrame(c: Canvas, x: number, y: number, w: number, h: number, art: RGB): void {
  c.rect(x - 5, y - 5, w + 10, h + 10, [72, 56, 44]);
  c.rect(x, y, w, h, [248, 244, 234]);
  c.rect(x + 8, y + 8, w - 16, h - 16, art);
  c.circle(x + w * 0.65, y + h * 0.4, h * 0.2, shade(art, 0.4), 0.8);
  c.poly(
    [
      [x + 8, y + h - 8],
      [x + w * 0.4, y + h * 0.5],
      [x + w * 0.7, y + h - 8]
    ],
    shade(art, -0.3),
    0.8
  );
}

function drawSalon(c: Canvas, rng: Rng): void {
  const floorY = 380;
  const { wall } = interiorBase(c, rng, floorY);
  const accent = pickOf(rng, ACCENTS);
  const curtain = mix(accent, WHITE, 0.5);
  bigWindow(c, 90, 90, 190, 190, curtain);
  drawFrame(c, 470, 100, 120, 80, mix(accent, wall, 0.2));
  drawFrame(c, 612, 124, 70, 90, mix(pickOf(rng, ACCENTS), wall, 0.3));
  c.ellipse(470, 470, 270, 46, shade(accent, 0.1), 0.9); // tapis
  c.ellipse(470, 470, 220, 34, shade(accent, 0.3), 0.7);
  // canapé
  const sofa = mix(accent, [90, 90, 96], 0.4);
  c.ellipse(450, 392, 250, 12, BLACK, 0.22);
  c.rrect(280, 270, 340, 110, 22, shade(sofa, -0.12));
  c.rrect(262, 306, 70, 84, 20, sofa);
  c.rrect(568, 306, 70, 84, 20, sofa);
  c.rrect(318, 316, 264, 66, 14, shade(sofa, 0.1));
  c.rrect(330, 286, 110, 48, 14, shade(sofa, 0.28));
  c.rrect(460, 286, 110, 48, 14, shade(sofa, 0.28));
  c.rrect(284, 306, 40, 34, 10, [236, 196, 110]);
  // table basse
  c.rect(380, 428, 140, 12, [90, 66, 48]);
  c.rect(388, 440, 8, 34, [70, 52, 40]);
  c.rect(504, 440, 8, 34, [70, 52, 40]);
  c.rrect(418, 412, 40, 18, 4, [240, 236, 226]);
  drawLamp(c, 706, floorY + 10, 170);
  drawPlant(c, 40, floorY + 20);
}

function drawChambre(c: Canvas, rng: Rng): void {
  const floorY = 390;
  const { wall } = interiorBase(c, rng, floorY);
  const accent = pickOf(rng, ACCENTS);
  bigWindow(c, 570, 100, 150, 170, mix(accent, WHITE, 0.55));
  drawFrame(c, 80, 110, 110, 76, mix(accent, wall, 0.25));
  // lit
  c.ellipse(340, 452, 250, 18, BLACK, 0.22);
  c.rrect(150, 150, 380, 150, 12, shade(accent, -0.4)); // tête de lit
  c.rrect(170, 300, 340, 140, 10, [250, 248, 242]);
  c.rrect(170, 340, 340, 100, 10, shade(accent, 0.05));
  for (let k = 0; k < 5; k++) c.rect(200 + k * 62, 340, 4, 100, shade(accent, -0.2), 0.5);
  c.rrect(200, 286, 130, 46, 16, WHITE);
  c.rrect(350, 286, 130, 46, 16, [236, 240, 246]);
  c.rect(178, 440, 14, 18, [90, 66, 48]);
  c.rect(488, 440, 14, 18, [90, 66, 48]);
  // chevets et lampes
  for (const x of [88, 546]) {
    c.rect(x, 366, 60, 70, [120, 90, 64]);
    c.rect(x, 366, 60, 6, [146, 112, 82]);
    c.rect(x + 8, 384, 44, 2, shade([120, 90, 64], -0.3));
    c.poly(
      [
        [x + 14, 360],
        [x + 46, 360],
        [x + 38, 330],
        [x + 22, 330]
      ],
      [252, 232, 178]
    );
    c.circle(x + 30, 340, 40, [255, 240, 190], 0.1);
  }
  c.rect(0, 462, c.w, 71, BLACK, 0.06);
  c.ellipse(340, 490, 200, 24, mix(accent, WHITE, 0.4), 0.7);
}

function drawCuisine(c: Canvas, rng: Rng): void {
  const floorY = 400;
  const { wall } = interiorBase(c, rng, floorY);
  const accent = pickOf(rng, ACCENTS);
  const cab = mix(accent, WHITE, 0.55);
  c.rect(0, 150, c.w, 160, shade(wall, 0.2)); // crédence
  for (let x = 0; x < c.w; x += 40) c.rect(x, 150, 1, 160, shade(wall, -0.2), 0.6);
  for (let y = 150; y < 310; y += 40) c.rect(0, y, c.w, 1, shade(wall, -0.2), 0.6);
  bigWindow(c, 330, 170, 130, 110, mix(accent, WHITE, 0.6));
  // meubles hauts
  for (const [x, w] of [
    [0, 270],
    [520, 280]
  ]) {
    c.rect(x, 40, w, 100, shade(cab, -0.05));
    for (let k = 0; k < Math.round(w / 90); k++) {
      c.rect(x + 6 + k * 90, 46, 78, 88, shade(cab, 0.1));
      c.rect(x + 66 + k * 90, 84, 4, 18, [200, 200, 204]);
    }
  }
  // hotte
  c.poly(
    [
      [590, 150],
      [700, 150],
      [676, 108],
      [614, 108]
    ],
    [190, 194, 200]
  );
  // plan de travail et meubles bas
  c.rect(0, 310, c.w, 12, [226, 222, 214]);
  c.rect(0, 322, c.w, 80, shade(cab, -0.1));
  for (let k = 0; k < 9; k++) {
    c.rect(6 + k * 90, 328, 78, 66, shade(cab, 0.06));
    c.rect(34 + k * 90, 336, 22, 4, [200, 200, 204]);
  }
  // plaques et évier
  c.rect(560, 300, 110, 10, [40, 40, 44]);
  for (const x of [580, 650]) c.circle(x, 304, 10, [90, 90, 96]);
  c.rect(120, 304, 100, 8, [186, 190, 196]);
  c.rect(156, 280, 4, 26, [186, 190, 196]);
  c.rect(156, 280, 24, 4, [186, 190, 196]);
  // réfrigérateur
  c.rrect(700, 130, 90, 270, 8, [226, 230, 234]);
  c.rect(700, 250, 90, 3, [150, 154, 160]);
  c.rect(776, 180, 4, 50, [150, 154, 160]);
  c.rect(776, 290, 4, 60, [150, 154, 160]);
  // fruits et plante
  c.circle(236, 296, 9, [212, 70, 56]);
  c.circle(254, 298, 9, [236, 176, 56]);
  c.circle(245, 288, 9, [94, 160, 70]);
  c.rect(0, 462, c.w, 71, BLACK, 0.06);
}

function drawBureau(c: Canvas, rng: Rng): void {
  const floorY = 360;
  const { wall } = interiorBase(c, rng, floorY);
  const accent = pickOf(rng, ACCENTS);
  c.rect(60, 70, 680, 210, [148, 198, 232]);
  c.rect(60, 70, 680, 8, [240, 240, 244]);
  for (let k = 0; k < 4; k++) {
    c.rect(60 + k * 170, 70, 5, 210, [240, 240, 244]);
    c.poly(
      [
        [80 + k * 170, 280],
        [130 + k * 170, 70],
        [160 + k * 170, 70],
        [110 + k * 170, 280]
      ],
      WHITE,
      0.15
    );
  }
  for (let k = 0; k < 7; k++) c.rect(90 + k * 90, 220 - ((k * 37) % 50), 54, 60 + ((k * 37) % 50), [120, 150, 180]); // skyline
  c.rect(60, 280, 680, 6, [240, 240, 244]);
  drawFrame(c, 340, 296, 120, 44, mix(accent, wall, 0.3));
  // bureaux
  for (const x of [90, 430]) {
    c.ellipse(x + 130, 478, 150, 12, BLACK, 0.2);
    c.rect(x, 400, 260, 12, [186, 150, 112]);
    c.rect(x + 8, 412, 10, 70, [90, 90, 96]);
    c.rect(x + 242, 412, 10, 70, [90, 90, 96]);
    c.rect(x + 90, 350, 80, 50, [40, 44, 52]);
    c.rect(x + 94, 354, 72, 40, mix(accent, WHITE, 0.5));
    c.rect(x + 124, 400, 12, 8, [70, 70, 76]);
    c.rect(x + 30, 392, 40, 8, [236, 236, 240]);
    c.rrect(x + 90, 424, 80, 70, 14, shade(accent, -0.1));
    c.rect(x + 124, 490, 12, 22, [60, 60, 66]);
  }
  drawPlant(c, 40, 470);
}

// ---------------------------------------------------------------------------
// Rendu d'une image
// ---------------------------------------------------------------------------

/** Dessine une scène et renvoie le PNG. Ne dépend que de `propertyType`, `seedText` et `scene`. */
export function renderPropertyImage(propertyType: string, seedText: string, scene: Scene, variant: number): Buffer {
  const rng = createRng(seedFromString(`${seedText}:${scene}:${variant}`));
  const canvas = new Canvas(IMAGE_WIDTH, IMAGE_HEIGHT);
  switch (scene) {
    case 'SALON':
      drawSalon(canvas, rng);
      break;
    case 'CHAMBRE':
      drawChambre(canvas, rng);
      break;
    case 'CUISINE':
      drawCuisine(canvas, rng);
      break;
    case 'BUREAU':
      drawBureau(canvas, rng);
      break;
    default:
      drawExterior(canvas, propertyType, rng, variant);
  }
  return encodePng(IMAGE_WIDTH, IMAGE_HEIGHT, canvas.data);
}

const SCENE_LABEL: Record<Scene, string> = {
  EXTERIEUR: 'facade',
  SALON: 'salon',
  CHAMBRE: 'chambre',
  CUISINE: 'cuisine',
  BUREAU: 'bureau'
};

/** Plan des photos d'un bien : la principale (façade) puis 2 ou 3 de galerie. */
export function planScenes(propertyType: string, propertyId: string): Scene[] {
  const rng = createRng(seedFromString(`plan:${propertyId}`));
  const galleryCount = 2 + (rng() > 0.5 ? 1 : 0);
  const { kind } = kindOf(propertyType);
  let pool: Scene[];
  if (kind === 'MULTI' || kind === 'VILLA') pool = ['SALON', 'CHAMBRE', 'CUISINE'];
  else if (kind === 'OFFICE') pool = ['BUREAU', 'EXTERIEUR', 'EXTERIEUR'];
  else pool = ['EXTERIEUR', 'EXTERIEUR', 'EXTERIEUR'];
  const offset = Math.floor(rng() * pool.length);
  const rotated = pool.map((_, i) => pool[(i + offset) % pool.length]);
  return ['EXTERIEUR', ...rotated.slice(0, galleryCount)];
}

// ---------------------------------------------------------------------------
// Semis
// ---------------------------------------------------------------------------

export async function seedPropertyImages(ctx: HistoryContext): Promise<void> {
  // Import tardif : `env.ts` valide l'environnement (secrets JWT…) dès son chargement,
  // ce que les tests des encodeurs n'ont pas à subir.
  const { env } = await import('../../../src/config/env');
  const root = getUploadsRoot(env.UPLOADS_DIR);

  const properties = await ctx.prisma.property.findMany({
    where: { tenantId: ctx.tenantId, media: { none: {} } },
    select: { id: true, propertyType: true, title: true },
    orderBy: { id: 'asc' }
  });
  if (properties.length === 0) {
    ctx.log('images de biens : aucun bien sans média');
    return;
  }

  let done = 0;
  for (const property of properties) {
    try {
      const dir = path.join(root, 'properties', property.id);
      await fs.mkdir(dir, { recursive: true });
      const scenes = planScenes(property.propertyType, property.id);
      const rows = [];
      for (let i = 0; i < scenes.length; i++) {
        const png = renderPropertyImage(property.propertyType, property.id, scenes[i], i);
        const stored = `seed-${i + 1}-${SCENE_LABEL[scenes[i]]}.png`;
        const filePath = path.join(dir, stored);
        await fs.writeFile(filePath, png);
        rows.push({
          propertyId: property.id,
          tenantId: ctx.tenantId,
          mediaType: 'PHOTO' as const,
          filePath,
          fileUrl: `/uploads/properties/${property.id}/${stored}`,
          fileName: `${SCENE_LABEL[scenes[i]]}-${i + 1}.png`,
          fileSize: png.length,
          mimeType: 'image/png',
          displayOrder: i,
          isPrimary: i === 0
        });
      }
      await ctx.prisma.propertyMedia.createMany({ data: rows });
      done++;
    } catch (error) {
      ctx.log(
        `images de biens : bien ${property.id} ignoré (${error instanceof Error ? error.message : String(error)})`
      );
    }
  }
  ctx.log(`images de biens : ${done}/${properties.length} biens illustrés`);
}
