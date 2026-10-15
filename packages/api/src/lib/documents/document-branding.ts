import * as path from 'path';
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { privateUploadPath, privateUploadReadRoots } from '../files/private-files';
import { t } from '../../i18n';
import { pdfLanguage, sanitizeForPdf } from './pdf-text';
import { readBrandingImage, readImageFile, type BrandingImage } from './branding-storage';

/**
 * Identité des documents émis (lot S1, besoin 7).
 *
 * Règle : un document émis pour une copropriété rattachée à une agence
 * mandante porte l'identité du MANDANT (logo, nom, coordonnées, signature,
 * cachet) ; sans mandant, celle de l'AGENCE (le tenant). Aucune mention du
 * cabinet en sous-traitance (choix par défaut du plan, réversible). Le logo et
 * les références de la copropriété s'y ajoutent quand elle est connue.
 *
 * Les images sont lues depuis le stockage privé (`branding-storage.ts`) ; le
 * logo de l'agence, lui, reste le fichier public de `Tenant.logoUrl`. Un
 * fichier manquant ou illisible donne `null`, jamais une erreur : un document
 * sort toujours, au pire sans image.
 */

export type DocumentImage = BrandingImage;

export interface DocumentIssuer {
  kind: 'MANDANT' | 'AGENCY';
  name: string;
  legalName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  rccm: string | null;
  taxId: string | null;
}

export interface DocumentBranding {
  issuer: DocumentIssuer;
  issuerLogo: DocumentImage | null;
  signature: DocumentImage | null;
  stamp: DocumentImage | null;
  syndicate: {
    name: string;
    address: string | null;
    registrationNo: string | null;
    cadastralReference: string | null;
    logo: DocumentImage | null;
  } | null;
  /**
   * Lot S3 : émetteur et clés de stockage des images, lus dans la MÊME
   * lecture que les images elles-mêmes. Un document figé compare ces clés à
   * celles qu'il a notées à l'émission avant d'apposer une image (une clé
   * est régénérée à chaque dépôt : elle identifie un fichier précis).
   */
  source?: DocumentBrandingSource;
}

export interface DocumentBrandingSource {
  /** Identifiant du mandant, ou `AGENCY`. */
  issuerKey: string;
  logoKey: string | null;
  signatureKey: string | null;
  stampKey: string | null;
}

/** Lit le logo public de l'agence (`/uploads/properties/agency-logos/<tenantId>/<fichier>`). */
async function readTenantLogo(tenantId: string, logoUrl: string | null): Promise<DocumentImage | null> {
  const relative = privateUploadPath(logoUrl, ['properties', 'agency-logos', tenantId]);
  if (!relative) return null;
  for (const root of privateUploadReadRoots()) {
    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(path.resolve(root) + path.sep)) continue;
    const image = await readImageFile(absolute);
    if (image) return image;
  }
  return null;
}

const emptyToNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** Champs d'un mandant lus pour son identité (partagés avec les reçus du lot S3). */
export const MANDANT_IDENTITY_SELECT = {
  name: true,
  legalName: true,
  address: true,
  phone: true,
  email: true,
  rccm: true,
  taxId: true
} as const;

/** Champs de l'agence lus pour son identité (partagés avec les reçus du lot S3). */
export const TENANT_IDENTITY_SELECT = {
  name: true,
  legalName: true,
  address: true,
  city: true,
  country: true,
  contactPhone: true,
  contactEmail: true,
  financeSettings: { select: { taxpayerNumber: true } }
} as const;

type NullableText = string | null | undefined;

/** Identité textuelle d'un mandant. */
export function issuerFromMandant(mandant: {
  name: string;
  legalName: NullableText;
  address: NullableText;
  phone: NullableText;
  email: NullableText;
  rccm: NullableText;
  taxId: NullableText;
}): DocumentIssuer {
  return {
    kind: 'MANDANT',
    name: mandant.name,
    legalName: emptyToNull(mandant.legalName),
    address: emptyToNull(mandant.address),
    phone: emptyToNull(mandant.phone),
    email: emptyToNull(mandant.email),
    rccm: emptyToNull(mandant.rccm),
    taxId: emptyToNull(mandant.taxId)
  };
}

