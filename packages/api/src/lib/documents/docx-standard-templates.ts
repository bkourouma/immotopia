import * as fs from 'fs/promises';
import * as path from 'path';
import PizZip from 'pizzip';
import { logger } from '../../utils/logger';
import { STANDARD_CONTENT, type StandardTemplateKey } from './docx-standard-content';
import { footerContent, headerContent, renderBlocks } from './docx-standard-blocks';
import { documentXml, escapeXml, footerXml, headerXml, settingsXml, stylesXml } from './docx-template-xml';

/**
 * Modèles DOCX standard d'ImmoTopia : même charte pour tous (bandeau d'en-tête
 * logo de l'émetteur / identité / logo de la copropriété, filet, titre, tableau
 * de références, pied « émetteur · RCCM · Page X / Y »).
 *
 * Les fichiers livrés sont dans `assets/modeles_standard/` ; ils sont produits
 * par `npx ts-node scripts/build-standard-docx-templates.ts` (dans `packages/api`)
 * et la construction est déterministe (dates fixes) : reconstruire sans changer
 * le contenu redonne la même empreinte.
 */

export type { StandardTemplateKey } from './docx-standard-content';

export interface StandardTemplateInfo {
  key: StandardTemplateKey;
  fileName: string;
  label: string;
  /** Type de document locatif (`DocumentType`) servi par ce modèle, sinon `null`. */
  docType: 'LEASE_HABITATION' | 'LEASE_COMMERCIAL' | 'RENT_RECEIPT' | 'RENT_STATEMENT' | null;
}

export const STANDARD_TEMPLATES: readonly StandardTemplateInfo[] = [
  {
    key: 'bail_habitation',
    fileName: 'bail_habitation.docx',
    label: 'Contrat de bail à usage d’habitation',
    docType: 'LEASE_HABITATION'
  },
  {
    key: 'bail_commercial',
    fileName: 'bail_commercial.docx',
    label: 'Contrat de bail à usage commercial',
    docType: 'LEASE_COMMERCIAL'
  },
  { key: 'recu_loyer', fileName: 'recu_loyer.docx', label: 'Reçu de loyer', docType: 'RENT_RECEIPT' },
  {
    key: 'releve_locatif',
    fileName: 'releve_locatif.docx',
    label: 'Relevé de compte locatif',
    docType: 'RENT_STATEMENT'
  },
  {
    key: 'compte_rendu_assemblee_generale',
    fileName: 'compte_rendu_assemblee_generale.docx',
    label: 'Compte rendu d’assemblée générale',
    docType: null
  },
  { key: 'avis_appel_charges', fileName: 'avis_appel_charges.docx', label: 'Avis d’appel de charges', docType: null },
  { key: 'quittance_charges', fileName: 'quittance_charges.docx', label: 'Quittance de charges', docType: null },
  {
    key: 'convocation_assemblee_generale',
    fileName: 'convocation_assemblee_generale.docx',
    label: 'Convocation à l’assemblée générale',
    docType: null
  }
];

export function standardTemplateInfo(key: StandardTemplateKey): StandardTemplateInfo {
  return STANDARD_TEMPLATES.find(info => info.key === key)!;
}

/** Modèle standard d'un type de document locatif, ou `undefined`. */
export function standardTemplateForDocType(docType: string): StandardTemplateInfo | undefined {
  return STANDARD_TEMPLATES.find(info => info.docType === docType);
}

// ------------------------------------------------------------------ assemblage

const FIXED_DATE = new Date(Date.UTC(2026, 0, 1));
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WML = 'application/vnd.openxmlformats-officedocument.wordprocessingml';

const contentTypesXml = (): string =>
  `${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="${WML}.document.main+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="${WML}.styles+xml"/>` +
  `<Override PartName="/word/settings.xml" ContentType="${WML}.settings+xml"/>` +
  `<Override PartName="/word/header1.xml" ContentType="${WML}.header+xml"/>` +
  `<Override PartName="/word/footer1.xml" ContentType="${WML}.footer+xml"/>` +
  `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
  `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
  `</Types>`;

