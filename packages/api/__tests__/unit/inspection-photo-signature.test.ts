/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Recette gestion locative du 04/11/2026 — BUG-2026-11-04-026 :
 * photos d'état des lieux contrôlées par signature magique (JPEG, PNG, WebP).
 * Prisma et le disque sont simulés.
 */
const prismaMock: any = {
  rentalLease: { findFirst: jest.fn() },
  leaseInspection: { findFirst: jest.fn() },
  leaseInspectionPhoto: { create: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));

const writeFile = jest.fn();
const mkdir = jest.fn();
jest.mock('fs/promises', () => ({
  __esModule: true,
  writeFile: (...args: unknown[]) => writeFile(...args),
  mkdir: (...args: unknown[]) => mkdir(...args),
  unlink: jest.fn()
}));

import { addInspectionPhoto } from '../../src/lib/lease-inspections/service';
import { detectImageKind } from '../../src/utils/file-signature';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.alloc(4),
  Buffer.from('WEBP', 'latin1'),
  Buffer.alloc(8)
]);

const file = (buffer: Buffer, name = 'photo.jpg', mimetype = 'image/jpeg') =>
  ({ buffer, size: buffer.length, originalname: name, mimetype }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.rentalLease.findFirst.mockResolvedValue({ id: 'l' });
  prismaMock.leaseInspection.findFirst.mockResolvedValue({ id: 'i', status: 'DRAFT' });
  prismaMock.leaseInspectionPhoto.create.mockImplementation(async ({ data }: any) => ({
    id: 'p',
    createdAt: new Date(),
    ...data
  }));
});

describe('detectImageKind', () => {
  it('reconnaît JPEG, PNG et WebP', () => {
    expect(detectImageKind(JPEG)).toBe('jpg');
    expect(detectImageKind(PNG)).toBe('png');
    expect(detectImageKind(WEBP)).toBe('webp');
  });

  it('refuse vide, texte, HTML, GIF et PDF', () => {
    expect(detectImageKind(Buffer.alloc(0))).toBeNull();
    expect(detectImageKind(Buffer.from('faux jpeg de test'))).toBeNull();
    expect(detectImageKind(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(detectImageKind(Buffer.from('GIF89a......'))).toBeNull();
    expect(detectImageKind(Buffer.from('%PDF-1.4 ....'))).toBeNull();
    expect(detectImageKind(Buffer.from('RIFF....WAVE....'))).toBeNull();
  });
});

describe('addInspectionPhoto — contenu réel', () => {
  it.each([
    ['fichier vide', Buffer.alloc(0)],
    ['faux JPEG (texte)', Buffer.from('ceci est un faux jpeg')],
    ['HTML renommé en .jpg', Buffer.from('<script>alert(1)</script>')]
  ])('refuse un %s sans rien écrire (disque ni base)', async (_label, buffer) => {
    await expect(addInspectionPhoto('t', 'l', 'i', file(buffer), {}, 'u')).rejects.toMatchObject({
      status: 400,
      message: 'Type de fichier non autorisé. Formats acceptés : JPEG, PNG, WebP.'
    });
    expect(mkdir).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(prismaMock.leaseInspectionPhoto.create).not.toHaveBeenCalled();
  });

  it.each([
    ['JPEG', JPEG, 'image/jpeg', '.jpg'],
    ['PNG', PNG, 'image/png', '.png'],
    ['WebP', WEBP, 'image/webp', '.webp']
  ])('accepte un vrai %s et fixe type et extension d’après le contenu', async (_l, buffer, mime, ext) => {
    // Type déclaré et nom mensongers : seul le contenu compte.
    await addInspectionPhoto('t', 'l', 'i', file(buffer, 'x.html', 'image/png'), {}, 'u');
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(String(writeFile.mock.calls[0][0]).endsWith(ext)).toBe(true);
    expect(prismaMock.leaseInspectionPhoto.create.mock.calls[0][0].data.mimeType).toBe(mime);
    expect(prismaMock.leaseInspectionPhoto.create.mock.calls[0][0].data.tenantId).toBe('t');
  });
});
