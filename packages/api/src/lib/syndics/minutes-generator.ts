import * as fs from 'fs/promises';
import * as path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { logger } from '../../utils/logger';
import { majorityRuleLabel, normalizeMajorityRule } from './meeting-majority';
import { t } from '../../i18n';
import type { DocumentBranding } from '../documents/document-branding';

interface AgendaItemInput {
  orderIndex: number;
  title: string;
  discussions?: unknown;
}

interface ResolutionInput {
  title: string;
  description?: string | null;
  majorityRule?: string | null;
  result?: string | null;
  votesFor?: number;
  votesAgainst?: number;
  votesAbstain?: number;
  /** Decompte en tantiemes ajoute par getMeetingByTenant. */
  tally?: {
    sharesFor: number;
    sharesAgainst: number;
    sharesAbstain: number;
    referenceShares: number;
  } | null;
}

/** Libelle de la regle ; une saisie libre historique vaut l'article 24. */
function formatMajorityRule(rule?: string | null): string {
  return majorityRuleLabel(normalizeMajorityRule(rule));
}

function formatShares(resolution: ResolutionInput): string | null {
  if (!resolution.tally) return null;
  const { sharesFor, sharesAgainst, sharesAbstain, referenceShares } = resolution.tally;
  return t('Tantièmes : pour {{pour}}, contre {{contre}}, abstention {{abstention}} (total de référence {{total}})', {
    pour: sharesFor,
    contre: sharesAgainst,
    abstention: sharesAbstain,
    total: referenceShares
  });
}

/** Libellé français du type d'assemblée (jamais le code brut ORDINARY / EXTRAORDINARY). */
export function formatMeetingType(type?: string | null): string {
  switch ((type || '').toUpperCase()) {
    case 'ORDINARY':
      return t('Ordinaire');
    case 'EXTRAORDINARY':
      return t('Extraordinaire');
    default:
      return type || t('Non renseigné');
  }
}

function formatResolutionResult(result?: string | null): string {
  switch ((result || '').toUpperCase()) {
    case 'APPROVED':
      return t('Approuvée');
    case 'REJECTED':
      return t('Rejetée');
    case 'PENDING':
      return t('En attente');
    default:
      return result || t('En attente');
  }
}

interface ContactLabelInput {
  firstName?: string | null;
  lastName?: string | null;
  legalName?: string | null;
  email?: string | null;
}

interface ProxyInput {
  grantor?: ContactLabelInput | null;
  representative?: ContactLabelInput | null;
}

function contactLabel(contact?: ContactLabelInput | null): string {
  if (!contact) return t('Non renseigné');
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
  return name || contact.legalName || contact.email || t('Non renseigné');
}

/** Section « pouvoirs » du procès-verbal : qui est représenté, et par qui. */
function proxyLines(proxies?: ProxyInput[]): string[] {
  const lines = [t('POUVOIRS')];
  if (!proxies || proxies.length === 0) {
    lines.push(t('- Aucun pouvoir enregistré.'));
  } else {
    for (const proxy of proxies) {
      lines.push(
        t('- {{grantor}} est représenté(e) par {{representative}}.', {
          grantor: contactLabel(proxy.grantor),
          representative: contactLabel(proxy.representative)
        })
      );
    }
  }
  lines.push('');
  return lines;
}

function proxyContexts(proxies?: ProxyInput[]) {
  return (proxies || []).map(proxy => ({
    PROXY_GRANTOR: contactLabel(proxy.grantor),
    PROXY_REPRESENTATIVE: contactLabel(proxy.representative)
  }));
}

interface MeetingInput {
  id: string;
  type: string;
  scheduledAt: Date | string;
  startTime?: Date | string | null;
  endTime?: Date | string | null;
  location?: string | null;
  quorum?: unknown;
  proxies?: ProxyInput[];
  agendaItems?: AgendaItemInput[];
  resolutions?: ResolutionInput[];
  syndicate?: { name?: string | null; address?: string | null; tenantId?: string | null } | null;
}

function normalizeDiscussions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => (typeof item === 'string' ? item.trim() : '')).filter(item => item.length > 0);
}

function formatDate(value: Date | string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t('Non renseignée');
  return date.toLocaleDateString('fr-FR');
}

