import * as fs from 'fs/promises';
import * as path from 'path';
import { getProjectRoot } from '../../utils/project-root';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { logger } from '../../utils/logger';

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
}

function formatResolutionResult(result?: string | null): string {
  switch ((result || '').toUpperCase()) {
    case 'APPROVED':
      return 'APPROUVEE';
    case 'REJECTED':
      return 'REJETEE';
    case 'PENDING':
      return 'EN ATTENTE';
    default:
      return result || 'EN ATTENTE';
  }
}

interface MeetingInput {
  id: string;
  type: string;
  scheduledAt: Date | string;
  startTime?: Date | string | null;
  endTime?: Date | string | null;
  location?: string | null;
  quorum?: unknown;
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
  if (Number.isNaN(date.getTime())) return 'Non renseignee';
  return date.toLocaleDateString('fr-FR');
}

function formatTime(value?: Date | string | null): string {
  if (!value) return 'Non renseignee';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Non renseignee';
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

function fallbackMinutes(meeting: MeetingInput): string {
  const lines: string[] = [];
  lines.push('COMPTE RENDU D ASSEMBLEE GENERALE');
  lines.push('');
  lines.push(`Copropriete: ${meeting.syndicate?.name || 'Non renseignee'}`);
  lines.push(`Adresse: ${meeting.syndicate?.address || 'Non renseignee'}`);
  lines.push(`Type: ${meeting.type}`);
  lines.push(`Date: ${formatDate(meeting.scheduledAt)}`);
  lines.push(`Heure de debut: ${formatTime(meeting.startTime)}`);
  lines.push(`Heure de fin: ${formatTime(meeting.endTime)}`);
  lines.push(`Lieu: ${meeting.location || 'Non renseigne'}`);
  lines.push(`Quorum: ${formatQuorum(meeting.quorum)}`);
  lines.push('');
  lines.push('ORDRE DU JOUR ET DISCUSSIONS');

  const agendaItems = [...(meeting.agendaItems || [])].sort((a, b) => a.orderIndex - b.orderIndex);
  if (agendaItems.length === 0) {
    lines.push('- Aucun point d ordre du jour renseigne.');
  } else {
    for (const item of agendaItems) {
      lines.push(`${item.orderIndex}. ${item.title}`);
      const discussions = normalizeDiscussions(item.discussions);
      if (discussions.length === 0) {
        lines.push('  - Discussion: non renseignee.');
      } else {
        for (const entry of discussions) {
          lines.push(`  - ${entry}`);
        }
      }
    }
  }

  lines.push('');
  lines.push('RESOLUTIONS ET RESULTATS');
  if (!meeting.resolutions || meeting.resolutions.length === 0) {
    lines.push('- Aucune resolution enregistree.');
  } else {
    for (const [index, resolution] of meeting.resolutions.entries()) {
      lines.push(`${index + 1}. ${resolution.title}`);
      if (resolution.description) lines.push(`  - Description: ${resolution.description}`);
      if (resolution.majorityRule) lines.push(`  - Regle de majorite: ${resolution.majorityRule}`);
      lines.push(
        `  - Votes: Pour ${resolution.votesFor || 0}, Contre ${resolution.votesAgainst || 0}, Abstention ${resolution.votesAbstain || 0}`
      );
      lines.push(`  - Resultat: ${formatResolutionResult(resolution.result)}`);
    }
  }

  lines.push('');
  lines.push('SYNTHESE');
  lines.push('Les echanges ci-dessus constituent le compte rendu de la seance.');
  return lines.join('\n');
}

function buildTemplateContext(meeting: MeetingInput): Record<string, unknown> {
  const agendaItems = [...(meeting.agendaItems || [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const resolutions = meeting.resolutions || [];
  const agendaLines: string[] = [];
  const resolutionLines: string[] = [];

  const agendaItemsContext = agendaItems.map((item, idx) => {
    const discussions = normalizeDiscussions(item.discussions);
    agendaLines.push(`${item.orderIndex}. ${item.title}`);
    if (discussions.length === 0) {
      agendaLines.push('  - Discussion: non renseignee.');
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
          : 'non renseignee'
    };
  });

  const resolutionsContext = resolutions.map((resolution, idx) => {
    resolutionLines.push(`${idx + 1}. ${resolution.title}`);
    resolutionLines.push(`  - Description: ${resolution.description || 'Non renseignee'}`);
    resolutionLines.push(`  - Regle de majorite: ${resolution.majorityRule || 'Non renseignee'}`);
    resolutionLines.push(
      `  - Votes: Pour ${resolution.votesFor || 0}, Contre ${resolution.votesAgainst || 0}, Abstention ${resolution.votesAbstain || 0}`
    );
    resolutionLines.push(`  - Resultat: ${formatResolutionResult(resolution.result)}`);

    return {
      RESOLUTION_INDEX: idx + 1,
      RESOLUTION_TITLE: resolution.title,
      RESOLUTION_DESCRIPTION: resolution.description || 'Non renseignee',
      RESOLUTION_MAJORITY_RULE: resolution.majorityRule || 'Non renseignee',
      RESOLUTION_VOTES_FOR: resolution.votesFor || 0,
      RESOLUTION_VOTES_AGAINST: resolution.votesAgainst || 0,
      RESOLUTION_VOTES_ABSTAIN: resolution.votesAbstain || 0,
      RESOLUTION_RESULT: formatResolutionResult(resolution.result)
    };
  });

  if (agendaLines.length === 0) {
    agendaLines.push('- Aucun point d ordre du jour renseigne.');
  }
  if (resolutionLines.length === 0) {
    resolutionLines.push('- Aucune resolution enregistree.');
  }

  return {
    SYNDICATE_NAME: meeting.syndicate?.name || 'Non renseignee',
    SYNDICATE_ADDRESS: meeting.syndicate?.address || 'Non renseignee',
    MEETING_TYPE: meeting.type,
    MEETING_DATE: formatDate(meeting.scheduledAt),
    MEETING_START_TIME: formatTime(meeting.startTime),
    MEETING_END_TIME: formatTime(meeting.endTime),
    MEETING_LOCATION: meeting.location || 'Non renseigne',
    MEETING_QUORUM: formatQuorum(meeting.quorum),
    AGENDA_ITEMS: agendaItemsContext,
    AGENDA_ITEMS_WITH_DISCUSSIONS: agendaLines.join('\n'),
    RESOLUTIONS: resolutionsContext,
    RESOLUTIONS_WITH_RESULTS: resolutionLines.join('\n'),
    FINAL_SUMMARY: 'Les echanges ci-dessus constituent le compte rendu de la seance.'
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

export async function buildMeetingMinutesDocx(meeting: MeetingInput, tenantIdOverride?: string): Promise<Buffer> {
  const templatePath = await resolveSyndicMinutesTemplatePath(meeting, tenantIdOverride);

  if (templatePath) {
    try {
      const context = buildTemplateContext(meeting);
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

  return buildDocxBuffer(fallbackMinutes(meeting));
}
