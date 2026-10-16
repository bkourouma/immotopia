import { z } from 'zod';
import { prisma } from '../../utils/database';
import { NotFoundError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { renderDocxBuffer } from '../../services/docx-renderer';
import type { PrivateFile } from '../files/private-files';
import { resolveDocumentBranding, type DocumentBranding } from '../documents/document-branding';
import { buildCommonDocumentContext } from '../documents/docx-branding';
import { loadStandardTemplate, type StandardTemplateKey } from '../documents/docx-standard-templates';
import { amountToFrenchWords } from './number-to-french-words';
import { assertSyndicateOfTenant } from './charge-allocation';
import { loadChargeCallNoticeForTenant } from './charge-call-notice';
import { paymentMethodLine, type ChargeCallNoticeData } from './charge-call-notice-pdf';
import { formatAmount } from './charge-receipt-pdf';
import {
  brandingForSnapshot,
  loadSyndicateRenderContext,
  snapshotOf,
  STORED_RECEIPT_SELECT,
  type StoredReceipt
} from './charge-receipt-delivery';
import {
  contactDisplayName,
  frenchDay,
  lotTypeLabel,
  paymentMethodLabel,
  periodText,
  type ChargeReceiptSnapshot
} from './charge-receipt-snapshot';
import { currentOwnerProfilesSorted } from './lot-owner';
import { formatMeetingType } from './minutes-generator';

/**
 * Documents Word du syndic : avis d'appel de charges, quittance et convocation
 * à l'assemblée générale, rendus depuis les modèles standard
 * (`assets/modeles_standard/`) avec les VRAIES données de l'agence.
 *
 * Deux couches :
 * - des constructeurs de contexte PURS (`build…Context`), testables seuls, qui
 *   respectent exactement les balises de `docs/modeles-documents/CATALOGUE-PLACEHOLDERS.md` ;
 * - des chargeurs (`render…Docx`) qui lisent la base avec un filtre d'agence,
 *   puis rendent le modèle (sans « assainissement » : une donnée absente reste
 *   vide, jamais `{{NOM}}`).
 *
 * La quittance est rendue depuis son SNAPSHOT figé, jamais depuis les tables
 * vivantes. Un document sort toujours, au pire sans logo.
 */

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type Context = Record<string, unknown>;

// -------------------------------------------------------------- utilitaires

/** Devise affichée : le franc CFA s'écrit « FCFA » ; les autres restent leur code. */
export function currencyLabel(currency: string): string {
  return ['XOF', 'XAF'].includes(currency.toUpperCase()) ? 'FCFA' : currency;
}

/** Montant sans devise (la devise a sa propre balise), format des PDF : « 45 000 », « 12,50 ». */
export function amountText(amount: number): string {
  return formatAmount(amount, '').trim();
}

/** Montant en lettres ; vide si la valeur n'est pas convertible (négative). */
export function wordsText(amount: number, currency: string): string {
  return amount >= 0 ? amountToFrenchWords(amount, currency) : '';
}

/** Fragment de nom de fichier : ASCII sûr (lettres, chiffres, point, tiret). */
export function fileSlug(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60);
}

export function docxFileName(prefix: string, ...parts: Array<string | null | undefined>): string {
  const slug = [prefix, ...parts.map(fileSlug)].filter(part => part.length > 0).join('-');
  return `${slug}.docx`;
}

/** Ville de l'émetteur : dernier élément de son adresse (« Cocody, Abidjan » → « Abidjan »). */
export function issuerCity(branding: DocumentBranding): string {
  const parts = (branding.issuer.address ?? '').split(',').map(part => part.trim());
  return parts.filter(part => part.length > 0).pop() ?? '';
}