function formatTime(value?: Date | string | null): string {
  if (!value) return t('Non renseignée');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t('Non renseignée');
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatQuorum(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}%`;
  if (typeof value === 'string' && value.trim().length > 0) return `${value}%`;
  if (value && typeof value === 'object' && 'toString' in value) {
    return `${String(value)}%`;
  }
  return '0%';
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getProjectRoot(): string {
  const cwd = process.cwd();
  return path.basename(cwd) === 'api' && path.basename(path.dirname(cwd)) === 'packages'
    ? path.resolve(cwd, '..', '..')
    : cwd;
}

/**
 * Lot S1 : variables d'identite de l'emetteur (mandant de la copropriete,
 * sinon l'agence) offertes aux modeles DOCX d'agence :
 *   {{EMETTEUR_NOM}}, {{EMETTEUR_RAISON_SOCIALE}}, {{EMETTEUR_ADRESSE}},
 *   {{EMETTEUR_TELEPHONE}}, {{EMETTEUR_EMAIL}}, {{EMETTEUR_RCCM}},
 *   {{EMETTEUR_NCC}}, {{COPROPRIETE_IMMATRICULATION}},
 *   {{COPROPRIETE_REFERENCE_CADASTRALE}}.
 * Une valeur absente vaut une chaine vide (pas le motif `{{...}}` que laisse
 * `nullGetter` pour une variable inconnue).
 *
 * Le logo n'est PAS injecte dans le DOCX : `docxtemplater-image-module-free`
 * (1.1.1) plante au rendu avec docxtemplater 3.67 et tire `xmldom` 0.1.x,
 * vulnerable (CVE-2021-21366). Voir le rapport du lot S1.
 */
export function buildIssuerContext(branding?: DocumentBranding | null): Record<string, string> {
  const issuer = branding?.issuer;
  return {
    EMETTEUR_NOM: issuer?.name ?? '',
    EMETTEUR_RAISON_SOCIALE: issuer?.legalName ?? issuer?.name ?? '',
    EMETTEUR_ADRESSE: issuer?.address ?? '',
    EMETTEUR_TELEPHONE: issuer?.phone ?? '',
    EMETTEUR_EMAIL: issuer?.email ?? '',
    EMETTEUR_RCCM: issuer?.rccm ?? '',
    EMETTEUR_NCC: issuer?.taxId ?? '',
    COPROPRIETE_IMMATRICULATION: branding?.syndicate?.registrationNo ?? '',
    COPROPRIETE_REFERENCE_CADASTRALE: branding?.syndicate?.cadastralReference ?? ''
  };
}

/** Lignes d'en-tete du compte rendu genere sans modele. */
function issuerHeaderLines(branding?: DocumentBranding | null): string[] {
  const issuer = branding?.issuer;
  if (!issuer?.name) return [];
  const lines = [issuer.name];
  if (issuer.legalName && issuer.legalName !== issuer.name) lines.push(issuer.legalName);
  if (issuer.address) lines.push(issuer.address);
  const contact = [issuer.phone ? `${t('Tél.')} ${issuer.phone}` : null, issuer.email].filter(Boolean).join(' - ');
  if (contact) lines.push(contact);
  const legal = [issuer.rccm ? `RCCM ${issuer.rccm}` : null, issuer.taxId ? `NCC ${issuer.taxId}` : null]
    .filter(Boolean)
    .join(' - ');
  if (legal) lines.push(legal);
  lines.push('');
  return lines;
}

function fallbackMinutes(meeting: MeetingInput, branding?: DocumentBranding | null): string {
  const lines: string[] = [...issuerHeaderLines(branding)];
  lines.push(t('COMPTE RENDU D’ASSEMBLÉE GÉNÉRALE'));
  lines.push('');
  lines.push(`${t('Copropriété')} : ${meeting.syndicate?.name || t('Non renseignée')}`);
  lines.push(`${t('Adresse')} : ${meeting.syndicate?.address || t('Non renseignée')}`);
  lines.push(`${t('Type')} : ${formatMeetingType(meeting.type)}`);
  lines.push(`${t('Date')} : ${formatDate(meeting.scheduledAt)}`);
  lines.push(`${t('Heure de début')} : ${formatTime(meeting.startTime)}`);
  lines.push(`${t('Heure de fin')} : ${formatTime(meeting.endTime)}`);
  lines.push(`${t('Lieu')} : ${meeting.location || t('Non renseigné')}`);
  lines.push(`${t('Quorum')} : ${formatQuorum(meeting.quorum)}`);
  lines.push('');
  lines.push(t('ORDRE DU JOUR ET DISCUSSIONS'));

  const agendaItems = [...(meeting.agendaItems || [])].sort((a, b) => a.orderIndex - b.orderIndex);
  if (agendaItems.length === 0) {
    lines.push(t('- Aucun point d’ordre du jour renseigné.'));
  } else {
    for (const item of agendaItems) {
      lines.push(`${item.orderIndex}. ${item.title}`);
      const discussions = normalizeDiscussions(item.discussions);
      if (discussions.length === 0) {
        lines.push(t('  - Discussion : non renseignée.'));
      } else {
        for (const entry of discussions) {
          lines.push(`  - ${entry}`);
        }
      }
    }
  }

  lines.push('');
  lines.push(t('RÉSOLUTIONS ET RÉSULTATS'));
  if (!meeting.resolutions || meeting.resolutions.length === 0) {
    lines.push(t('- Aucune résolution enregistrée.'));
  } else {
    for (const [index, resolution] of meeting.resolutions.entries()) {
      lines.push(`${index + 1}. ${resolution.title}`);
      if (resolution.description) lines.push(`  - ${t('Description')} : ${resolution.description}`);
      lines.push(`  - ${t('Règle de majorité')} : ${formatMajorityRule(resolution.majorityRule)}`);
      lines.push(
        t('  - Votes : pour {{pour}}, contre {{contre}}, abstention {{abstention}}', {
          pour: resolution.votesFor || 0,
          contre: resolution.votesAgainst || 0,
          abstention: resolution.votesAbstain || 0
        })
      );
      const sharesLine = formatShares(resolution);
      if (sharesLine) lines.push(`  - ${sharesLine}`);
      lines.push(`  - ${t('Résultat')} : ${formatResolutionResult(resolution.result)}`);
    }
  }

  lines.push('');
  lines.push(...proxyLines(meeting.proxies));
  lines.push(t('SYNTHÈSE'));
  lines.push(t('Les échanges ci-dessus constituent le compte rendu de la séance.'));
  return lines.join('\n');
}

function buildTemplateContext(meeting: MeetingInput, branding?: DocumentBranding | null): Record<string, unknown> {
  const agendaItems = [...(meeting.agendaItems || [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const resolutions = meeting.resolutions || [];
  const agendaLines: string[] = [];
  const resolutionLines: string[] = [];

  const agendaItemsContext = agendaItems.map((item, idx) => {
    const discussions = normalizeDiscussions(item.discussions);
    agendaLines.push(`${item.orderIndex}. ${item.title}`);
    if (discussions.length === 0) {
      agendaLines.push(t('  - Discussion : non renseignée.'));
    } else {
      for (const entry of discussions) {
        agendaLines.push(`  - ${entry}`);
      }
    }

    return {
      AGENDA_INDEX: item.orderIndex || idx + 1,
      AGENDA_TITLE: item.title,
      AGENDA_DISCUSSION:
        discussions.length > 0
          ? discussions.map((entry, discussionIndex) => `${discussionIndex + 1}. ${entry}`).join('\n')
          : t('non renseignée')
    };
  });

  const resolutionsContext = resolutions.map((resolution, idx) => {
    resolutionLines.push(`${idx + 1}. ${resolution.title}`);
    resolutionLines.push(`  - ${t('Description')} : ${resolution.description || t('Non renseignée')}`);
    resolutionLines.push(`  - ${t('Règle de majorité')} : ${formatMajorityRule(resolution.majorityRule)}`);
    resolutionLines.push(
      t('  - Votes : pour {{pour}}, contre {{contre}}, abstention {{abstention}}', {
        pour: resolution.votesFor || 0,
        contre: resolution.votesAgainst || 0,
        abstention: resolution.votesAbstain || 0
      })
    );
    const sharesLine = formatShares(resolution);
    if (sharesLine) resolutionLines.push(`  - ${sharesLine}`);
    resolutionLines.push(`  - ${t('Résultat')} : ${formatResolutionResult(resolution.result)}`);

    return {
      RESOLUTION_INDEX: idx + 1,
      RESOLUTION_TITLE: resolution.title,
      RESOLUTION_DESCRIPTION: resolution.description || t('Non renseignée'),
      RESOLUTION_MAJORITY_RULE: formatMajorityRule(resolution.majorityRule),
      RESOLUTION_VOTES_FOR: resolution.votesFor || 0,
      RESOLUTION_VOTES_AGAINST: resolution.votesAgainst || 0,
      RESOLUTION_VOTES_ABSTAIN: resolution.votesAbstain || 0,
      RESOLUTION_RESULT: formatResolutionResult(resolution.result)
    };
  });

  if (agendaLines.length === 0) {
    agendaLines.push(t('- Aucun point d’ordre du jour renseigné.'));
  }
  if (resolutionLines.length === 0) {
    resolutionLines.push(t('- Aucune résolution enregistrée.'));
  }

  return {
    ...buildIssuerContext(branding),
    SYNDICATE_NAME: meeting.syndicate?.name || t('Non renseignée'),
    SYNDICATE_ADDRESS: meeting.syndicate?.address || t('Non renseignée'),
    MEETING_TYPE: formatMeetingType(meeting.type),
    MEETING_DATE: formatDate(meeting.scheduledAt),
    MEETING_START_TIME: formatTime(meeting.startTime),
    MEETING_END_TIME: formatTime(meeting.endTime),
    MEETING_LOCATION: meeting.location || t('Non renseigné'),
    MEETING_QUORUM: formatQuorum(meeting.quorum),
    AGENDA_ITEMS: agendaItemsContext,
    AGENDA_ITEMS_WITH_DISCUSSIONS: agendaLines.join('\n'),
    RESOLUTIONS: resolutionsContext,
    RESOLUTIONS_WITH_RESULTS: resolutionLines.join('\n'),
    PROXIES: proxyContexts(meeting.proxies),
    PROXIES_LIST: proxyLines(meeting.proxies).join('\n'),
    FINAL_SUMMARY: t('Les échanges ci-dessus constituent le compte rendu de la séance.')
  };
}

async function resolveSyndicMinutesTemplatePath(
  meeting: MeetingInput,
  tenantIdOverride?: string
): Promise<string | null> {
  const tenantId = tenantIdOverride || meeting.syndicate?.tenantId;
  if (!tenantId) return null;

  const projectRoot = getProjectRoot();
  const templatePath = path.join(
    projectRoot,
    'assets',
    'modeles_documents',
    'tenants',
    tenantId,
    'compte-rendu-TEMPLATE.docx'
  );

  try {
    await fs.access(templatePath);
    return templatePath;
  } catch {
    return null;
  }
}

async function buildDocxFromTemplate(templatePath: string, context: Record<string, unknown>): Promise<Buffer> {
  const templateBuffer = await fs.readFile(templatePath);
  const zip = new PizZip(templateBuffer);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: {
      start: '{{',
      end: '}}'
    },
    nullGetter: (part: any) => {
      const varName = part.value || part.module || (typeof part === 'string' ? part : 'VARIABLE');
      return `{{${varName}}}`;
    }
  });

  doc.setData(context);
  doc.render();
  const rendered = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  return Buffer.from(rendered);
}

function buildDocumentXml(content: string): string {
  const paragraphs = content.split('\n');
  const paragraphXml = paragraphs
    .map(paragraph => {
      if (paragraph.trim().length === 0) {
        return '<w:p/>';
      }
      return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(paragraph)}</w:t></w:r></w:p>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
 xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
 xmlns:v="urn:schemas-microsoft-com:vml"
 xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:w10="urn:schemas-microsoft-com:office:word"
 xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
 xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
 xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
 xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
 xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
 mc:Ignorable="w14 wp14">
 <w:body>${paragraphXml}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body>
</w:document>`;
}

