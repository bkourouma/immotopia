/**
 * Mandat de gestion (`PropertyMandate`) en PDF, généré à la volée (spec 043,
 * lot S2) : rien n'est stocké, le noyau de signature fige les octets à l'envoi.
 *
 * Construction en trois temps, pour se tester sans PDF : lecture des données
 * (`loadManagementMandateData`, filtrée par agence), MODÈLE de document
 * (`buildManagementMandateModel`, tout le texte imprimé), rendu `pdf-lib`.
 * L'empreinte de la signature porte sur les DONNÉES lues
 * (`managementMandateSnapshot`) : une modification du mandat après l'envoi la
 * change, et la demande est annulée (SG-R2).
 *
 * Ne sont JAMAIS imprimés : les notes internes du mandat. Les clauses types
 * sont un modèle de départ, à faire valider juridiquement.
 */

import { createHash } from 'crypto';

import { prisma, type PrismaTransactionClient } from '../../utils/database';
import { resolveDocumentBranding, type DocumentBranding } from '../documents/document-branding';
import {
  formatClauseDate,
  formatClauseMoney,
  renderClauseDocumentPdf,
  type ClauseDocumentModel,
  type ClauseRow
} from '../documents/clause-document-pdf';

const MAX_SCOPE_ENTRIES = 20;
const MAX_SCOPE_VALUE = 300;

export interface ManagementMandateData {
  mandateId: string;
  startDate: Date;
  endDate: Date | null;
  isActive: boolean;
  /** Périmètre TEL QU'IMPRIMÉ (valeurs simples seulement) : seules ces lignes entrent dans l'empreinte. */
  scope: ClauseRow[];
  property: { title: string; internalReference: string; address: string; locationZone: string | null };
  owner: { fullName: string | null; email: string };
  /** Conditions d'honoraires du propriétaire (OwnerManagementTerms), si présentes. */
  terms: {
    mode: 'PERCENT' | 'FIXED';
    rate: number | null;
    fixedAmount: number | null;
    base: 'RENT_ONLY' | 'ALL_COLLECTED';
  } | null;
  currency: string;
}

/** Lecture du mandat et de ce qui alimente le PDF ; `null` si le mandat n'est pas de l'agence. */
export async function loadManagementMandateData(
  tenantId: string,
  mandateId: string,
  client: PrismaTransactionClient = prisma
): Promise<ManagementMandateData | null> {
  const mandate = await client.propertyMandate.findFirst({
    where: { id: mandateId, tenantId },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      isActive: true,
      scope: true,
      ownerUserId: true,
      property: {
        select: { title: true, internalReference: true, address: true, locationZone: true, currency: true }
      },
      owner: { select: { fullName: true, email: true } }
    }
  });
  if (!mandate) return null;
  const ownerClient = await client.tenantClient.findFirst({
    where: { tenantId, userId: mandate.ownerUserId },
    select: {
      managementTerms: {
        select: {
          managementFeeMode: true,
          managementFeeRate: true,
          managementFeeFixedAmount: true,
          managementFeeBase: true
        }
      }
    }
  });
  const terms = ownerClient?.managementTerms;
  return {
    mandateId: mandate.id,
    startDate: mandate.startDate,
    endDate: mandate.endDate,
    isActive: mandate.isActive,
    scope: scopeRows(mandate.scope),
    property: {
      title: mandate.property.title,
      internalReference: mandate.property.internalReference,
      address: mandate.property.address,
      locationZone: mandate.property.locationZone
    },
    owner: mandate.owner,
    terms: terms
      ? {
          mode: terms.managementFeeMode,
          rate: terms.managementFeeRate == null ? null : Number(terms.managementFeeRate),
          fixedAmount: terms.managementFeeFixedAmount == null ? null : Number(terms.managementFeeFixedAmount),
          base: terms.managementFeeBase
        }
      : null,
    currency: mandate.property.currency || 'XOF'
  };
}

/** Empreinte (SHA-256) des données qui alimentent le PDF. */
export function managementMandateSnapshot(data: ManagementMandateData): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

/** « typeDeBien » -> « Type de bien » : clé de périmètre saisie librement, rendue lisible. */
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function scopeValue(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (Array.isArray(value)) {
    const items = value.filter(item => ['string', 'number', 'boolean'].includes(typeof item)).map(String);
    return items.length ? items.join(', ') : null;
  }
  return null;
}

/** Périmètre saisi sur le mandat : seules les valeurs simples (texte, nombre, oui/non, listes) sont imprimées. */
export function scopeRows(scope: unknown): ClauseRow[] {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return [];
  const rows: ClauseRow[] = [];
  for (const [key, raw] of Object.entries(scope as Record<string, unknown>)) {
    const value = scopeValue(raw);
    if (value) rows.push({ label: humanizeKey(key), value: value.slice(0, MAX_SCOPE_VALUE) });
    if (rows.length >= MAX_SCOPE_ENTRIES) break;
  }
  return rows;
}

