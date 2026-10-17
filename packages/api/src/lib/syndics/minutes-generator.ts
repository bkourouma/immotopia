import * as fs from 'fs/promises';
import * as path from 'path';
import PizZip from 'pizzip';
import { logger } from '../../utils/logger';
import { majorityRuleLabel, normalizeMajorityRule } from './meeting-majority';
import { currentLanguage, t } from '../../i18n';
import { getShippedTemplatesDir, getTemplatesWriteDir } from '../../utils/assets-paths';
import type { DocumentBranding } from '../documents/document-branding';
import { buildCommonDocumentContext, buildIssuerContext } from '../documents/docx-branding';
import { loadStandardTemplate } from '../documents/docx-standard-templates';
import { renderDocxBuffer } from '../../services/docx-renderer';

// Compatibilité : `buildIssuerContext` vivait ici avant d'être partagé par tous les modèles DOCX.
export { buildIssuerContext };

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

const NBSP = ' ';

/**
 * Pourcentage selon la langue du document : « 16,2 % » (espace insécable) en
 * français, « 16.2% » en anglais et en arabe (chiffres latins).
 */
export function formatPercent(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (currentLanguage() === 'fr') {
    return `${rounded.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}${NBSP}%`;
  }
  return `${rounded.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
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

interface AttendanceLotInput {
  id: string;
  lotNumber: string;
  generalShares: number;
  voters?: ContactLabelInput[] | null;
}

interface AttendanceInput {
  lotId: string;
  status: string;
  mode?: string | null;
  attendeeName?: string | null;
  representedByName?: string | null;
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
  resolutions?: Array<ResolutionInput & { votes?: Array<{ lotId: string }> }>;
  /** Emargements de l'AG en direct (spec 043), avec les noms deja resolus. */
  attendances?: AttendanceInput[];
  syndicate?: {
    name?: string | null;
    address?: string | null;
    tenantId?: string | null;
    lots?: AttendanceLotInput[] | null;
  } | null;
}

export interface AttendanceSheetRow {
  lot: string;
  shares: number;
  person: string;
  status: string;
  mode: string;
}

export interface AttendanceSheet {
  rows: AttendanceSheetRow[];
  summary: string;
}

function formatDecimal(value: number): string {
  return value.toLocaleString(currentLanguage() === 'fr' ? 'fr-FR' : 'en-US', { maximumFractionDigits: 2 });
}

function attendanceStatusLabel(status: string): string {
  switch (status) {
    case 'PRESENT':
      return t('Présent(e)');
    case 'REPRESENTED':
      return t('Représenté(e)');
    default:
      return t('Absent(e)');
  }
}

function attendanceModeLabel(mode?: string | null): string {
  if (mode === 'ONLINE') return t('En ligne');
  if (mode === 'IN_PERSON') return t('En salle');
  return '-';
}

/**
 * Feuille de presence (spec 043) : un lot par ligne, avec son votant (ou son
 * mandataire), son statut et son mode. Un lot sans emargement mais ayant vote
 * est present (assemblees tenues avant l'AG en direct) ; sans emargement ni
 * vote, il est absent.
 */
export function buildAttendanceSheet(meeting: MeetingInput): AttendanceSheet {
  const lots = [...(meeting.syndicate?.lots ?? [])].sort((a, b) =>
    String(a.lotNumber).localeCompare(String(b.lotNumber), 'fr', { numeric: true })
  );
  const votedLotIds = new Set((meeting.resolutions ?? []).flatMap(r => (r.votes ?? []).map(vote => vote.lotId)));
  const attendanceByLot = new Map((meeting.attendances ?? []).map(row => [row.lotId, row]));

  let countedLots = 0;
  let countedShares = 0;
  const rows = lots.map(lot => {
    const row = attendanceByLot.get(lot.id);
    const voted = votedLotIds.has(lot.id);
    const counted = row?.status === 'PRESENT' || row?.status === 'REPRESENTED' || voted;
    const status = row?.status === 'REPRESENTED' ? 'REPRESENTED' : counted ? 'PRESENT' : 'ABSENT';
    const voters = (lot.voters ?? [])
      .map(voter => contactLabel(voter))
      .filter(label => label !== t('Non renseigné'))
      .join(' / ');
    let person = voters || row?.attendeeName || t('Non renseigné');
    if (status === 'REPRESENTED') {
      person = t('{{person}}, représenté(e) par {{representative}}', {
        person,
        representative: row?.representedByName || t('Non renseigné')
      });
    }
    if (counted) {
      countedLots += 1;
      countedShares += lot.generalShares || 0;
    }
    return {
      lot: String(lot.lotNumber),
      shares: lot.generalShares || 0,
      person,
      status: attendanceStatusLabel(status),
      mode: counted ? attendanceModeLabel(row?.mode) : '-'
    };
  });

  const totalShares = lots.reduce((sum, lot) => sum + (lot.generalShares || 0), 0);
  const percent = totalShares > 0 ? Math.round((countedShares / totalShares) * 10000) / 100 : 0;
  const summary = t(
    'Lots présents ou représentés : {{lots}} sur {{totalLots}} ({{shares}} tantièmes sur {{totalShares}}, soit {{percent}} %).',
    { lots: countedLots, totalLots: lots.length, shares: countedShares, totalShares, percent: formatDecimal(percent) }
  ).replace(/ %/g, `${NBSP}%`);
  return { rows, summary };
}

function attendanceLines(sheet: AttendanceSheet): string[] {
  const lines = [t('FEUILLE DE PRÉSENCE'), sheet.summary];
  if (sheet.rows.length === 0) {
    lines.push(t('- Aucun lot enregistré.'));
  } else {
    for (const row of sheet.rows) {
      lines.push(
        t('- Lot {{lot}} ({{shares}} tantièmes) : {{person}} - {{status}} - {{mode}}', {
          lot: row.lot,
          shares: row.shares,
          person: row.person,
          status: row.status,
          mode: row.mode
        })
      );
    }
  }
  lines.push('');
  return lines;
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
  const parsed =
    typeof value === 'number'
      ? value
      : value !== null && value !== undefined && String(value).trim().length > 0
        ? Number(String(value).replace(',', '.'))
        : 0;
  return formatPercent(Number.isFinite(parsed) ? parsed : 0);
}

/**
 * Points d'ordre du jour : ceux saisis ; à défaut, les titres des résolutions
 * (un compte rendu ne dit jamais « aucun point » quand des résolutions existent).
 */
function agendaOrFallback(meeting: MeetingInput): AgendaItemInput[] {
  const agendaItems = [...(meeting.agendaItems || [])].sort((a, b) => a.orderIndex - b.orderIndex);
  if (agendaItems.length > 0) return agendaItems;
  return (meeting.resolutions || []).map((resolution, index) => ({
    orderIndex: index + 1,
    title: resolution.title,
    discussions: []
  }));
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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
  lines.push(...attendanceLines(buildAttendanceSheet(meeting)));
  lines.push(t('ORDRE DU JOUR ET DISCUSSIONS'));

  const agendaItems = agendaOrFallback(meeting);
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
  const agendaItems = agendaOrFallback(meeting);
  const resolutions = meeting.resolutions || [];
  const attendanceSheet = buildAttendanceSheet(meeting);
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
      RESOLUTION_TANTIEMES: formatShares(resolution) ?? '',
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
    ...buildCommonDocumentContext(branding, {
      reference: `AG-${meeting.id.slice(0, 8).toUpperCase()}`,
      emittedAt: new Date()
    }),
    COPROPRIETE_NOM: branding?.syndicate?.name ?? meeting.syndicate?.name ?? '',
    COPROPRIETE_ADRESSE: branding?.syndicate?.address ?? meeting.syndicate?.address ?? '',
    SYNDICATE_NAME: meeting.syndicate?.name || t('Non renseignée'),
    SYNDICATE_ADDRESS: meeting.syndicate?.address || t('Non renseignée'),
    MEETING_TYPE: formatMeetingType(meeting.type),
    MEETING_DATE: formatDate(meeting.scheduledAt),
    MEETING_START_TIME: formatTime(meeting.startTime),
    MEETING_END_TIME: formatTime(meeting.endTime),
    MEETING_LOCATION: meeting.location || t('Non renseigné'),
    MEETING_QUORUM: formatQuorum(meeting.quorum),
    ATTENDANCE: attendanceSheet.rows.map(row => ({
      ATTENDANCE_LOT: row.lot,
      ATTENDANCE_SHARES: row.shares,
      ATTENDANCE_PERSON: row.person,
      ATTENDANCE_STATUS: row.status,
      ATTENDANCE_MODE: row.mode
    })),
    ATTENDANCE_SUMMARY: attendanceSheet.summary,
    ATTENDANCE_LIST: attendanceLines(attendanceSheet).join('\n'),
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

  // Modele importe par l'agence : volume d'abord, puis ancien emplacement.
  const relative = path.join('tenants', tenantId, 'compte-rendu-TEMPLATE.docx');
  for (const base of [getTemplatesWriteDir(), getShippedTemplatesDir()]) {
    const candidate = path.join(base, relative);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // essayer le suivant
    }
  }
  return null;
}

/** Rend un modèle DOCX (octets) avec le contexte du compte rendu ; une donnée vide reste vide. */
function renderMinutesTemplate(templateBuffer: Buffer, context: Record<string, unknown>): Buffer {
  return renderDocxBuffer(templateBuffer, context, { sanitize: false });
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

function plainText(xml: string): string {
  return xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Un modèle d'agence ancien ne porte pas les balises de présence : la feuille
 * est alors ajoutée en fin de corps (avant la mise en page finale), pour
 * qu'aucun chemin de génération ne la perde.
 */
function ensureAttendanceSheet(docx: Buffer, sheet: AttendanceSheet): Buffer {
  const zip = new PizZip(docx);
  const file = zip.file('word/document.xml');
  if (!file) return docx;
  const xml = file.asText();
  if (plainText(xml).includes(sheet.summary)) return docx;

  const [title, ...rest] = attendanceLines(sheet);
  const paragraphs = [
    `<w:p><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(title)}</w:t></w:r></w:p>`,
    ...rest.map(line =>
      line.trim().length === 0 ? '<w:p/>' : `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`
    )
  ].join('');
  const sectIndex = xml.lastIndexOf('<w:sectPr');
  const bodyEnd = xml.lastIndexOf('</w:body>');
  const at = sectIndex >= 0 ? sectIndex : bodyEnd;
  if (at < 0) return docx;
  zip.file('word/document.xml', xml.slice(0, at) + paragraphs + xml.slice(at));
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

/** Modèle personnalisé de l'agence, sinon modèle standard avec en-tête et logos. */
async function renderMinutesFromTemplates(
  meeting: MeetingInput,
  tenantIdOverride: string | undefined,
  branding: DocumentBranding | null | undefined
): Promise<Buffer> {
  const context = buildTemplateContext(meeting, branding);
  const templatePath = await resolveSyndicMinutesTemplatePath(meeting, tenantIdOverride);
  if (templatePath) {
    try {
      const rendered = renderMinutesTemplate(await fs.readFile(templatePath), context);
      logger.info('Syndic minutes generated from tenant DOCX template', { meetingId: meeting.id });
      return ensureAttendanceSheet(rendered, buildAttendanceSheet(meeting));
    } catch (error) {
      logger.error('Syndic minutes tenant template failed, trying the standard template', {
        error,
        meetingId: meeting.id
      });
    }
  }
  const standard = await loadStandardTemplate('compte_rendu_assemblee_generale');
  logger.info('Syndic minutes generated from the standard DOCX template', { meetingId: meeting.id });
  return renderMinutesTemplate(standard, context);
}

export async function buildMeetingMinutesDocx(
  meeting: MeetingInput,
  tenantIdOverride?: string,
  branding?: DocumentBranding | null
): Promise<Buffer> {
  try {
    return await renderMinutesFromTemplates(meeting, tenantIdOverride, branding);
  } catch (error) {
    logger.error('Syndic minutes template rendering failed, fallback to internal text generator', {
      error,
      meetingId: meeting.id,
      tenantId: tenantIdOverride || meeting.syndicate?.tenantId || null
    });
    return buildDocxBuffer(fallbackMinutes(meeting, branding));
  }
}
