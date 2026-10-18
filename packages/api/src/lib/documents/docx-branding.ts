import PizZip from 'pizzip';
import { logger } from '../../utils/logger';
import { t } from '../../i18n';
import type { DocumentBranding, DocumentImage } from './document-branding';

/**
 * Identité et logos des documents DOCX.
 *
 * Deux services :
 * 1. le contexte commun (`buildCommonDocumentContext`) : balises `EMETTEUR_*`,
 *    `COPROPRIETE_*`, `DATE_EMISSION_DOCUMENT`, `REFERENCE_DOCUMENT`, offertes
 *    à TOUS les modèles DOCX ;
 * 2. l'injection des images (`injectDocxImages`) : après le rendu docxtemplater,
 *    chaque marqueur `{{LOGO_EMETTEUR}}`, `{{LOGO_COPROPRIETE}}`,
 *    `{{SIGNATURE_EMETTEUR}}` ou `{{CACHET_EMETTEUR}}` est remplacé
 *    par un vrai dessin (word/media, relation, type de contenu). Sans image, le
 *    marqueur disparaît.
 *
 * `docxtemplater-image-module-free` n'est volontairement PAS utilisé : il
 * plante au rendu avec docxtemplater 3.67 et tire `xmldom` 0.1.x, vulnérable
 * (CVE-2021-21366). L'injection se fait directement dans le zip avec pizzip.
 */

export type DocxImageKey = 'LOGO_EMETTEUR' | 'LOGO_COPROPRIETE' | 'SIGNATURE_EMETTEUR' | 'CACHET_EMETTEUR';
export const DOCX_IMAGE_KEYS: readonly DocxImageKey[] = [
  'LOGO_EMETTEUR',
  'LOGO_COPROPRIETE',
  'SIGNATURE_EMETTEUR',
  'CACHET_EMETTEUR'
];
export type DocxImages = Partial<Record<DocxImageKey, DocumentImage | null>>;

/** Clé réservée du contexte qui porte les images (retirée avant le rendu des textes). */
export const DOCX_IMAGES_CONTEXT_KEY = '__images';

/**
 * Bornes d'un logo dans le document : environ 2,5 cm de haut, 3,4 cm de large
 * (la cellule d'un coin de l'en-tête standard offre 2100 twips utiles, soit
 * ~3,7 cm : le logo doit y tenir sans élargir la cellule).
 */
const EMU_PER_CM = 360000;
const MAX_LOGO_HEIGHT_EMU = Math.round(2.5 * EMU_PER_CM);
const MAX_LOGO_WIDTH_EMU = Math.round(3.4 * EMU_PER_CM);
const LOGO_BOX = { width: MAX_LOGO_WIDTH_EMU, height: MAX_LOGO_HEIGHT_EMU };
/** Signature : 4 cm x 2 cm ; cachet : 3 cm x 3 cm (les deux côte à côte tiennent dans une demi-largeur utile). */
const SIGNATURE_BOX = { width: Math.round(4 * EMU_PER_CM), height: Math.round(2 * EMU_PER_CM) };
const STAMP_BOX = { width: Math.round(3 * EMU_PER_CM), height: Math.round(3 * EMU_PER_CM) };

/** Boîte d'affichage maximale (EMU) de chaque image. */
const BOX_BY_KEY: Record<DocxImageKey, { width: number; height: number }> = {
  LOGO_EMETTEUR: LOGO_BOX,
  LOGO_COPROPRIETE: LOGO_BOX,
  SIGNATURE_EMETTEUR: SIGNATURE_BOX,
  CACHET_EMETTEUR: STAMP_BOX
};
/** 96 points par pouce : un pixel vaut 9525 EMU (taille naturelle de l'image). */
const EMU_PER_PIXEL = 9525;

const markerOf = (key: DocxImageKey): string => `@@${key}@@`;

/** Valeurs de contexte qui posent les marqueurs d'image (logos, signature, cachet) dans le texte rendu. */
export function logoMarkerContext(): Record<DocxImageKey, string> {
  return {
    LOGO_EMETTEUR: markerOf('LOGO_EMETTEUR'),
    LOGO_COPROPRIETE: markerOf('LOGO_COPROPRIETE'),
    SIGNATURE_EMETTEUR: markerOf('SIGNATURE_EMETTEUR'),
    CACHET_EMETTEUR: markerOf('CACHET_EMETTEUR')
  };
}

