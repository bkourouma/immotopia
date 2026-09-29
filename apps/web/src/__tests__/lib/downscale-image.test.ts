import { describe, it, expect, vi, afterEach } from 'vitest';
import { downscaleImageFile } from '../../utils/downscale-image';

/**
 * `downscaleImageFile` — réduction côté navigateur d'un logo/signature/cachet
 * avant envoi (voir `components/documents/BrandingImageField.tsx`). jsdom
 * n'a pas de véritable moteur canvas ni de décodeur d'image : chaque test
 * qui doit emprunter le chemin de réduction mocke explicitement
 * `HTMLCanvasElement.prototype.getContext`/`toBlob` et `createImageBitmap`.
 * Sans ces mocks (comme dans les suites qui montent `BrandingImageField`
 * sans les poser), `getContext('2d')` renvoie `null` dans jsdom et la
 * fonction rend aussitôt le fichier d'origine — c'est le cas « pas de
 * canvas » couvert ci-dessous.
 */

type CreateImageBitmapMock = ReturnType<typeof vi.fn>;

function mockCanvas(overrides: { toBlob?: (type: string) => Blob | null } = {}) {
  const drawImage = vi.fn();
  const ctx = { drawImage, imageSmoothingQuality: '' } as unknown as CanvasRenderingContext2D;
  // `push(this)` (un argument, pas une affectation) échappe à
  // `@typescript-eslint/no-this-alias`, qui ne repère que `x = this`.
  const capturedCanvases: HTMLCanvasElement[] = [];

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    capturedCanvases.push(this);
    return ctx;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext);

  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string
  ) {
    const blob = overrides.toBlob ? overrides.toBlob(type ?? 'image/png') : new Blob(['x'], { type });
    callback(blob);
  } as unknown as typeof HTMLCanvasElement.prototype.toBlob);

  return { drawImage, getCanvas: () => capturedCanvases[0] ?? null };
}

function mockCreateImageBitmap(bitmap: { width: number; height: number } | null): CreateImageBitmapMock {
  const close = vi.fn();
  const mock = vi.fn().mockImplementation(() => {
    if (!bitmap) {
      return Promise.reject(new Error('Image illisible'));
    }
    return Promise.resolve({ ...bitmap, close });
  });
  (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = mock;
  return mock;
}

describe('downscaleImageFile', () => {
  const originalCreateImageBitmap = (globalThis as unknown as { createImageBitmap?: unknown }).createImageBitmap;

  afterEach(() => {
    vi.restoreAllMocks();
    (globalThis as unknown as { createImageBitmap?: unknown }).createImageBitmap = originalCreateImageBitmap;
  });

  it('réduit une image PNG plus grande que maxSide en gardant les proportions', async () => {
    mockCreateImageBitmap({ width: 3000, height: 1500 });
    const { drawImage, getCanvas } = mockCanvas();

    const original = new File([new Uint8Array(10)], 'logo.png', { type: 'image/png' });
    const result = await downscaleImageFile(original, 800);

    expect(result).not.toBe(original);
    expect(result.name).toBe('logo.png');
    expect(result.type).toBe('image/png');
    expect(getCanvas()?.width).toBe(800);
    expect(getCanvas()?.height).toBe(400);
    expect(drawImage).toHaveBeenCalledWith(expect.objectContaining({ width: 3000, height: 1500 }), 0, 0, 800, 400);
  });

  it('utilise la qualité 0.9 pour une image JPEG réduite', async () => {
    mockCreateImageBitmap({ width: 1600, height: 1600 });
    let receivedType: string | undefined;
    let receivedQuality: unknown;
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
      imageSmoothingQuality: ''
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      callback: BlobCallback,
      type?: string,
      quality?: unknown
    ) {
      receivedType = type;
      receivedQuality = quality;
      callback(new Blob(['x'], { type }));
    } as typeof HTMLCanvasElement.prototype.toBlob);

    const original = new File([new Uint8Array(10)], 'signature.jpg', { type: 'image/jpeg' });
    const result = await downscaleImageFile(original, 800);

    expect(result.type).toBe('image/jpeg');
    expect(receivedType).toBe('image/jpeg');
    expect(receivedQuality).toBe(0.9);
  });

  it('renvoie le fichier d’origine (même objet) quand il ne dépasse pas maxSide', async () => {
    mockCreateImageBitmap({ width: 400, height: 300 });
    mockCanvas();

    const original = new File(['contenu'], 'logo.png', { type: 'image/png' });
    const result = await downscaleImageFile(original, 800);

    expect(result).toBe(original);
  });

  it('renvoie le fichier d’origine sans y toucher pour un type non pris en charge', async () => {
    const bitmapMock = mockCreateImageBitmap({ width: 3000, height: 3000 });

    const original = new File(['contenu'], 'document.pdf', { type: 'application/pdf' });
    const result = await downscaleImageFile(original, 800);

    expect(result).toBe(original);
    expect(bitmapMock).not.toHaveBeenCalled();
  });

  it('renvoie le fichier d’origine quand le canvas est indisponible (pas de support navigateur)', async () => {
    mockCreateImageBitmap({ width: 3000, height: 3000 });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    const original = new File(['contenu'], 'logo.png', { type: 'image/png' });
    const result = await downscaleImageFile(original, 800);

    expect(result).toBe(original);
  });

  it('renvoie le fichier d’origine quand `getContext` lève une exception', async () => {
    mockCreateImageBitmap({ width: 3000, height: 3000 });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('contexte indisponible');
    });

    const original = new File(['contenu'], 'logo.png', { type: 'image/png' });
    const result = await downscaleImageFile(original, 800);

    expect(result).toBe(original);
  });

  it('renvoie le fichier d’origine quand l’image est illisible', async () => {
    mockCreateImageBitmap(null);
    mockCanvas();

    const original = new File([new Uint8Array(10)], 'logo.png', { type: 'image/png' });
    const result = await downscaleImageFile(original, 800);

    expect(result).toBe(original);
  });

  it('renvoie le fichier d’origine quand `toBlob` ne produit rien', async () => {
    mockCreateImageBitmap({ width: 3000, height: 3000 });
    mockCanvas({ toBlob: () => null });

    const original = new File([new Uint8Array(10)], 'logo.png', { type: 'image/png' });
    const result = await downscaleImageFile(original, 800);

    expect(result).toBe(original);
  });
});
