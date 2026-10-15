/**
 * Mandat de vente (`SaleMandate`) en PDF, généré à la volée (spec 043, lot S2).
 *
 * Même découpage que le mandat de gestion (`lib/properties/management-mandate-pdf.ts`) :
 * lecture filtrée par agence, MODÈLE de document, rendu `pdf-lib`. L'empreinte
 * de la signature porte sur les données lues.
 *
 * Ne sont JAMAIS lus ni imprimés : le prix plancher (`minimumPrice`,
 * confidentiel : il n'est même pas dans le `select`), les notes internes, la part
 * du négociateur. Les clauses types sont un modèle de départ, à faire valider
 * juridiquement.
 */

import { createHash } from 'crypto';

import { prisma, type PrismaTransactionClient } from '../../utils/database';
import { resolveDocumentBranding, type DocumentBranding } from '../documents/document-branding';
import {
  formatClauseDate,
  formatClauseMoney,
  renderClauseDocumentPdf,
  type ClauseDocumentModel
} from '../documents/clause-document-pdf';
import { mandateNumber } from './numbering';

export interface SaleMandateData {
  mandateId: string;
  number: string;
  status: string;
  mandateType: 'SIMPLE' | 'EXCLUSIVE';
  askingPrice: number;
  commissionMode: 'PERCENT' | 'FIXED';
  commissionRate: number | null;
  commissionFixedAmount: number | null;
  commissionPayer: 'SELLER' | 'BUYER';
  startDate: Date;
  endDate: Date | null;
  property: { title: string; internalReference: string; address: string; locationZone: string | null };
  currency: string;
  seller: { fullName: string | null; email: string };
  /** Autres propriétaires du bien (indivision), avec leur quote-part en %. */
  coSellers: Array<{ fullName: string | null; email: string; sharePercent: number }>;
  agentName: string | null;
}