/**
 * Balises dont la valeur vide reste vide dans le document (au lieu de
 * `{{NOM}}`, motif réservé aux données métier manquantes) : identité de
 * l'émetteur, copropriété, logos, référence et date du document.
 */
export function isOptionalBrandingKey(key: string): boolean {
  return (
    key.startsWith('EMETTEUR_') ||
    key.startsWith('COPROPRIETE_') ||
    key.startsWith('LOGO_') ||
    key === 'SIGNATURE_EMETTEUR' ||
    key === 'CACHET_EMETTEUR' ||
    key === 'DATE_EMISSION_DOCUMENT' ||
    key === 'REFERENCE_DOCUMENT'
  );
}

// ------------------------------------------------------------- contexte commun

const text = (value: string | null | undefined): string => value?.trim() ?? '';
const joinPresent = (parts: Array<string | null | undefined>, separator = ' · '): string =>
  parts
    .map(text)
    .filter(part => part.length > 0)
    .join(separator);

/** Balises d'identité de l'émetteur (mandant de la copropriété, sinon l'agence). */
export function buildIssuerContext(branding?: DocumentBranding | null): Record<string, string> {
  const issuer = branding?.issuer;
  const phone = text(issuer?.phone);
  const legal = joinPresent([
    issuer?.rccm ? `RCCM ${issuer.rccm}` : null,
    issuer?.taxId ? `NCC ${issuer.taxId}` : null
  ]);
  return {
    EMETTEUR_NOM: issuer?.name ?? '',
    EMETTEUR_RAISON_SOCIALE: issuer?.legalName ?? issuer?.name ?? '',
    EMETTEUR_ADRESSE: issuer?.address ?? '',
    EMETTEUR_TELEPHONE: issuer?.phone ?? '',
    EMETTEUR_EMAIL: issuer?.email ?? '',
    EMETTEUR_RCCM: issuer?.rccm ?? '',
    EMETTEUR_NCC: issuer?.taxId ?? '',
    EMETTEUR_CONTACT: joinPresent([phone ? `${t('Tél.')} ${phone}` : null, issuer?.email]),
    EMETTEUR_MENTIONS_LEGALES: legal,
    EMETTEUR_PIED_DE_PAGE: joinPresent([issuer?.name, legal])
  };
}

/** Balises de la copropriété (vides quand le document n'en concerne pas). */
export function buildSyndicateContext(branding?: DocumentBranding | null): Record<string, string> {
  const syndicate = branding?.syndicate;
  return {
    COPROPRIETE_NOM: syndicate?.name ?? '',
    COPROPRIETE_ADRESSE: syndicate?.address ?? '',
    COPROPRIETE_IMMATRICULATION: syndicate?.registrationNo ?? '',
    COPROPRIETE_REFERENCE_CADASTRALE: syndicate?.cadastralReference ?? '',
    COPROPRIETE_REFERENCES: joinPresent([
      syndicate?.registrationNo ? `${t('Immatriculation')} ${syndicate.registrationNo}` : null,
      syndicate?.cadastralReference ? `${t('Réf. cadastrale')} ${syndicate.cadastralReference}` : null
    ])
  };
}

/** Images du contexte : logos de l'émetteur et de la copropriété, signature et cachet de l'émetteur. */
export function brandingImages(branding?: DocumentBranding | null): DocxImages {
  return {
    LOGO_EMETTEUR: branding?.issuerLogo ?? null,
    LOGO_COPROPRIETE: branding?.syndicate?.logo ?? null,
    SIGNATURE_EMETTEUR: branding?.signature ?? null,
    CACHET_EMETTEUR: branding?.stamp ?? null
  };
}

export interface CommonContextOptions {
  /** Numéro ou référence du document (bail, quittance, relevé, assemblée…). */
  reference?: string | null;
  /** Date d'émission ; aujourd'hui par défaut. */
  emittedAt?: Date;
}

/**
 * Contexte commun à TOUS les modèles DOCX : émetteur, copropriété, date et
 * référence du document, plus les images (clé réservée, retirée au rendu).
 */
export function buildCommonDocumentContext(
  branding?: DocumentBranding | null,
  options: CommonContextOptions = {}
): Record<string, unknown> {
  return {
    ...buildIssuerContext(branding),
    ...buildSyndicateContext(branding),
    DATE_EMISSION_DOCUMENT: (options.emittedAt ?? new Date()).toLocaleDateString('fr-FR'),
    REFERENCE_DOCUMENT: text(options.reference),
    [DOCX_IMAGES_CONTEXT_KEY]: brandingImages(branding)
  };
}