const rootRelsXml = (): string =>
  `${XML_DECLARATION}<Relationships xmlns="${PKG}">` +
  `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>` +
  `<Relationship Id="rId2" Type="${PKG}/metadata/core-properties" Target="docProps/core.xml"/>` +
  `<Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/>` +
  `</Relationships>`;

const documentRelsXml = (): string =>
  `${XML_DECLARATION}<Relationships xmlns="${PKG}">` +
  `<Relationship Id="rIdStyles" Type="${REL}/styles" Target="styles.xml"/>` +
  `<Relationship Id="rIdSettings" Type="${REL}/settings" Target="settings.xml"/>` +
  `<Relationship Id="rIdHeader1" Type="${REL}/header" Target="header1.xml"/>` +
  `<Relationship Id="rIdFooter1" Type="${REL}/footer" Target="footer1.xml"/>` +
  `</Relationships>`;

const corePropsXml = (title: string): string =>
  `${XML_DECLARATION}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
  `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ` +
  `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(title)}</dc:title>` +
  `<dc:creator>ImmoTopia</dc:creator><cp:lastModifiedBy>ImmoTopia</cp:lastModifiedBy>` +
  `<dcterms:created xsi:type="dcterms:W3CDTF">${FIXED_DATE.toISOString()}</dcterms:created>` +
  `<dcterms:modified xsi:type="dcterms:W3CDTF">${FIXED_DATE.toISOString()}</dcterms:modified></cp:coreProperties>`;

const appPropsXml = (): string =>
  `${XML_DECLARATION}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">` +
  `<Application>ImmoTopia</Application></Properties>`;

/** A4, marge de 2 cm, en-tête et pied reliés à toutes les pages. */
const SECTION_PROPS =
  '<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader1"/><w:footerReference w:type="default" r:id="rIdFooter1"/>' +
  '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="2041" w:right="1134" w:bottom="1304" w:left="1134" w:header="510" w:footer="510" w:gutter="0"/></w:sectPr>';

/** Construit un modèle standard (octets d'un .docx), sans toucher au disque. */
export function buildStandardTemplate(key: StandardTemplateKey): Buffer {
  const info = standardTemplateInfo(key);
  const zip = new PizZip();
  const add = (name: string, content: string) => zip.file(name, content, { date: FIXED_DATE });
  add('[Content_Types].xml', contentTypesXml());
  add('_rels/.rels', rootRelsXml());
  add('docProps/core.xml', corePropsXml(info.label));
  add('docProps/app.xml', appPropsXml());
  add('word/document.xml', documentXml(renderBlocks(STANDARD_CONTENT[key]()), SECTION_PROPS));
  add('word/_rels/document.xml.rels', documentRelsXml());
  add('word/styles.xml', stylesXml());
  add('word/settings.xml', settingsXml());
  add('word/header1.xml', headerXml(headerContent()));
  add('word/footer1.xml', footerXml(footerContent()));
  return Buffer.from(zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

// -------------------------------------------------------------------- lecture

function getProjectRoot(): string {
  const cwd = process.cwd();
  return path.basename(cwd) === 'api' && path.basename(path.dirname(cwd)) === 'packages'
    ? path.resolve(cwd, '..', '..')
    : cwd;
}

/** Dossier des modèles standard livrés avec le dépôt. */
export const standardTemplatesDir = (): string => path.join(getProjectRoot(), 'assets', 'modeles_standard');

/**
 * Octets du modèle standard : le fichier livré s'il existe, sinon le modèle
 * reconstruit en mémoire (un déploiement sans le dossier garde un document propre).
 */
export async function loadStandardTemplate(key: StandardTemplateKey): Promise<Buffer> {
  const info = standardTemplateInfo(key);
  try {
    return await fs.readFile(path.join(standardTemplatesDir(), info.fileName));
  } catch {
    logger.warn('Standard DOCX template file missing, rebuilding in memory', { key });
    return buildStandardTemplate(key);
  }
}