/** Identité textuelle de l'agence (le tenant). */
export function issuerFromTenant(
  tenant: {
    name: string;
    legalName: NullableText;
    address: NullableText;
    city: NullableText;
    country: NullableText;
    contactPhone: NullableText;
    contactEmail: NullableText;
    financeSettings?: { taxpayerNumber: NullableText } | null;
  } | null
): DocumentIssuer {
  // Ville et pays déjà écrits dans l'adresse saisie ne sont pas répétés.
  const addressParts: string[] = [];
  for (const part of [tenant?.address, tenant?.city, tenant?.country].map(emptyToNull)) {
    if (!part) continue;
    const already = addressParts.join(', ').toLocaleLowerCase('fr');
    if (addressParts.length > 0 && already.includes(part.toLocaleLowerCase('fr'))) continue;
    addressParts.push(part);
  }
  const address = addressParts.join(', ');
  return {
    kind: 'AGENCY',
    name: tenant?.name ?? '',
    legalName: emptyToNull(tenant?.legalName),
    address: address || null,
    phone: emptyToNull(tenant?.contactPhone),
    email: emptyToNull(tenant?.contactEmail),
    // L'agence n'a pas encore de champ RCCM (hors périmètre S1).
    rccm: null,
    taxId: emptyToNull(tenant?.financeSettings?.taxpayerNumber)
  };
}

/**
 * Identité à apposer sur un document de l'agence `tenantId`, pour la
 * copropriété `syndicateId` (ou aucune). Une copropriété d'une autre agence
 * est ignorée comme si elle n'existait pas : l'en-tête retombe sur l'agence.
 */
export async function resolveDocumentBranding(tenantId: string, syndicateId: string | null): Promise<DocumentBranding> {
  const syndicate = syndicateId
    ? await prisma.syndicate.findFirst({
        where: { id: syndicateId, tenantId },
        select: {
          name: true,
          address: true,
          registrationNo: true,
          cadastralReference: true,
          logoPath: true,
          mandatingAgencyId: true,
          mandatingAgency: {
            select: {
              name: true,
              legalName: true,
              address: true,
              phone: true,
              email: true,
              rccm: true,
              taxId: true,
              logoPath: true,
              signaturePath: true,
              stampPath: true
            }
          }
        }
      })
    : null;

  const syndicateBlock = syndicate
    ? {
        name: syndicate.name,
        address: emptyToNull(syndicate.address),
        registrationNo: emptyToNull(syndicate.registrationNo),
        cadastralReference: emptyToNull(syndicate.cadastralReference),
        logo: await readBrandingImage(tenantId, syndicate.logoPath)
      }
    : null;

  const mandant = syndicate?.mandatingAgency;
  if (mandant) {
    const [issuerLogo, signature, stamp] = await Promise.all([
      readBrandingImage(tenantId, mandant.logoPath),
      readBrandingImage(tenantId, mandant.signaturePath),
      readBrandingImage(tenantId, mandant.stampPath)
    ]);
    return {
      issuer: issuerFromMandant(mandant),
      issuerLogo,
      signature,
      stamp,
      syndicate: syndicateBlock,
      source: {
        issuerKey: syndicate?.mandatingAgencyId ?? 'AGENCY',
        logoKey: mandant.logoPath ?? null,
        signatureKey: mandant.signaturePath ?? null,
        stampKey: mandant.stampPath ?? null
      }
    };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true,
      legalName: true,
      address: true,
      city: true,
      country: true,
      contactPhone: true,
      contactEmail: true,
      logoUrl: true,
      documentSignaturePath: true,
      documentStampPath: true,
      financeSettings: { select: { taxpayerNumber: true } }
    }
  });

  const [issuerLogo, signature, stamp] = await Promise.all([
    readTenantLogo(tenantId, tenant?.logoUrl ?? null),
    readBrandingImage(tenantId, tenant?.documentSignaturePath),
    readBrandingImage(tenantId, tenant?.documentStampPath)
  ]);

  return {
    issuer: issuerFromTenant(tenant),
    issuerLogo,
    signature,
    stamp,
    syndicate: syndicateBlock,
    source: {
      issuerKey: 'AGENCY',
      logoKey: tenant?.logoUrl ?? null,
      signatureKey: tenant?.documentSignaturePath ?? null,
      stampKey: tenant?.documentStampPath ?? null
    }
  };
}

// ---------------------------------------------------------------- pdf-lib

const fontCache = new WeakMap<PDFDocument, Promise<{ regular: PDFFont; bold: PDFFont }>>();

export function fontsOf(pdfDoc: PDFDocument) {
  let fonts = fontCache.get(pdfDoc);
  if (!fonts) {
    fonts = Promise.all([
      pdfDoc.embedFont(StandardFonts.Helvetica),
      pdfDoc.embedFont(StandardFonts.HelveticaBold)
    ]).then(([regular, bold]) => ({ regular, bold }));
    fontCache.set(pdfDoc, fonts);
  }
  return fonts;
}