// ------------------------------------------------------------ taille d'image

export interface ImageSize {
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 24 || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Marqueurs JPEG « start of frame » (hors DHT, JPG et DAC). */
const isJpegFrame = (marker: number): boolean =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

function jpegSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (isJpegFrame(marker)) {
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8]
      };
    }
    offset += 2 + ((bytes[offset + 2] << 8) | bytes[offset + 3]);
  }
  return null;
}

/** Dimensions en pixels, lues dans l'en-tête du fichier ; `null` si illisibles. */
export function readImageSize(image: DocumentImage): ImageSize | null {
  const size = image.format === 'png' ? pngSize(image.bytes) : jpegSize(image.bytes);
  return size && size.width > 0 && size.height > 0 ? size : null;
}

/** Taille d'affichage en EMU : bornée à la boîte donnée, proportions conservées, jamais agrandie. */
export function fitImageEmu(size: ImageSize, box: { width: number; height: number }): { cx: number; cy: number } {
  const scale = Math.min(box.width / (size.width * EMU_PER_PIXEL), box.height / (size.height * EMU_PER_PIXEL), 1);
  return {
    cx: Math.max(1, Math.round(size.width * EMU_PER_PIXEL * scale)),
    cy: Math.max(1, Math.round(size.height * EMU_PER_PIXEL * scale))
  };
}

/** Taille d'affichage d'un logo (boîte 3,4 x 2,5 cm). */
export const fitLogoEmu = (size: ImageSize): { cx: number; cy: number } => fitImageEmu(size, LOGO_BOX);

// ------------------------------------------------------------------ injection

const NS_WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL_IMAGE = `${NS_R}/image`;
const REL_PACKAGE = 'http://schemas.openxmlformats.org/package/2006/relationships';

/** Dessin inline d'une image déjà reliée sous `relId`. */
function drawingXml(relId: string, name: string, drawingId: number, cx: number, cy: number): string {
  return (
    `<w:drawing><wp:inline xmlns:wp="${NS_WP}" distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${drawingId}" name="${name}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${NS_A}" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="${NS_A}"><a:graphicData uri="${NS_PIC}">` +
    `<pic:pic xmlns:pic="${NS_PIC}"><pic:nvPicPr><pic:cNvPr id="${drawingId}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip xmlns:r="${NS_R}" r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
    `</a:graphicData></a:graphic></wp:inline></w:drawing>`
  );
}

const MIME_BY_FORMAT = { png: 'image/png', jpg: 'image/jpeg' } as const;
const EXTENSION_BY_FORMAT = { png: 'png', jpg: 'jpeg' } as const;

/**
 * Déclare le type de contenu de l'extension si le modèle ne le fait pas déjà.
 * Renvoie `false` quand le zip n'a pas de `[Content_Types].xml` : l'image ne
 * peut alors pas être déclarée (Word refuserait d'ouvrir le fichier).
 */
function ensureContentType(zip: PizZip, image: DocumentImage): boolean {
  const file = zip.file('[Content_Types].xml');
  if (!file) return false;
  const extension = EXTENSION_BY_FORMAT[image.format];
  const xml = file.asText();
  if (new RegExp(`<Default[^>]+Extension="${extension}"`, 'i').test(xml)) return true;
  const declaration = `<Default Extension="${extension}" ContentType="${MIME_BY_FORMAT[image.format]}"/>`;
  zip.file('[Content_Types].xml', xml.replace(/(<Types[^>]*>)/, `$1${declaration}`));
  return true;
}

/** Chemin des relations d'une partie (`word/header1.xml` → `word/_rels/header1.xml.rels`). */
const relsPathOf = (partPath: string): string => partPath.replace(/^(.*\/)([^/]+)$/, '$1_rels/$2.rels');

/**
 * Ajoute une relation image à la partie et renvoie son identifiant, ou `null`
 * si le fichier de relations existant n'a pas la forme attendue.
 */
function addImageRelation(zip: PizZip, partPath: string, mediaName: string, index: number): string | null {
  const relsPath = relsPathOf(partPath);
  const relId = `rIdImmoLogo${index}`;
  const current = zip.file(relsPath)?.asText();
  const relation = `<Relationship Id="${relId}" Type="${REL_IMAGE}" Target="media/${mediaName}"/>`;
  let next: string;
  if (current === undefined) {
    next = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${REL_PACKAGE}">${relation}</Relationships>`;
  } else if (/<\/Relationships>\s*$/.test(current)) {
    next = current.replace(/<\/Relationships>\s*$/, `${relation}</Relationships>`);
  } else if (/<Relationships\b[^>]*\/>\s*$/.test(current)) {
    // Fichier de relations vide, balise auto-fermante : <Relationships xmlns="…"/>.
    next = current.replace(/<Relationships\b([^>]*?)\s*\/>\s*$/, `<Relationships$1>${relation}</Relationships>`);
  } else {
    logger.error('DOCX logo ignored: unreadable relationships file', { relsPath });
    return null;
  }
  zip.file(relsPath, next);
  return relId;
}

