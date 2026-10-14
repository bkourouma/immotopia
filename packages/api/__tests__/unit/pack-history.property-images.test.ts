/**
 * Photos de démonstration des biens des agences de test : encodeur PNG,
 * déterminisme du dessin et plan des photos. Aucune base de données.
 */
import { inflateSync } from 'zlib';
import {
  IMAGE_HEIGHT,
  IMAGE_WIDTH,
  crc32,
  encodePng,
  planScenes,
  renderPropertyImage
} from '../../prisma/seeds/pack-history/property-images';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface Decoded {
  width: number;
  height: number;
  rgb: Buffer;
}

/** Relit un PNG RGB 8 bits (filtres 0 et 1) en vérifiant chaque CRC. */
function decode(png: Buffer): Decoded {
  expect(png.subarray(0, 8).equals(SIGNATURE)).toBe(true);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  let ended = false;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    const data = png.subarray(offset + 8, offset + 8 + length);
    const crc = png.readUInt32BE(offset + 8 + length);
    expect(crc32(png.subarray(offset + 4, offset + 8 + length))).toBe(crc);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect([data[8], data[9]]).toEqual([8, 2]);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') ended = true;
    offset += 12 + length;
  }
  expect(ended).toBe(true);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 3;
  expect(raw.length).toBe((stride + 1) * height);
  const rgb = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    expect([0, 1]).toContain(filter);
    for (let i = 0; i < stride; i++) {
      const v = raw[y * (stride + 1) + 1 + i];
      rgb[y * stride + i] = filter === 1 && i >= 3 ? (v + rgb[y * stride + i - 3]) & 0xff : v;
    }
  }
  return { width, height, rgb };
}

describe('crc32', () => {
  it('donne la valeur de référence de « 123456789 »', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });
});

describe('encodePng', () => {
  it('encode puis relit des pixels à l’identique', () => {
    const w = 5;
    const h = 4;
    const rgb = new Uint8Array(w * h * 3).map((_, i) => (i * 37 + 11) % 256);
    const out = decode(encodePng(w, h, rgb));
    expect([out.width, out.height]).toEqual([w, h]);
    expect(Buffer.from(rgb).equals(out.rgb)).toBe(true);
  });

  it('refuse un tampon de mauvaise taille', () => {
    expect(() => encodePng(2, 2, new Uint8Array(5))).toThrow();
  });
});

describe('renderPropertyImage', () => {
  const TYPES = [
    'APPARTEMENT',
    'MAISON_VILLA',
    'STUDIO',
    'DUPLEX_TRIPLEX',
    'CHAMBRE_COLOCATION',
    'BUREAU',
    'BOUTIQUE_COMMERCIAL',
    'ENTREPOT_INDUSTRIEL',
    'TERRAIN',
    'IMMEUBLE',
    'PARKING_BOX',
    'LOT_PROGRAMME_NEUF'
  ];

  it.each(TYPES)('dessine une façade valide pour %s, légère', type => {
    const png = renderPropertyImage(type, 'bien-1', 'EXTERIEUR', 0);
    const out = decode(png);
    expect([out.width, out.height]).toEqual([IMAGE_WIDTH, IMAGE_HEIGHT]);
    expect(png.length).toBeLessThan(400_000);
    // l'image n'est pas unie
    const colors = new Set<number>();
    for (let i = 0; i < out.rgb.length; i += 3) colors.add((out.rgb[i] << 16) | (out.rgb[i + 1] << 8) | out.rgb[i + 2]);
    expect(colors.size).toBeGreaterThan(100);
  });

  it.each(['SALON', 'CHAMBRE', 'CUISINE', 'BUREAU'] as const)('dessine l’intérieur %s', scene => {
    const out = decode(renderPropertyImage('APPARTEMENT', 'bien-2', scene, 1));
    expect([out.width, out.height]).toEqual([IMAGE_WIDTH, IMAGE_HEIGHT]);
  });

  it('est déterministe et varie selon le bien', () => {
    const a = renderPropertyImage('MAISON_VILLA', 'bien-a', 'EXTERIEUR', 0);
    expect(renderPropertyImage('MAISON_VILLA', 'bien-a', 'EXTERIEUR', 0).equals(a)).toBe(true);
    expect(renderPropertyImage('MAISON_VILLA', 'bien-b', 'EXTERIEUR', 0).equals(a)).toBe(false);
  });
});

describe('planScenes', () => {
  it('prévoit une façade principale puis 2 ou 3 photos de galerie, de façon stable', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const scenes = planScenes('APPARTEMENT', `id-${i}`);
      expect(scenes[0]).toBe('EXTERIEUR');
      expect(scenes.length).toBeGreaterThanOrEqual(3);
      expect(scenes.length).toBeLessThanOrEqual(4);
      expect(planScenes('APPARTEMENT', `id-${i}`)).toEqual(scenes);
      seen.add(scenes.length);
    }
    expect(seen.size).toBe(2);
  });

  it('réserve les intérieurs d’habitation aux biens résidentiels', () => {
    expect(
      planScenes('TERRAIN', 'x')
        .slice(1)
        .every(s => s === 'EXTERIEUR')
    ).toBe(true);
    expect(
      planScenes('MAISON_VILLA', 'x')
        .slice(1)
        .every(s => s !== 'EXTERIEUR')
    ).toBe(true);
  });
});
