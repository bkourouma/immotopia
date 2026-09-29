import { t } from '../i18n/t';
/**
 * Réduit une image PNG/JPEG côté navigateur avant son envoi.
 *
 * Les images de marque (logo, signature, cachet) sont acceptées jusqu'à
 * 3000 × 3000 px / 2 Mo et incrustées telles quelles dans chaque PDF de
 * quittance par `pdf-lib` côté serveur, qui n'a pas de bibliothèque d'image :
 * avec un logo de 3000 × 3000, la génération d'une seule quittance prend 5 à
 * 39 s (décodage PNG + recompression en JS pur). Sur le document, ces images
 * s'affichent sur quelques centimètres : 800 px de grand côté suffit
 * largement. Réduire avant l'envoi évite ce coût côté serveur.
 *
 * Best-effort et silencieux : si le navigateur ne sait pas décoder ou
 * redimensionner l'image (pas de canvas, `toBlob` indisponible ou nul,
 * fichier illisible), la fonction renvoie le fichier d'origine sans lever
 * d'erreur — le serveur garde ses propres contrôles de taille et de
 * dimensions (`packages/api/src/lib/documents/branding-storage.ts`).
 */

const DOWNSCALABLE_TYPES = new Set(['image/png', 'image/jpeg']);
const JPEG_QUALITY = 0.9;

type DecodedImage =
  | { kind: 'bitmap'; source: ImageBitmap; width: number; height: number }
  | { kind: 'element'; source: HTMLImageElement; objectUrl: string; width: number; height: number };

export async function downscaleImageFile(file: File, maxSide = 800): Promise<File> {
  if (!DOWNSCALABLE_TYPES.has(file.type)) {
    return file;
  }

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null;
  try {
    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');
  } catch {
    return file;
  }
  if (!ctx) {
    return file;
  }

  const decoded = await decodeImage(file);
  if (!decoded) {
    return file;
  }

  try {
    const { width, height } = decoded;
    if (!width || !height || Math.max(width, height) <= maxSide) {
      return file;
    }

    const scale = maxSide / Math.max(width, height);
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(decoded.source, 0, 0, targetWidth, targetHeight);

    const blob = await canvasToBlob(canvas, file.type);
    if (!blob) {
      return file;
    }

    return new File([blob], file.name, { type: file.type });
  } catch {
    return file;
  } finally {
    if (decoded.kind === 'bitmap') {
      decoded.source.close();
    } else {
      URL.revokeObjectURL(decoded.objectUrl);
    }
  }
}

/**
 * `createImageBitmap` quand il existe (pas de fuite d'URL à gérer) ; sinon
 * repli sur `<img>` + URL d'objet, libérée après lecture des dimensions.
 * Renvoie `null` — jamais une exception — quand le décodage échoue, pour que
 * l'appelant se contente de garder le fichier d'origine.
 */
async function decodeImage(file: File): Promise<DecodedImage | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return { kind: 'bitmap', source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      return null;
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const element = await loadImageElement(objectUrl);
    return {
      kind: 'element',
      source: element,
      objectUrl,
      width: element.naturalWidth,
      height: element.naturalHeight
    };
  } catch {
    URL.revokeObjectURL(objectUrl);
    return null;
  }
}

function loadImageElement(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(t('Image illisible')));
    img.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise(resolve => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(null);
      return;
    }
    canvas.toBlob(blob => resolve(blob), type, type === 'image/jpeg' ? JPEG_QUALITY : undefined);
  });
}