/** Parties du zip qui peuvent porter un marqueur : corps, en-têtes, pieds de page. */
function contentParts(zip: PizZip): string[] {
  return zip
    .file(/^word\/(document|header\d*|footer\d*)\.xml$/)
    .map(file => file.name)
    .sort();
}

interface LogoAsset {
  key: DocxImageKey;
  mediaName: string;
  cx: number;
  cy: number;
}

/** Écrit chaque image exploitable dans word/media et renvoie ses références. */
function writeMedia(zip: PizZip, images: DocxImages): LogoAsset[] {
  const assets: LogoAsset[] = [];
  for (const key of DOCX_IMAGE_KEYS) {
    const image = images[key];
    const size = image ? readImageSize(image) : null;
    if (!image || !size) {
      if (image) logger.warn('DOCX logo ignored: unreadable image header', { key });
      continue;
    }
    if (!ensureContentType(zip, image)) {
      // Sans [Content_Types].xml le paquet n'est pas un DOCX valide : pas d'image, le marqueur sera retiré.
      logger.error('DOCX logo ignored: [Content_Types].xml is missing', { key });
      continue;
    }
    const mediaName = `${key.toLowerCase()}.${EXTENSION_BY_FORMAT[image.format]}`;
    zip.file(`word/media/${mediaName}`, Buffer.from(image.bytes));
    assets.push({ key, mediaName, ...fitImageEmu(size, BOX_BY_KEY[key]) });
  }
  return assets;
}

/**
 * Remplace les marqueurs de logo du zip rendu par des dessins inline ; un
 * marqueur sans image (ou toute balise `{{LOGO_…}}` restée en clair) est supprimé.
 */
export function injectDocxImages(zip: PizZip, images: DocxImages): void {
  // Seules les images dont le marqueur figure dans le modèle sont embarquées : un modèle sans marqueur reste intact.
  const texts = contentParts(zip).map(part => zip.file(part)!.asText());
  const used = (key: DocxImageKey): boolean => texts.some(xml => xml.includes(markerOf(key)));
  const assets = writeMedia(
    zip,
    Object.fromEntries(DOCX_IMAGE_KEYS.filter(used).map(key => [key, images[key]])) as DocxImages
  );
  let drawingId = 9000;
  let relIndex = 0;
  for (const partPath of contentParts(zip)) {
    let xml = zip.file(partPath)!.asText();
    const original = xml;
    for (const asset of assets) {
      const marker = markerOf(asset.key);
      if (!xml.includes(marker)) continue;
      const relId = addImageRelation(zip, partPath, asset.mediaName, (relIndex += 1));
      // Relation impossible : le marqueur est retiré plus bas, sans image.
      if (!relId) continue;
      // Un identifiant de dessin distinct par marqueur (Word le veut unique dans le document).
      xml = xml.split(marker).reduce((acc, piece, index) => {
        if (index === 0) return piece;
        // Le marqueur est dans un <w:t> : on ferme le texte, on pose le dessin, on rouvre le texte.
        const drawing = drawingXml(relId, asset.mediaName, (drawingId += 1), asset.cx, asset.cy);
        return `${acc}</w:t></w:r><w:r>${drawing}</w:r><w:r><w:t xml:space="preserve">${piece}`;
      }, '');
    }
    xml = DOCX_IMAGE_KEYS.reduce((acc, key) => acc.split(markerOf(key)).join(''), xml);
    xml = xml.replace(/\{\{(?:LOGO_[A-Z_]+|SIGNATURE_EMETTEUR|CACHET_EMETTEUR)\}\}/g, '');
    if (xml !== original) zip.file(partPath, xml);
  }
}