function feesText(data: ManagementMandateData): string {
  const terms = data.terms;
  if (!terms)
    return 'Les honoraires de gestion sont ceux convenus entre le mandant et le mandataire, précisés par écrit.';
  const base =
    terms.base === 'ALL_COLLECTED'
      ? "de l'ensemble des sommes encaissées pour le compte du mandant"
      : 'des loyers encaissés pour le compte du mandant';
  if (terms.mode === 'FIXED' && terms.fixedAmount != null) {
    return `Les honoraires de gestion sont fixés à un forfait de ${formatClauseMoney(terms.fixedAmount, data.currency)} par échéance de loyer encaissée.`;
  }
  if (terms.rate != null) {
    return `Les honoraires de gestion sont fixés à ${String(terms.rate).replace('.', ',')} % ${base}.`;
  }
  return 'Les honoraires de gestion sont ceux convenus entre le mandant et le mandataire, précisés par écrit.';
}

/** Modèle du document : tout le texte qui sera imprimé. */
export function buildManagementMandateModel(
  data: ManagementMandateData,
  branding: DocumentBranding
): ClauseDocumentModel {
  const agency = branding.issuer;
  const ownerName = data.owner.fullName?.trim() || data.owner.email;
  const scope = data.scope;
  const duration = data.endDate
    ? `Du ${formatClauseDate(data.startDate)} au ${formatClauseDate(data.endDate)}.`
    : `À compter du ${formatClauseDate(data.startDate)}, pour une durée indéterminée.`;
  return {
    title: 'MANDAT DE GESTION',
    subtitle: `Bien : ${data.property.title} (${data.property.internalReference})`,
    sections: [
      {
        title: 'Les parties',
        rows: [
          { label: 'Le mandant (propriétaire)', value: `${ownerName} - ${data.owner.email}` },
          {
            label: 'Le mandataire (agence)',
            value: [agency.legalName || agency.name, agency.address, agency.rccm ? `RCCM ${agency.rccm}` : null]
              .filter(Boolean)
              .join(' - ')
          }
        ]
      },
      {
        title: 'Le bien confié',
        rows: [
          { label: 'Désignation', value: data.property.title },
          { label: 'Référence', value: data.property.internalReference },
          { label: 'Adresse', value: [data.property.address, data.property.locationZone].filter(Boolean).join(', ') }
        ]
      },
      { title: 'Durée du mandat', paragraphs: [duration] },
      {
        title: 'Périmètre de la mission',
        ...(scope.length
          ? { rows: scope }
          : { paragraphs: ['Gestion locative courante du bien, dans les limites fixées par le présent mandat.'] })
      },
      { title: 'Honoraires', paragraphs: [feesText(data)] },
      {
        title: 'Conditions générales',
        paragraphs: [
          '1. Objet. Le mandant confie au mandataire la gestion du bien désigné ci-dessus : recherche de locataires, établissement des baux, encaissement des loyers et charges, délivrance des quittances et suivi courant du bien.',
          "2. Obligations du mandataire. Il agit avec diligence dans l'intérêt du mandant, l'informe de tout fait important concernant le bien et lui rend compte de sa gestion et des sommes encaissées à intervalles réguliers.",
          "3. Obligations du mandant. Il remet au mandataire les documents et informations nécessaires à la gestion, l'informe de tout changement concernant le bien et ne confie pas la même mission à un tiers pendant la durée du mandat sans en avertir le mandataire.",
          "4. Travaux et dépenses. Les travaux dépassant l'entretien courant sont soumis à l'accord préalable du mandant, sauf urgence nécessaire à la conservation du bien.",
          '5. Fin du mandat. Le mandat prend fin à son terme, par révocation du mandant ou par résiliation du mandataire, moyennant un préavis écrit. Les opérations en cours sont menées à leur terme et les comptes sont arrêtés à la date de fin.',
          '6. Confidentialité et données personnelles. Chaque partie garde confidentielles les informations échangées et traite les données personnelles conformément à la réglementation applicable.',
          '7. Loi applicable. Le présent mandat est régi par les lois et règlements en vigueur au lieu de situation du bien.'
        ]
      }
    ],
    signatures: [
      { role: 'Le mandant', name: ownerName },
      { role: "Le mandataire (l'agence)", name: agency.name }
    ],
    closing: 'Document établi pour une signature électronique des parties.'
  };
}

/** PDF du mandat de gestion, rendu depuis les données lues en base (jamais depuis le client). */
export async function renderManagementMandatePdf(
  tenantId: string,
  mandateId: string
): Promise<{ pdf: Buffer; data: ManagementMandateData } | null> {
  const data = await loadManagementMandateData(tenantId, mandateId);
  if (!data) return null;
  const branding = await resolveDocumentBranding(tenantId, null);
  return { pdf: await renderClauseDocumentPdf(buildManagementMandateModel(data, branding), branding), data };
}