/** Intègre une image ; une image corrompue (octets magiques corrects, reste illisible) est ignorée. */
export async function embedImage(pdfDoc: PDFDocument, image: DocumentImage | null): Promise<PDFImage | null> {
  if (!image) return null;
  try {
    return image.format === 'png' ? await pdfDoc.embedPng(image.bytes) : await pdfDoc.embedJpg(image.bytes);
  } catch (error) {
    logger.warn('Document branding image could not be embedded', { error });
    return null;
  }
}

/** Dimensions d'une image ramenée dans une boîte, proportions conservées (jamais agrandie). */
export function fitInBox(width: number, height: number, maxWidth: number, maxHeight: number) {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return { width: width * scale, height: height * scale };
}

/** Au-delà, un texte ne tient de toute façon sur aucune ligne d'une page A4. */
const TRUNCATE_CAP = 300;

/**
 * Coupe un texte pour qu'il tienne dans `maxWidth` (points), avec « ... ».
 * Plafond puis recherche dichotomique : une saisie libre de plusieurs
 * centaines de milliers de caractères ne coûte que quelques mesures.
 */
export function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const clean = sanitizeForPdf(text.length > TRUNCATE_CAP ? text.slice(0, TRUNCATE_CAP) : text);
  if (text.length <= TRUNCATE_CAP && font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
  // Plus grand préfixe `n` tel que `préfixe + "..."` tienne.
  let low = 0;
  let high = clean.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (font.widthOfTextAtSize(`${clean.slice(0, mid)}...`, size) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return `${clean.slice(0, Math.max(low, 1))}...`;
}

export const PAGE_MARGIN = 40;
const MARGIN = PAGE_MARGIN;
const LOGO_BOX = { width: 90, height: 60 };
const GREY = rgb(0.35, 0.35, 0.35);
const RULE_GREY = rgb(0.75, 0.75, 0.75);

/** Lignes d'identité de l'émetteur, dans l'ordre d'affichage. */
export function issuerIdentityLines(issuer: DocumentIssuer): string[] {
  const lines: string[] = [];
  if (issuer.legalName && issuer.legalName !== issuer.name) lines.push(issuer.legalName);
  if (issuer.address) lines.push(issuer.address);
  const contact = [issuer.phone ? `Tél. ${issuer.phone}` : null, issuer.email].filter(Boolean).join(' - ');
  if (contact) lines.push(contact);
  const legal = [issuer.rccm ? `RCCM ${issuer.rccm}` : null, issuer.taxId ? `NCC ${issuer.taxId}` : null]
    .filter(Boolean)
    .join(' - ');
  if (legal) lines.push(legal);
  return lines;
}

/** Cache d'images par document PDF : une image n'est intégrée qu'une fois (impression groupée). */
const embeddedImages = new WeakMap<PDFDocument, Map<DocumentImage, Promise<PDFImage | null>>>();

function embedImageOnce(pdfDoc: PDFDocument, image: DocumentImage | null): Promise<PDFImage | null> {
  if (!image) return Promise.resolve(null);
  let cache = embeddedImages.get(pdfDoc);
  if (!cache) {
    cache = new Map();
    embeddedImages.set(pdfDoc, cache);
  }
  let embedded = cache.get(image);
  if (!embedded) {
    embedded = embedImage(pdfDoc, image);
    cache.set(image, embedded);
  }
  return embedded;
}

export interface DocumentHeaderOptions {
  title: string;
  subtitle?: string;
  /** Texte aligné à droite sur la ligne du titre (numéro de document). */
  titleRight?: string;
  /** Zone de l'en-tête ; par défaut la largeur utile de la page, marges standard. */
  frame?: { x: number; top: number; width: number };
  /** Échelle (1 = page A4 entière) pour un document dessiné dans une case réduite. */
  scale?: number;
  /** Nombre maximal de lignes d'identité de l'émetteur. */
  maxIdentityLines?: number;
  /** Sous-titre en gris (par défaut en noir). */
  subtitleGrey?: boolean;
  /** Ligne « Copropriété : … » sous le titre (vraie par défaut). */
  showSyndicate?: boolean;
  /**
   * En-tête resserré pour une très petite case (impression groupée) : espaces
   * verticaux et interlignes réduits, pour laisser la place au corps du document.
   */
  compact?: boolean;
}

interface HeaderLayout {
  x: number;
  width: number;
  top: number;
  s: number;
  compact: boolean;
}

type HeaderFonts = { regular: PDFFont; bold: PDFFont };

/** Espacement vertical mis à l'échelle, jamais réduit sous 30 % de sa valeur nominale. */
const spacing = (value: number, s: number, compact = false) => Math.max(value * (compact ? 0.15 : 0.3), value * s);

/** Interligne des lignes secondaires de l'en-tête (resserré dans une très petite case). */
const leading = (compact: boolean, normal: number) => (compact ? 1.25 : normal);

/** Logos de l'émetteur (gauche) et de la copropriété (droite) ; renvoie la zone de texte et le bas du bandeau. */
async function drawHeaderLogos(pdfDoc: PDFDocument, page: PDFPage, branding: DocumentBranding, layout: HeaderLayout) {
  const box = { width: Math.max(28, LOGO_BOX.width * layout.s), height: Math.max(20, LOGO_BOX.height * layout.s) };
  const gap = Math.max(6, 12 * layout.s);
  let textX = layout.x;
  let textRight = layout.x + layout.width;
  let bandBottom = layout.top;

  const issuerLogo = await embedImageOnce(pdfDoc, branding.issuerLogo);
  if (issuerLogo) {
    const size = fitInBox(issuerLogo.width, issuerLogo.height, box.width, box.height);
    page.drawImage(issuerLogo, { x: layout.x, y: layout.top - size.height, ...size });
    textX = layout.x + box.width + gap;
    bandBottom = Math.min(bandBottom, layout.top - size.height);
  }
  const syndicateLogo = await embedImageOnce(pdfDoc, branding.syndicate?.logo ?? null);
  if (syndicateLogo) {
    const size = fitInBox(syndicateLogo.width, syndicateLogo.height, box.width, box.height);
    page.drawImage(syndicateLogo, { x: layout.x + layout.width - size.width, y: layout.top - size.height, ...size });
    textRight = layout.x + layout.width - box.width - gap;
    bandBottom = Math.min(bandBottom, layout.top - size.height);
  }
  return { textX, textWidth: Math.max(textRight - textX, 40), bandBottom };
}

/** Nom et lignes d'identité de l'émetteur ; renvoie l'ordonnée sous le dernier texte. */
function drawIssuerIdentity(
  page: PDFPage,
  fonts: HeaderFonts,
  issuer: DocumentIssuer,
  zone: { textX: number; textWidth: number },
  layout: HeaderLayout,
  maxLines: number
): number {
  const nameSize = Math.max(7, 12 * layout.s);
  const lineSize = Math.max(5, 8 * layout.s);
  let y = layout.top - nameSize;
  page.drawText(truncate(issuer.name || ' ', fonts.bold, nameSize, zone.textWidth), {
    x: zone.textX,
    y,
    size: nameSize,
    font: fonts.bold
  });
  for (const line of issuerIdentityLines(issuer).slice(0, maxLines)) {
    y -= lineSize * leading(layout.compact, 1.4);
    page.drawText(truncate(line, fonts.regular, lineSize, zone.textWidth), {
      x: zone.textX,
      y,
      size: lineSize,
      font: fonts.regular,
      color: GREY
    });
  }
  return y - spacing(4, layout.s, layout.compact);
}

/** Ligne « Copropriété : nom - adresse - références ». */
function syndicateLine(syndicate: NonNullable<DocumentBranding['syndicate']>): string {
  const language = pdfLanguage();
  const refs = [
    syndicate.registrationNo ? `${t('Immatriculation', undefined, language)} ${syndicate.registrationNo}` : null,
    syndicate.cadastralReference ? `${t('Réf. cadastrale', undefined, language)} ${syndicate.cadastralReference}` : null
  ]
    .filter(Boolean)
    .join(' - ');
  return [`${t('Copropriété', undefined, language)} : ${syndicate.name}`, syndicate.address, refs]
    .filter(Boolean)
    .join(' - ');
}

/** Titre (numéro facultatif à droite), puis lignes secondaires ; renvoie l'ordonnée de la dernière ligne. */
function drawHeaderTitle(
  page: PDFPage,
  fonts: HeaderFonts,
  branding: DocumentBranding,
  options: DocumentHeaderOptions,
  layout: HeaderLayout,
  ruleY: number
): number {
  const { x, width, s } = layout;
  const titleSize = Math.max(8, 16 * s);
  let cursor = ruleY - spacing(8, s, layout.compact) - titleSize;
  let titleWidth = width;
  if (options.titleRight) {
    const rightSize = Math.max(6.5, 10 * s);
    const right = sanitizeForPdf(options.titleRight);
    const rightWidth = fonts.bold.widthOfTextAtSize(right, rightSize);
    page.drawText(right, { x: x + width - rightWidth, y: cursor, size: rightSize, font: fonts.bold });
    titleWidth = width - rightWidth - 6;
  }
  page.drawText(truncate(options.title, fonts.bold, titleSize, titleWidth), {
    x,
    y: cursor,
    size: titleSize,
    font: fonts.bold
  });

  const extra: Array<{ text: string; size: number; grey: boolean }> = [];
  if (branding.syndicate && options.showSyndicate !== false) {
    extra.push({ text: syndicateLine(branding.syndicate), size: Math.max(5.5, 9 * s), grey: true });
  }
  if (options.subtitle)
    extra.push({ text: options.subtitle, size: Math.max(5.5, 10 * s), grey: options.subtitleGrey === true });
  for (const line of extra) {
    cursor -= line.size * leading(layout.compact, 1.5);
    page.drawText(truncate(line.text, fonts.regular, line.size, width), {
      x,
      y: cursor,
      size: line.size,
      font: fonts.regular,
      ...(line.grey ? { color: GREY } : {})
    });
  }
  return cursor;
}

/**
 * En-tête commun : logo de l'émetteur à gauche, son identité au centre, logo
 * de la copropriété à droite, filet, puis le titre (numéro facultatif à
 * droite), la ligne « Copropriété : … » et un sous-titre facultatif.
 * Renvoie l'ordonnée disponible sous l'en-tête.
 */
export async function drawDocumentHeader(
  pdfDoc: PDFDocument,
  page: PDFPage,
  branding: DocumentBranding,
  options: DocumentHeaderOptions
): Promise<number> {
  const fonts = await fontsOf(pdfDoc);
  const { width, height } = page.getSize();
  const s = options.scale ?? 1;
  const frame = options.frame ?? { x: MARGIN, top: height - MARGIN, width: width - 2 * MARGIN };
  const layout: HeaderLayout = { x: frame.x, width: frame.width, top: frame.top, s, compact: options.compact === true };

  const zone = await drawHeaderLogos(pdfDoc, page, branding, layout);
  const identityBottom = drawIssuerIdentity(page, fonts, branding.issuer, zone, layout, options.maxIdentityLines ?? 4);
  const ruleY = Math.min(zone.bandBottom, identityBottom) - spacing(10, s, layout.compact);
  page.drawLine({
    start: { x: frame.x, y: ruleY },
    end: { x: frame.x + frame.width, y: ruleY },
    thickness: 0.5,
    color: RULE_GREY
  });
  const last = drawHeaderTitle(page, fonts, branding, options, layout, ruleY);

  pdfDoc.setAuthor(sanitizeForPdf(branding.issuer.name));
  return last - spacing(20, s, layout.compact);
}

/**
 * Bloc de signature : libellé, cachet et signature superposés (s'ils
 * existent), puis le nom de l'émetteur. Renvoie l'ordonnée sous le bloc.
 */
export async function drawSignatureBlock(
  pdfDoc: PDFDocument,
  page: PDFPage,
  branding: DocumentBranding,
  options: { x: number; y: number; label: string }
): Promise<number> {
  const { regular, bold } = await fontsOf(pdfDoc);
  const { x } = options;
  let y = options.y;
  page.drawText(truncate(options.label, bold, 9, 200), { x, y, size: 9, font: bold });

  const areaHeight = 70;
  const areaTop = y - 6;
  const stamp = await embedImage(pdfDoc, branding.stamp);
  if (stamp) {
    const size = fitInBox(stamp.width, stamp.height, 90, areaHeight);
    page.drawImage(stamp, { x, y: areaTop - size.height, ...size, opacity: 0.9 });
  }
  const signature = await embedImage(pdfDoc, branding.signature);
  if (signature) {
    // Décalée vers la droite : la signature chevauche le cachet, comme à la main.
    const size = fitInBox(signature.width, signature.height, 140, 55);
    page.drawImage(signature, { x: x + 30, y: areaTop - (areaHeight + size.height) / 2, ...size });
  }

  y = areaTop - areaHeight - 12;
  page.drawText(truncate(branding.issuer.name || ' ', regular, 8, 200), { x, y, size: 8, font: regular, color: GREY });
  return y - 10;
}