const shortRef = (prefix: string, id: string): string => `${prefix}-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

/** Destinataire et lot, tels qu'ils figurent sur le document. */
export interface PartyFacts {
  name: string;
  address: string;
  email: string;
  lotNumber: string;
  lotType: string;
  shares: string;
  totalShares: string;
}

const partyContext = (party: PartyFacts): Context => ({
  COPROPRIETAIRE_NOM: party.name,
  COPROPRIETAIRE_ADRESSE: party.address,
  COPROPRIETAIRE_EMAIL: party.email,
  LOT_NUMERO: party.lotNumber,
  LOT_TYPE: party.lotType,
  LOT_TANTIEMES: party.shares,
  LOT_TANTIEMES_TOTAL: party.totalShares
});

// ------------------------------------------------------- avis d'appel (contexte)

export interface ChargeCallDocxInput {
  data: ChargeCallNoticeData;
  branding: DocumentBranding;
  party: PartyFacts;
}

function chargeCallLines(data: ChargeCallNoticeData, party: PartyFacts): Context[] {
  const base =
    party.shares && party.totalShares
      ? t('{{lot}}/{{total}} tantièmes', { lot: party.shares, total: party.totalShares })
      : '';
  return [
    {
      LIGNE_LIBELLE: [t('Charges de copropriété'), periodText(data.period)].filter(Boolean).join(' - '),
      LIGNE_BASE: base,
      LIGNE_MONTANT: amountText(data.amount)
    }
  ];
}

/**
 * Balises de l'avis d'appel. `TOTAL_A_PAYER` est le reste à payer du PDF ;
 * `SOLDE_ANTERIEUR` porte ce qui est déjà couvert sur cet appel (avance imputée
 * et règlements, en négatif), pour que « appelé + solde = total » tienne.
 */
export function buildChargeCallContext({ data, branding, party }: ChargeCallDocxInput): Context {
  const covered = data.advanceImputed + data.paid;
  const methods = data.paymentMethods.map(method => `- ${paymentMethodLine(method)}`).join('\n');
  return {
    ...buildCommonDocumentContext(branding, {
      reference: shortRef('APL', data.chargeCallId),
      emittedAt: new Date(data.issuedAt)
    }),
    ...partyContext({
      ...party,
      name: data.coowner?.name ?? party.name,
      address: data.coowner?.address ?? party.address
    }),
    PERIODE: periodText(data.period),
    LIGNES: chargeCallLines(data, party),
    DEVISE: currencyLabel(data.currency),
    MONTANT_APPELE: amountText(data.amount),
    MONTANT_APPELE_LETTRES: wordsText(data.amount, data.currency),
    SOLDE_ANTERIEUR: amountText(covered > 0 ? -covered : 0),
    TOTAL_A_PAYER: amountText(data.outstanding),
    ECHEANCE: frenchDay(data.dueDate),
    MODALITES_PAIEMENT: methods,
    LIEU_EMISSION: issuerCity(branding)
  };
}

// ------------------------------------------------------ quittance (contexte)

const distinct = (values: Array<string | null | undefined>): string =>
  Array.from(new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value)))).join(', ');

function receiptPayment(snapshot: ChargeReceiptSnapshot) {
  if (snapshot.kind === 'QUITTANCE') {
    const methods = snapshot.settlements.map(s =>
      s.source === 'ADVANCE' ? t('Avance imputée') : paymentMethodLabel(s.method)
    );
    return {
      paidAt: frenchDay(snapshot.settledAt),
      paid: snapshot.amount,
      called: snapshot.call?.amount ?? snapshot.amount,
      due: 0,
      method: distinct(methods),
      reference: distinct(snapshot.settlements.map(s => s.reference)),
      period: periodText(snapshot.call?.period),
      callId: snapshot.call?.id ?? ''
    };
  }
  const calls = snapshot.allocations;
  return {
    paidAt: frenchDay(snapshot.payment?.paidAt),
    paid: snapshot.payment?.amount ?? snapshot.amount,
    called: calls.reduce((sum, allocation) => sum + allocation.callAmount, 0),
    due: snapshot.outstandingAfter,
    method: paymentMethodLabel(snapshot.payment?.method) ?? '',
    reference: snapshot.payment?.reference ?? '',
    period: distinct(calls.map(allocation => periodText(allocation.period))),
    callId: calls[0]?.chargeCallId ?? ''
  };
}

/**
 * Balises de la quittance : TOUT vient du snapshot figé. Tantièmes et e-mail ne
 * figurent pas au snapshot : « — » et vide, plutôt qu'une relecture du lot vivant.
 */
export function buildReceiptContext(snapshot: ChargeReceiptSnapshot, branding: DocumentBranding): Context {
  const pay = receiptPayment(snapshot);
  const party: PartyFacts = {
    name: snapshot.coowner?.name ?? t('Copropriétaire'),
    address: snapshot.coowner?.address ?? '',
    email: '',
    lotNumber: snapshot.lot.number,
    lotType: snapshot.lot.type,
    shares: '—',
    totalShares: '—'
  };
  return {
    ...buildCommonDocumentContext(branding, { reference: snapshot.number, emittedAt: new Date(snapshot.issuedAt) }),
    ...partyContext(party),
    APPEL_REFERENCE: pay.callId ? shortRef('APL', pay.callId) : '',
    PERIODE: pay.period,
    DATE_PAIEMENT: pay.paidAt,
    DEVISE: currencyLabel(snapshot.currency),
    MONTANT_APPELE: amountText(pay.called),
    MONTANT_PAYE: amountText(pay.paid),
    MONTANT_PAYE_LETTRES: wordsText(pay.paid, snapshot.currency),
    RESTE_DU: amountText(pay.due),
    MODE_PAIEMENT: pay.method,
    REFERENCE_PAIEMENT: pay.reference,
    LIEU_EMISSION: issuerCity(branding)
  };
}

// --------------------------------------------------- convocation (contexte)

export interface ConvocationPoint {
  title: string;
  description: string;
}

export interface ConvocationMeetingFacts {
  id: string;
  type: string;
  scheduledAt: Date;
  location: string | null;
  quorum: number | null;
  points: ConvocationPoint[];
}

export interface ConvocationDocxInput {
  meeting: ConvocationMeetingFacts;
  branding: DocumentBranding;
  party: PartyFacts;
  /** Date limite de remise des pouvoirs ; à défaut, le jour de l'assemblée. */
  proxyDeadline?: Date | null;
  now?: Date;
}

export function quorumMention(quorum: number | null): string {
  if (quorum === null || !Number.isFinite(quorum) || quorum <= 0) return '';
  return t(
    'Le quorum requis est de {{quorum}} % des tantièmes. À défaut de quorum, une seconde assemblée sera convoquée.',
    {
      quorum: Number(quorum.toFixed(2))
    }
  );
}

export function buildConvocationContext({
  meeting,
  branding,
  party,
  proxyDeadline,
  now
}: ConvocationDocxInput): Context {
  const at = new Date(meeting.scheduledAt);
  return {
    ...buildCommonDocumentContext(branding, { reference: shortRef('AG', meeting.id), emittedAt: now }),
    ...partyContext(party),
    ASSEMBLEE_TYPE: formatMeetingType(meeting.type).toLowerCase(),
    ASSEMBLEE_DATE: at.toLocaleDateString('fr-FR'),
    ASSEMBLEE_HEURE: at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    ASSEMBLEE_LIEU: meeting.location?.trim() || t('À préciser'),
    ORDRE_DU_JOUR: meeting.points.map((point, index) => ({
      POINT_NUMERO: String(index + 1),
      POINT_TITRE: point.title,
      POINT_DESCRIPTION: point.description
    })),
    DATE_LIMITE_POUVOIR: (proxyDeadline ?? at).toLocaleDateString('fr-FR'),
    MENTION_QUORUM: quorumMention(meeting.quorum),
    LIEU_EMISSION: issuerCity(branding)
  };
}

// ------------------------------------------------------------------ chargeurs

const CONTACT_SELECT = { firstName: true, lastName: true, legalName: true, address: true, email: true } as const;

type PartyContact = {
  firstName: string | null;
  lastName: string | null;
  legalName: string | null;
  address: string | null;
  email: string | null;
};

/** Propriétaires actuels du lot (indivision comprise), sinon propriétaire saisi sur le lot. */
function lotOwners(lot: {
  owner: PartyContact | null;
  coowner: PartyContact | null;
  ownerProfiles: Array<{
    id: string;
    contactId: string;
    ownershipPercentage: unknown;
    ownedSince: Date;
    ownedUntil: Date | null;
    isActive: boolean;
    contact: PartyContact;
  }>;
}): PartyContact[] {
  const current = currentOwnerProfilesSorted(lot.ownerProfiles as never[]) as typeof lot.ownerProfiles;
  const contacts = current.map(profile => profile.contact);
  const fallback = lot.owner ?? lot.coowner;
  return contacts.length > 0 ? contacts : fallback ? [fallback] : [];
}

/** Lot et propriétaires, relus avec le filtre d'agence ET de copropriété (sinon 404). */
export async function loadPartyFacts(tenantId: string, syndicateId: string, lotId: string): Promise<PartyFacts> {
  const lot = await prisma.syndicateLot.findFirst({
    where: { id: lotId, syndicateId, syndicate: { tenantId } },
    select: {
      lotNumber: true,
      lotType: true,
      generalShares: true,
      owner: { select: CONTACT_SELECT },
      coowner: { select: CONTACT_SELECT },
      ownerProfiles: {
        where: { isActive: true },
        select: {
          id: true,
          contactId: true,
          ownershipPercentage: true,
          ownedSince: true,
          ownedUntil: true,
          isActive: true,
          contact: { select: CONTACT_SELECT }
        }
      }
    }
  });
  if (!lot) throw new NotFoundError(t('Lot introuvable ou inaccessible pour cette copropriété.'));
  const total = await prisma.syndicateLot.aggregate({
    where: { syndicateId, syndicate: { tenantId } },
    _sum: { generalShares: true }
  });
  const owners = lotOwners(lot as never);
  const names = owners.map(owner => contactDisplayName(owner)).filter(Boolean);
  return {
    name: names.join(', ') || t('Copropriétaire'),
    address: owners[0]?.address?.trim() ?? '',
    email: owners[0]?.email?.trim() ?? '',
    lotNumber: lot.lotNumber,
    lotType: lotTypeLabel(lot.lotType),
    shares: String(lot.generalShares),
    totalShares: String(total._sum.generalShares ?? lot.generalShares)
  };
}

async function renderStandard(key: StandardTemplateKey, context: Context, fileName: string): Promise<PrivateFile> {
  const template = await loadStandardTemplate(key);
  return { buffer: renderDocxBuffer(template, context, { sanitize: false }), fileName, mimeType: DOCX_MIME };
}

/** Avis d'appel de charges en Word : mêmes données que l'avis PDF. */
export async function renderChargeCallNoticeDocx(
  tenantId: string,
  syndicateId: string,
  chargeCallId: string
): Promise<PrivateFile> {
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);
  const notice = await loadChargeCallNoticeForTenant(tenantId, syndicateId, chargeCallId);
  const party = await loadPartyFacts(tenantId, syndicateId, notice.lotId);
  const context = buildChargeCallContext({ data: notice.data, branding: notice.branding, party });
  const fileName = docxFileName('avis-appel', notice.data.lot.number, notice.data.period.label);
  return renderStandard('avis_appel_charges', context, fileName);
}

async function loadStoredReceipt(tenantId: string, syndicateId: string, receiptId: string): Promise<StoredReceipt> {
  const receipt = await prisma.syndicChargeReceipt.findFirst({
    where: { id: receiptId, tenantId, syndicateId },
    select: STORED_RECEIPT_SELECT
  });
  if (!receipt) throw new NotFoundError(t('Document introuvable.'));
  return receipt as StoredReceipt;
}

/** Quittance ou reçu en Word, depuis le snapshot figé (identité : `brandingForSnapshot`). */
export async function renderReceiptDocx(
  tenantId: string,
  syndicateId: string,
  receiptId: string
): Promise<PrivateFile> {
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);
  const receipt = await loadStoredReceipt(tenantId, syndicateId, receiptId);
  const snapshot = snapshotOf(receipt);
  const context = await loadSyndicateRenderContext(tenantId, syndicateId);
  const branding = brandingForSnapshot(context, snapshot);
  const prefix = snapshot.kind === 'QUITTANCE' ? 'quittance' : 'recu';
  return renderStandard(
    'quittance_charges',
    buildReceiptContext(snapshot, branding),
    docxFileName(prefix, receipt.number)
  );
}

async function loadConvocationMeeting(tenantId: string, syndicateId: string, meetingId: string) {
  const meeting = await prisma.generalMeeting.findFirst({
    where: { id: meetingId, syndicateId, syndicate: { tenantId } },
    select: {
      id: true,
      type: true,
      scheduledAt: true,
      location: true,
      quorum: true,
      agendaItems: { orderBy: { orderIndex: 'asc' }, select: { title: true } },
      resolutions: { orderBy: { createdAt: 'asc' }, select: { title: true, description: true } }
    }
  });
  if (!meeting) throw new NotFoundError(t('Assemblée introuvable.'));
  // L'ordre du jour ; à défaut, les résolutions proposées.
  const points: ConvocationPoint[] =
    meeting.agendaItems.length > 0
      ? meeting.agendaItems.map(item => ({ title: item.title, description: '' }))
      : meeting.resolutions.map(item => ({ title: item.title, description: item.description ?? '' }));
  return {
    id: meeting.id,
    type: String(meeting.type),
    scheduledAt: meeting.scheduledAt,
    location: meeting.location,
    quorum: meeting.quorum === null ? null : Number(meeting.quorum),
    points
  } satisfies ConvocationMeetingFacts;
}

export const convocationDocxQuerySchema = z
  .object({
    dateLimitePouvoir: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(value => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)))
      .optional()
  })
  .strict();

export type ConvocationDocxQuery = z.infer<typeof convocationDocxQuerySchema>;

/** Convocation Word d'un copropriétaire (lot) à une assemblée de la copropriété. */
export async function renderConvocationDocx(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  lotId: string,
  query: ConvocationDocxQuery = {}
): Promise<PrivateFile> {
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);
  const meeting = await loadConvocationMeeting(tenantId, syndicateId, meetingId);
  const party = await loadPartyFacts(tenantId, syndicateId, lotId);
  const branding = await resolveDocumentBranding(tenantId, syndicateId);
  const proxyDeadline = query.dateLimitePouvoir ? new Date(`${query.dateLimitePouvoir}T12:00:00Z`) : null;
  const context = buildConvocationContext({ meeting, branding, party, proxyDeadline });
  return renderStandard('convocation_assemblee_generale', context, docxFileName('convocation-ag', party.lotNumber));
}