/** Lecture du mandat et de ce qui alimente le PDF ; `null` si le mandat n'est pas de l'agence. */
export async function loadSaleMandateData(
  tenantId: string,
  mandateId: string,
  client: PrismaTransactionClient = prisma
): Promise<SaleMandateData | null> {
  // `minimumPrice` et `notes` sont volontairement absents du select.
  const row = await client.saleMandate.findFirst({
    where: { id: mandateId, tenantId },
    select: {
      id: true,
      year: true,
      sequence: true,
      status: true,
      mandateType: true,
      askingPrice: true,
      commissionMode: true,
      commissionRate: true,
      commissionFixedAmount: true,
      commissionPayer: true,
      startDate: true,
      endDate: true,
      propertyId: true,
      sellerClientId: true,
      property: {
        select: { title: true, internalReference: true, address: true, locationZone: true, currency: true }
      },
      sellerClient: { select: { user: { select: { fullName: true, email: true } } } },
      agentUser: { select: { fullName: true, email: true } }
    }
  });
  if (!row) return null;
  const shares = await client.propertyOwnershipShare.findMany({
    where: { tenantId, propertyId: row.propertyId, ownerClientId: { not: row.sellerClientId } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { sharePercent: true, ownerClient: { select: { user: { select: { fullName: true, email: true } } } } }
  });
  return {
    mandateId: row.id,
    number: mandateNumber(row.year, row.sequence),
    status: row.status,
    mandateType: row.mandateType,
    askingPrice: Number(row.askingPrice),
    commissionMode: row.commissionMode,
    commissionRate: row.commissionRate == null ? null : Number(row.commissionRate),
    commissionFixedAmount: row.commissionFixedAmount == null ? null : Number(row.commissionFixedAmount),
    commissionPayer: row.commissionPayer,
    startDate: row.startDate,
    endDate: row.endDate,
    property: {
      title: row.property.title,
      internalReference: row.property.internalReference,
      address: row.property.address,
      locationZone: row.property.locationZone
    },
    currency: row.property.currency || 'XOF',
    seller: row.sellerClient.user,
    coSellers: shares.map(share => ({
      fullName: share.ownerClient.user.fullName,
      email: share.ownerClient.user.email,
      sharePercent: Number(share.sharePercent)
    })),
    agentName: row.agentUser ? row.agentUser.fullName?.trim() || row.agentUser.email : null
  };
}

/** Empreinte (SHA-256) des données qui alimentent le PDF. */
export function saleMandateSnapshot(data: SaleMandateData): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

const nameOf = (person: { fullName: string | null; email: string }) => person.fullName?.trim() || person.email;

function commissionText(data: SaleMandateData): string {
  const payer = data.commissionPayer === 'BUYER' ? "à la charge de l'acquéreur" : 'à la charge du vendeur';
  if (data.commissionMode === 'FIXED' && data.commissionFixedAmount != null) {
    return `Les honoraires du mandataire sont fixés à un forfait de ${formatClauseMoney(data.commissionFixedAmount, data.currency)}, ${payer}, dus uniquement si la vente est conclue grâce au mandataire.`;
  }
  const rate = data.commissionRate != null ? `${String(data.commissionRate).replace('.', ',')} %` : 'le taux convenu';
  return `Les honoraires du mandataire sont fixés à ${rate} du prix de vente, ${payer}, dus uniquement si la vente est conclue grâce au mandataire.`;
}

/** Modèle du document : tout le texte qui sera imprimé. */
export function buildSaleMandateModel(data: SaleMandateData, branding: DocumentBranding): ClauseDocumentModel {
  const agency = branding.issuer;
  const exclusive = data.mandateType === 'EXCLUSIVE';
  const duration = data.endDate
    ? `Du ${formatClauseDate(data.startDate)} au ${formatClauseDate(data.endDate)}.`
    : `À compter du ${formatClauseDate(data.startDate)}, jusqu'à révocation.`;
  const sellerRows = [
    { label: 'Le mandant (vendeur)', value: `${nameOf(data.seller)} - ${data.seller.email}` },
    ...data.coSellers.map(co => ({
      label: 'Co-vendeur',
      value: `${nameOf(co)} - ${co.email} (quote-part ${String(co.sharePercent).replace('.', ',')} %)`
    }))
  ];
  return {
    title: `MANDAT DE VENTE ${exclusive ? 'EXCLUSIF' : 'SIMPLE'}`,
    subtitle: `N° ${data.number} - ${data.property.title}`,
    sections: [
      {
        title: 'Les parties',
        rows: [
          ...sellerRows,
          {
            label: 'Le mandataire (agence)',
            value: [agency.legalName || agency.name, agency.address, agency.rccm ? `RCCM ${agency.rccm}` : null]
              .filter(Boolean)
              .join(' - ')
          },
          ...(data.agentName ? [{ label: 'Négociateur', value: data.agentName }] : [])
        ]
      },
      {
        title: 'Le bien à vendre',
        rows: [
          { label: 'Désignation', value: data.property.title },
          { label: 'Référence', value: data.property.internalReference },
          { label: 'Adresse', value: [data.property.address, data.property.locationZone].filter(Boolean).join(', ') }
        ]
      },
      {
        title: 'Conditions du mandat',
        rows: [
          { label: 'Type de mandat', value: exclusive ? 'Mandat exclusif' : 'Mandat simple (non exclusif)' },
          { label: 'Prix de vente souhaité', value: formatClauseMoney(data.askingPrice, data.currency) },
          { label: 'Durée', value: duration }
        ]
      },
      { title: 'Honoraires', paragraphs: [commissionText(data)] },
      {
        title: 'Conditions générales',
        paragraphs: [
          '1. Objet. Le mandant charge le mandataire de rechercher un acquéreur pour le bien désigné ci-dessus, au prix de vente souhaité indiqué. Le mandataire ne peut conclure la vente au nom du mandant.',
          exclusive
            ? "2. Exclusivité. Pendant la durée du mandat, le mandant s'interdit de confier la vente du bien à un autre intermédiaire et de le vendre directement sans en informer le mandataire."
            : "2. Mandat simple. Le mandant conserve le droit de vendre le bien lui-même ou de le confier à d'autres intermédiaires ; il en informe le mandataire dès qu'une vente est conclue.",
          "3. Obligations du mandataire. Il présente le bien, organise les visites, transmet fidèlement au mandant les offres reçues et l'informe régulièrement de l'avancement de sa mission.",
          '4. Obligations du mandant. Il garantit être propriétaire du bien ou habilité à le vendre, remet les documents nécessaires à la vente et informe le mandataire de tout changement concernant le bien.',
          '5. Fin du mandat. Le mandat prend fin à son terme, par révocation du mandant ou par la vente du bien. La révocation est notifiée par écrit au mandataire.',
          '6. Confidentialité et données personnelles. Chaque partie garde confidentielles les informations échangées et traite les données personnelles conformément à la réglementation applicable.',
          '7. Loi applicable. Le présent mandat est régi par les lois et règlements en vigueur au lieu de situation du bien.'
        ]
      }
    ],
    signatures: [
      { role: 'Le mandant (vendeur)', name: nameOf(data.seller) },
      ...data.coSellers.map(co => ({ role: 'Co-vendeur', name: nameOf(co) })),
      { role: "Le mandataire (l'agence)", name: agency.name }
    ],
    closing: 'Document établi pour une signature électronique des parties.'
  };
}

/** PDF du mandat de vente, rendu depuis les données lues en base (jamais depuis le client). */
export async function renderSaleMandatePdf(
  tenantId: string,
  mandateId: string
): Promise<{ pdf: Buffer; data: SaleMandateData } | null> {
  const data = await loadSaleMandateData(tenantId, mandateId);
  if (!data) return null;
  const branding = await resolveDocumentBranding(tenantId, null);
  return { pdf: await renderClauseDocumentPdf(buildSaleMandateModel(data, branding), branding), data };
}