function buildDocxBuffer(content: string): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`
  );
  zip.file('word/document.xml', buildDocumentXml(content));
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`
  );
  zip.file(
    'docProps/core.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>Compte rendu AG</dc:title>
<dc:creator>ImmoTopia</dc:creator>
<cp:lastModifiedBy>ImmoTopia</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`
  );
  zip.file(
    'docProps/app.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>ImmoTopia</Application>
</Properties>`
  );

  return zip.generate({ type: 'nodebuffer' }) as Buffer;
}

export async function buildMeetingMinutesDocx(
  meeting: MeetingInput,
  tenantIdOverride?: string,
  branding?: DocumentBranding | null
): Promise<Buffer> {
  const templatePath = await resolveSyndicMinutesTemplatePath(meeting, tenantIdOverride);

  if (templatePath) {
    try {
      const context = buildTemplateContext(meeting, branding);
      logger.info('Syndic minutes generated from DOCX template', {
        meetingId: meeting.id,
        templatePath
      });
      return await buildDocxFromTemplate(templatePath, context);
    } catch (error) {
      logger.error('Syndic minutes template rendering failed, fallback to internal text generator', {
        error,
        meetingId: meeting.id,
        templatePath
      });
    }
  } else {
    logger.warn('Syndic minutes template not found, fallback to internal text generator', {
      meetingId: meeting.id,
      tenantId: tenantIdOverride || meeting.syndicate?.tenantId || null
    });
  }

  return buildDocxBuffer(fallbackMinutes(meeting, branding));
}
