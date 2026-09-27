import * as path from 'path';
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { privateUploadPath, privateUploadReadRoots } from '../files/private-files';
import { sanitizeForPdf } from './pdf-text';
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
  const address = [tenant?.address, tenant?.city, tenant?.country].map(emptyToNull).filter(Boolean).join(', ');
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

const MARGIN = 40;
const LOGO_BOX = { width: 90, height: 60 };
const GREY = rgb(0.35, 0.35, 0.35);

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

/**
 * En-tête commun : logo de l'émetteur à gauche, son identité au centre, logo
 * de la copropriété à droite, puis le titre (et un sous-titre facultatif).
 * Renvoie l'ordonnée disponible sous l'en-tête.
 */
export async function drawDocumentHeader(
  pdfDoc: PDFDocument,
  page: PDFPage,
  branding: DocumentBranding,
  options: { title: string; subtitle?: string }
): Promise<number> {
  const { regular, bold } = await fontsOf(pdfDoc);
  const { width, height } = page.getSize();
  const top = height - MARGIN;
  let bandBottom = top;

  const issuerLogo = await embedImage(pdfDoc, branding.issuerLogo);
  let textX = MARGIN;
  if (issuerLogo) {
    const size = fitInBox(issuerLogo.width, issuerLogo.height, LOGO_BOX.width, LOGO_BOX.height);
    page.drawImage(issuerLogo, { x: MARGIN, y: top - size.height, ...size });
    textX = MARGIN + LOGO_BOX.width + 12;
    bandBottom = Math.min(bandBottom, top - size.height);
  }

  const syndicateLogo = await embedImage(pdfDoc, branding.syndicate?.logo ?? null);
  let textRight = width - MARGIN;
  if (syndicateLogo) {
    const size = fitInBox(syndicateLogo.width, syndicateLogo.height, LOGO_BOX.width, LOGO_BOX.height);
    page.drawImage(syndicateLogo, { x: width - MARGIN - size.width, y: top - size.height, ...size });
    textRight = width - MARGIN - LOGO_BOX.width - 12;
    bandBottom = Math.min(bandBottom, top - size.height);
  }

  const textWidth = Math.max(textRight - textX, 80);
  let y = top - 12;
  page.drawText(truncate(branding.issuer.name || ' ', bold, 12, textWidth), { x: textX, y, size: 12, font: bold });
  for (const line of issuerIdentityLines(branding.issuer)) {
    y -= 11;
    page.drawText(truncate(line, regular, 8, textWidth), { x: textX, y, size: 8, font: regular, color: GREY });
  }
  bandBottom = Math.min(bandBottom, y - 4);

  let cursor = bandBottom - 10;
  page.drawLine({
    start: { x: MARGIN, y: cursor },
    end: { x: width - MARGIN, y: cursor },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75)
  });

  cursor -= 24;
  const contentWidth = width - 2 * MARGIN;
  page.drawText(truncate(options.title, bold, 16, contentWidth), { x: MARGIN, y: cursor, size: 16, font: bold });

  const syndicate = branding.syndicate;
  if (syndicate) {
    const refs = [
      syndicate.registrationNo ? `Immatriculation ${syndicate.registrationNo}` : null,
      syndicate.cadastralReference ? `Réf. cadastrale ${syndicate.cadastralReference}` : null
    ]
      .filter(Boolean)
      .join(' - ');
    const line = [`Copropriété : ${syndicate.name}`, syndicate.address, refs].filter(Boolean).join(' - ');
    cursor -= 15;
    page.drawText(truncate(line, regular, 9, contentWidth), {
      x: MARGIN,
      y: cursor,
      size: 9,
      font: regular,
      color: GREY
    });
  }
  if (options.subtitle) {
    cursor -= 14;
    page.drawText(truncate(options.subtitle, regular, 10, contentWidth), {
      x: MARGIN,
      y: cursor,
      size: 10,
      font: regular
    });
  }

  pdfDoc.setAuthor(sanitizeForPdf(branding.issuer.name));
  return cursor - 20;
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
