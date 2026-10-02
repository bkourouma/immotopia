import { prisma } from '../../utils/database';
import { t } from '../../i18n';
import { NotFoundError } from '../../middleware/error-middleware';
import { logger } from '../../utils/logger';
import { runWithTenantContext } from '../../utils/tenant-context';
import { logAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { invalidSecureLinkError, verifySecureLink, type VerifiedSecureLink } from '../secure-links';
import { ownerSharesByProperty } from '../ownership/service';
import { VALUATION_ORDER_BY } from '../patrimoine/valuation-order';
import { buildPropertyYieldInput } from '../patrimoine/queries';
import { grossYield, latentCapitalGain, netNetYield, netYield, type YieldInput } from '../patrimoine/yield';
import { getPropertyDocumentFileForTenant } from '../properties/document-files';
import type { PrivateFile } from '../files/private-files';
import { resolveGrantScope, type GrantScope as GrantScopeView } from './scope';
import {
  EXTERNAL_ACCESS_LINK_SCOPE,
  EXTERNAL_ACCESS_OBJECT_TYPE,
  type ExternalAccessSectionKey,
  type ExternalAccessTypeKey
} from './sections';

/**
 * Vue en lecture seule d'un accès tiers de confiance (lot B3, spec 034),
 * lue par le jeton du lien. Aucune authentification : le jeton est la seule
 * preuve d'accès.
 *
 * CONTRAT DE SÉCURITÉ
 *  - Seul le jeton (et `documentRef` pour un téléchargement) vient de
 *    l'appelant. Le grant, l'agence et le périmètre se déduisent du lien ;
 *    aucun identifiant de bien, d'agence ou d'entité n'entre dans une requête.
 *  - Toute lecture se fait sous `runWithTenantContext` de l'agence du grant et
 *    filtre `tenantId`. Les biens ouverts sont recalculés À CHAQUE appel
 *    (`resolveGrantScope`) : un mandat échu ou une entité retirée referme
 *    l'accès sans attendre.
 *  - Le grant est relu à chaque appel : révoqué, expiré, inconnu, lien d'une
 *    autre portée, périmètre disparu, tout donne la même 404 uniforme.
 *  - Seules les rubriques accordées sont lues ET renvoyées. Aucune coordonnée
 *    (e-mail, téléphone), identité de locataire ou de co-indivisaire, texte
 *    libre interne, fournisseur, chemin disque ni identifiant technique.
 *  - Chaque consultation et chaque téléchargement sont journalisés (IP,
 *    user-agent, rubriques) et comptés sur le grant.
 */

export interface ExternalAccessViewDto {
  agencyName: string;
  grantType: ExternalAccessTypeKey;
  recipientName: string;
  ownerName: string | null;
  /** ISO : fin de validité de CE lien. */
  linkExpiresAt: string;
  /** ISO, ou `null` pour un accès permanent (les liens, eux, expirent toujours). */
  accessExpiresAt: string | null;
  currency: 'XOF';
  sections: ExternalAccessSectionKey[];
  summary: {
    propertyCount: number;
    /** Vrai : les totaux sont pondérés par la quote-part du propriétaire désigné. */
    ownerShareApplied: boolean;
    /** Présent (vrai) seulement quand le périmètre développé dépassait le plafond de biens et a été tronqué. */
    truncated?: true;
    totalEstimatedValue?: number;
    totalLatentCapitalGain?: number | null;
    totalRemainingLoanCapital?: number;
  };
  properties: ExternalAccessPropertyView[];
}

export interface ExternalAccessPropertyView {
  reference: string;
  title: string;
  address: string;
  city: string | null;
  sharePercent: number | null;
  valuation?: {
    estimatedValue: number;
    valuatedAt: string;
    acquisitionCost: number | null;
    currency: string;
    latentCapitalGain: number | null;
    history: Array<{ valuatedAt: string; estimatedValue: number; method: string }>;
  } | null;
  yield?: {
    /** `null` quand le bien n'a aucune valorisation (valeur courante nulle) : un 0 % serait trompeur. */
    grossYield: number | null;
    netYield: number | null;
    netNetYield: number | null;
    annualRent: number;
    annualExpenses: number;
  };
  loans?: Array<{
    lender: string;
    capitalAmount: number;
    remainingCapital: number;
    interestRate: number;
    monthlyPayment: number;
    currency: string;
    startDate: string;
    endDate: string;
    status: string;
  }>;
  expenses?: {
    totalLast12Months: number;
    items: Array<{ date: string; category: string; amount: number }>;
  };
  rents?: Array<{
    status: string;
    startDate: string;
    endDate: string | null;
    rentAmount: number;
    chargesAmount: number | null;
    billingFrequency: string;
  }>;
  titles?: {
    propertyType: string;
    surface: number | null;
    ownershipType: string;
    holdings: Array<{
      entityName: string;
      legalForm: string;
      country: string;
      rccm: string | null;
      taxId: string | null;
      sharePercent: number;
    }>;
    /**
     * Somme des parts détenues par des personnes physiques et par des entités
     * hors du grant : jamais de nom ni d'identifiant (pas d'identité de
     * co-indivisaire). `null` quand il n'y en a pas.
     */
    otherHoldersSharePercent: number | null;
    ownerSharePercent: number | null;
  };
  documents?: Array<{
    ref: string;
    fileName: string;
    documentType: string;
    fileSize: number | null;
    mimeType: string | null;
    createdAt: string;
  }>;
}

interface ConsultationContext {
  ip?: string;
  userAgent?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const YIELD_CHUNK = 5;
/** Plafonds par bien : bornent la taille d'une réponse. */
const MAX_HISTORY = 24;
const MAX_EXPENSE_ITEMS = 200;
const EXPENSE_HISTORY_MONTHS = 24;
const MAX_USER_AGENT = 500;

const num = (value: unknown): number => Number(value ?? 0);
const iso = (value: Date | null | undefined): string | null => (value ? value.toISOString() : null);
const isoRequired = (value: Date): string => value.toISOString();

interface ActiveGrant {
  id: string;
  type: ExternalAccessTypeKey;
  recipientName: string;
  sections: ExternalAccessSectionKey[];
  expiresAt: Date | null;
  ownerName: string | null;
  ownerClientId: string | null;
  agencyName: string;
}

/**
 * Le grant visé par le lien, ou `null` s'il est inconnu, d'une autre agence,
 * révoqué ou expiré. Relu à chaque appel : aucune mise en cache.
 */
async function loadActiveGrant(link: VerifiedSecureLink): Promise<ActiveGrant | null> {
  const grant = await prisma.externalAccessGrant.findFirst({
    where: { id: link.objectId, tenantId: link.tenantId },
    select: {
      id: true,
      type: true,
      recipientName: true,
      sections: true,
      expiresAt: true,
      revokedAt: true,
      ownerClientId: true,
      // Nom seulement ; `tenantId` du client revérifié (défense en profondeur).
      ownerClient: { select: { tenantId: true, user: { select: { fullName: true } } } },
      tenant: { select: { name: true } }
    }
  });
  if (!grant) return null;
  if (grant.revokedAt) return null;
  if (grant.expiresAt && grant.expiresAt.getTime() <= Date.now()) return null;

  const ownerInTenant = grant.ownerClient && grant.ownerClient.tenantId === link.tenantId ? grant.ownerClient : null;
  return {
    id: grant.id,
    type: grant.type,
    recipientName: grant.recipientName,
    sections: grant.sections,
    expiresAt: grant.expiresAt,
    ownerClientId: ownerInTenant ? grant.ownerClientId : null,
    ownerName: ownerInTenant ? ownerInTenant.user?.fullName || t('Propriétaire') : null,
    agencyName: grant.tenant?.name ?? ''
  };
}

function groupBy<T, K>(rows: T[], keyOf: (row: T) => K): Map<K, T[]> {
  const result = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = result.get(key);
    if (bucket) bucket.push(row);
    else result.set(key, [row]);
  }
  return result;
}

/**
 * Entrées de rendement, par lots de `YIELD_CHUNK` (concurrence limitée) :
 * `buildPropertyYieldInput` revérifie lui-même le bien (mandat compris) et coûte
 * ~6 requêtes. Le coût total est borné par `MAX_SCOPE_PROPERTIES` (100 biens) ;
 * on réutilise le moteur existant, sans second calcul.
 */
async function yieldInputsFor(tenantId: string, propertyIds: string[]): Promise<Map<string, YieldInput>> {
  const result = new Map<string, YieldInput>();
  for (let index = 0; index < propertyIds.length; index += YIELD_CHUNK) {
    const chunk = propertyIds.slice(index, index + YIELD_CHUNK);
    const inputs = await Promise.all(chunk.map(id => buildPropertyYieldInput(tenantId, id)));
    chunk.forEach((id, position) => result.set(id, inputs[position]));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Chargeurs de rubriques : chacun n'est appelé que si la rubrique est accordée.
// ---------------------------------------------------------------------------

async function loadValuations(tenantId: string, propertyIds: string[]) {
  const rows = await prisma.assetValuation.findMany({
    where: { tenantId, propertyId: { in: propertyIds } },
    select: {
      propertyId: true,
      valuatedAt: true,
      estimatedValue: true,
      acquisitionCost: true,
      currency: true,
      method: true
    },
    orderBy: [{ propertyId: 'asc' }, ...VALUATION_ORDER_BY]
  });
  return groupBy(rows, row => row.propertyId);
}

async function loadLoans(tenantId: string, propertyIds: string[]) {
  const rows = await prisma.propertyLoan.findMany({
    where: { tenantId, propertyId: { in: propertyIds } },
    select: {
      propertyId: true,
      lender: true,
      capitalAmount: true,
      remainingCapital: true,
      interestRate: true,
      monthlyPayment: true,
      currency: true,
      startDate: true,
      endDate: true,
      status: true
    },
    orderBy: [{ startDate: 'desc' }, { id: 'desc' }]
  });
  return groupBy(rows, row => row.propertyId);
}

async function loadExpenses(tenantId: string, propertyIds: string[], now: Date) {
  const since = new Date(now);
  since.setUTCMonth(since.getUTCMonth() - EXPENSE_HISTORY_MONTHS);
  const rows = await prisma.propertyExpense.findMany({
    where: { tenantId, propertyId: { in: propertyIds }, paidAt: { gte: since, lte: now } },
    // Ni `label`, ni `supplierName`, ni `notes`, ni justificatif : du texte interne.
    select: { propertyId: true, paidAt: true, category: true, amount: true },
    orderBy: [{ paidAt: 'desc' }, { id: 'desc' }]
  });
  return groupBy(rows, row => row.propertyId);
}

async function loadRents(tenantId: string, propertyIds: string[]) {
  const rows = await prisma.rentalLease.findMany({
    where: {
      tenant_id: tenantId,
      property_id: { in: propertyIds },
      status: { in: ['ACTIVE', 'SUSPENDED', 'ENDED'] }
    },
    // Aucune identité de locataire : ni `primary_renter_client_id`, ni coloc, ni notes.
    select: {
      property_id: true,
      status: true,
      start_date: true,
      end_date: true,
      rent_amount: true,
      service_charge_amount: true,
      billing_frequency: true
    },
    orderBy: [{ start_date: 'desc' }, { id: 'desc' }]
  });
  return groupBy(rows, row => row.property_id);
}

async function loadSharedDocuments(tenantId: string, grantId: string, propertyIds: string[]) {
  const rows = await prisma.externalAccessGrantDocument.findMany({
    where: { tenantId, grantId, propertyId: { in: propertyIds } },
    select: {
      id: true,
      propertyId: true,
      // Description seulement : jamais `filePath` ni `fileUrl`.
      document: {
        select: {
          propertyId: true,
          tenantId: true,
          documentType: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          createdAt: true
        }
      }
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  });
  // La ligne de liaison et le document doivent désigner le même bien, dans la même agence.
  const consistent = rows.filter(
    row =>
      row.document.propertyId === row.propertyId &&
      (row.document.tenantId === null || row.document.tenantId === tenantId)
  );
  return groupBy(consistent, row => row.propertyId);
}

/**
 * Détentions des biens du périmètre. Seules les personnes MORALES de l'agence
 * (forme juridique autre que INDIVIDUAL) listées dans le grant (quand le grant
 * liste des entités) sont détaillées ; toute autre détention (personne
 * physique, entité hors grant, entité d'une autre agence) est agrégée en une
 * somme de pourcentages, sans nom ni identifiant.
 */
async function loadHoldings(tenantId: string, propertyIds: string[], grantEntityIds: string[]) {
  const rows = await prisma.propertyHolding.findMany({
    where: { tenantId, propertyId: { in: propertyIds } },
    // Dénomination et immatriculation d'entité seulement, jamais son contact CRM ni ses notes.
    select: {
      propertyId: true,
      entityId: true,
      sharePercent: true,
      entity: { select: { tenantId: true, name: true, legalForm: true, country: true, rccm: true, taxId: true } }
    },
    orderBy: [{ sharePercent: 'desc' }, { id: 'asc' }]
  });
  // Un accès par biens seuls (aucune entité listée) ne nomme donc aucune société.
  const listed = new Set(grantEntityIds);
  const detailed = (row: (typeof rows)[number]): boolean =>
    row.entity.tenantId === tenantId && row.entity.legalForm !== 'INDIVIDUAL' && listed.has(row.entityId);

  const result = new Map<string, { shown: typeof rows; otherShare: number | null }>();
  // `propertyId: { in: [...] }` exclut les parts d'actifs non immobiliers (propertyId nul).
  for (const [propertyId, group] of groupBy(rows, row => row.propertyId as string)) {
    const others = group.filter(row => !detailed(row));
    result.set(propertyId, {
      shown: group.filter(detailed),
      otherShare:
        others.length === 0
          ? null
          : Math.round(others.reduce((sum, row) => sum + num(row.sharePercent), 0) * 10000) / 10000
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Assemblage
// ---------------------------------------------------------------------------

async function buildView(link: VerifiedSecureLink, grant: ActiveGrant): Promise<ExternalAccessViewDto | null> {
  const { tenantId } = link;
  const has = (section: ExternalAccessSectionKey) => grant.sections.includes(section);
  const now = new Date();

  const { properties: scope, truncated, grantEntityIds }: GrantScopeView = await resolveGrantScope(tenantId, grant.id);
  // Périmètre disparu (mandat échu, bien supprimé...) : même refus qu'un lien invalide.
  if (scope.length === 0) return null;
  const propertyIds = scope.map(property => property.id);

  const shares = grant.ownerClientId
    ? await ownerSharesByProperty(tenantId, grant.ownerClientId, propertyIds)
    : new Map<string, number>();
  const shareOf = (propertyId: string): number | null => shares.get(propertyId) ?? null;
  const factorOf = (propertyId: string): number => {
    const share = shareOf(propertyId);
    return share === null ? 1 : share / 100;
  };

  const needsYieldInput = has('VALUATIONS') || has('YIELD_RATIOS');
  const [valuations, loans, expenses, rents, documents, holdings, yieldInputs] = await Promise.all([
    has('VALUATIONS') ? loadValuations(tenantId, propertyIds) : null,
    has('LOANS') ? loadLoans(tenantId, propertyIds) : null,
    has('EXPENSES') ? loadExpenses(tenantId, propertyIds, now) : null,
    has('RENTS') ? loadRents(tenantId, propertyIds) : null,
    has('DOCUMENTS') ? loadSharedDocuments(tenantId, grant.id, propertyIds) : null,
    has('TITLES_OWNERSHIP') ? loadHoldings(tenantId, propertyIds, grantEntityIds) : null,
    needsYieldInput ? yieldInputsFor(tenantId, propertyIds) : null
  ]);

  let totalEstimatedValue = 0;
  let totalLatentCapitalGain = 0;
  let hasKnownGain = false;
  let totalRemainingLoanCapital = 0;
  const twelveMonthsAgo = new Date(now.getTime() - 365 * DAY_MS);

  const properties = scope.map((property): ExternalAccessPropertyView => {
    const factor = factorOf(property.id);
    const entry: ExternalAccessPropertyView = {
      reference: property.internalReference,
      title: property.title,
      address: property.address,
      city: property.locationZone,
      sharePercent: shareOf(property.id)
    };
    const yieldInput = yieldInputs?.get(property.id);

    if (valuations) {
      const rows = valuations.get(property.id) ?? [];
      const latest = rows[0];
      if (!latest) {
        entry.valuation = null;
      } else {
        const acquisition = rows.find(row => row.acquisitionCost !== null)?.acquisitionCost ?? null;
        // La plus-value latente vient du moteur de rendement : son coût de revient inclut les
        // dépenses capitalisées du bien (inférence acceptée : la rubrique VALUATIONS seule
        // laisse donc déduire un ordre de grandeur de ces dépenses).
        const gain = yieldInput ? latentCapitalGain(yieldInput) : null;
        entry.valuation = {
          estimatedValue: num(latest.estimatedValue),
          valuatedAt: isoRequired(latest.valuatedAt),
          acquisitionCost: acquisition === null ? null : num(acquisition),
          currency: latest.currency,
          latentCapitalGain: gain,
          history: rows.slice(0, MAX_HISTORY).map(row => ({
            valuatedAt: isoRequired(row.valuatedAt),
            estimatedValue: num(row.estimatedValue),
            method: row.method
          }))
        };
        totalEstimatedValue += num(latest.estimatedValue) * factor;
        if (gain !== null) {
          hasKnownGain = true;
          totalLatentCapitalGain += gain * factor;
        }
      }
    }

    if (has('YIELD_RATIOS') && yieldInput) {
      entry.yield = {
        // Sans valorisation (valeur courante nulle) : null, jamais un 0 % trompeur.
        grossYield: yieldInput.currentValue > 0 ? grossYield(yieldInput) : null,
        netYield: yieldInput.currentValue > 0 ? netYield(yieldInput) : null,
        // Le net-net se déduit des mensualités de prêt : réservé à qui voit les prêts.
        netNetYield: has('LOANS') ? netNetYield(yieldInput) : null,
        annualRent: yieldInput.annualRent,
        annualExpenses: yieldInput.annualExpenses
      };
    }

    if (loans) {
      const rows = loans.get(property.id) ?? [];
      entry.loans = rows.map(loan => ({
        lender: loan.lender,
        capitalAmount: num(loan.capitalAmount),
        remainingCapital: num(loan.remainingCapital),
        interestRate: num(loan.interestRate),
        monthlyPayment: num(loan.monthlyPayment),
        currency: loan.currency,
        startDate: isoRequired(loan.startDate),
        endDate: isoRequired(loan.endDate),
        status: loan.status
      }));
      for (const loan of rows) {
        if (loan.status === 'ACTIVE') totalRemainingLoanCapital += num(loan.remainingCapital) * factor;
      }
    }

    if (expenses) {
      const rows = expenses.get(property.id) ?? [];
      entry.expenses = {
        totalLast12Months: rows
          .filter(row => row.paidAt >= twelveMonthsAgo)
          .reduce((sum, row) => sum + num(row.amount), 0),
        items: rows.slice(0, MAX_EXPENSE_ITEMS).map(row => ({
          date: isoRequired(row.paidAt),
          category: row.category,
          amount: num(row.amount)
        }))
      };
    }

    if (rents) {
      entry.rents = (rents.get(property.id) ?? []).map(lease => ({
        status: lease.status,
        startDate: isoRequired(lease.start_date),
        endDate: iso(lease.end_date),
        rentAmount: num(lease.rent_amount),
        chargesAmount: lease.service_charge_amount === null ? null : num(lease.service_charge_amount),
        billingFrequency: lease.billing_frequency
      }));
    }

    if (holdings) {
      const held = holdings.get(property.id);
      entry.titles = {
        propertyType: property.propertyType,
        surface: property.surfaceArea ?? null,
        ownershipType: property.ownershipType,
        holdings: (held?.shown ?? []).map(holding => ({
          entityName: holding.entity.name,
          legalForm: holding.entity.legalForm,
          country: holding.entity.country,
          rccm: holding.entity.rccm,
          taxId: holding.entity.taxId,
          sharePercent: num(holding.sharePercent)
        })),
        otherHoldersSharePercent: held?.otherShare ?? null,
        ownerSharePercent: shareOf(property.id)
      };
    }

    if (documents) {
      entry.documents = (documents.get(property.id) ?? []).map(row => ({
        // Référence opaque : l'id de la ligne de liaison, jamais celui du document.
        ref: row.id,
        fileName: row.document.fileName,
        documentType: row.document.documentType,
        fileSize: row.document.fileSize,
        mimeType: row.document.mimeType,
        createdAt: isoRequired(row.document.createdAt)
      }));
    }
    return entry;
  });

  const summary: ExternalAccessViewDto['summary'] = {
    propertyCount: scope.length,
    ownerShareApplied: shares.size > 0,
    ...(truncated ? { truncated: true as const } : {})
  };
  if (has('VALUATIONS')) {
    summary.totalEstimatedValue = totalEstimatedValue;
    summary.totalLatentCapitalGain = hasKnownGain ? totalLatentCapitalGain : null;
  }
  if (has('LOANS')) summary.totalRemainingLoanCapital = totalRemainingLoanCapital;

  return {
    agencyName: grant.agencyName,
    grantType: grant.type,
    recipientName: grant.recipientName,
    ownerName: grant.ownerName,
    linkExpiresAt: link.expiresAt.toISOString(),
    accessExpiresAt: iso(grant.expiresAt),
    currency: 'XOF',
    sections: [...grant.sections],
    summary,
    properties
  };
}

/** Texte de journal : tronqué, jamais de saut de ligne. */
function clip(value: string | undefined | null, max: number): string | null {
  if (!value) return null;
  return value.replace(/[\r\n]+/g, ' ').slice(0, max);
}

/**
 * Lit la vue d'un accès par son jeton. Tout refus (jeton inconnu, expiré,
 * révoqué, mauvaise portée, accès révoqué/expiré, périmètre disparu) lève la
 * MÊME `NotFoundError`.
 */
export async function getExternalAccessViewByToken(
  token: string,
  ctx: ConsultationContext
): Promise<ExternalAccessViewDto> {
  const link = await verifySecureLink(token, EXTERNAL_ACCESS_LINK_SCOPE);
  if (link.objectType !== EXTERNAL_ACCESS_OBJECT_TYPE) throw invalidSecureLinkError();

  let result: { dto: ExternalAccessViewDto; grantId: string; sections: ExternalAccessSectionKey[] } | null;
  try {
    result = await runWithTenantContext({ tenantId: link.tenantId }, async () => {
      const grant = await loadActiveGrant(link);
      if (!grant) return null;
      const dto = await buildView(link, grant);
      return dto ? { dto, grantId: grant.id, sections: grant.sections } : null;
    });
  } catch (error) {
    // Un bien qui sort du périmètre entre deux lectures (NotFoundError du calcul
    // de rendement) se comporte comme un lien invalide, jamais comme un 404 distinct.
    if (error instanceof NotFoundError) throw invalidSecureLinkError();
    throw error;
  }
  if (!result) throw invalidSecureLinkError();
  const { grantId } = result;

  // Journal PUIS compteur, chacun isolé : l'échec du compteur ne supprime pas la
  // trace d'audit, et aucun des deux ne transforme une lecture réussie en erreur.
  // Seuls l'identifiant du lien et le type d'erreur sortent dans les journaux.
  try {
    logAuditEvent({
      actorUserId: null,
      tenantId: link.tenantId,
      actionKey: AuditActionKey.EXTERNAL_ACCESS_GRANT_VIEWED,
      entityType: EXTERNAL_ACCESS_OBJECT_TYPE,
      entityId: result.grantId,
      ipAddress: ctx.ip ?? null,
      userAgent: clip(ctx.userAgent, MAX_USER_AGENT),
      payload: { grantId: result.grantId, linkId: link.id, sections: result.sections }
    });
  } catch (error) {
    logger.warn('External access view could not be recorded', {
      linkId: link.id,
      errorName: error instanceof Error ? error.name : 'UnknownError'
    });
  }
  try {
    await runWithTenantContext({ tenantId: link.tenantId }, () =>
      prisma.externalAccessGrant.updateMany({
        where: { id: grantId, tenantId: link.tenantId },
        data: { viewCount: { increment: 1 }, lastViewedAt: new Date() }
      })
    );
  } catch (error) {
    logger.warn('External access view counter could not be updated', {
      linkId: link.id,
      errorName: error instanceof Error ? error.name : 'UnknownError'
    });
  }
  return result.dto;
}

/**
 * Télécharge un document partagé. Revérifie à CHAQUE appel : le jeton, le
 * grant (non révoqué, non expiré), la rubrique DOCUMENTS, que `documentRef`
 * est une ligne de liaison de CE grant, et que le bien est encore dans le
 * périmètre. Document hors grant, hors périmètre, rubrique non accordée,
 * fichier absent : même 404 uniforme.
 */
export async function getExternalAccessDocumentByToken(
  token: string,
  documentRef: string,
  ctx: ConsultationContext
): Promise<PrivateFile> {
  const link = await verifySecureLink(token, EXTERNAL_ACCESS_LINK_SCOPE);
  if (link.objectType !== EXTERNAL_ACCESS_OBJECT_TYPE) throw invalidSecureLinkError();

  let found: { file: PrivateFile; grantId: string; documentName: string } | null;
  try {
    found = await runWithTenantContext({ tenantId: link.tenantId }, async () => {
      const grant = await loadActiveGrant(link);
      if (!grant || !grant.sections.includes('DOCUMENTS')) return null;

      const row = await prisma.externalAccessGrantDocument.findFirst({
        where: { id: documentRef, grantId: grant.id, tenantId: link.tenantId },
        select: {
          propertyId: true,
          documentId: true,
          document: { select: { propertyId: true, tenantId: true, fileName: true } }
        }
      });
      if (!row || row.document.propertyId !== row.propertyId) return null;
      if (row.document.tenantId !== null && row.document.tenantId !== link.tenantId) return null;

      // Le bien doit être, MAINTENANT, dans le périmètre du grant (mandat compris).
      const { properties: scope } = await resolveGrantScope(link.tenantId, grant.id);
      if (!scope.some(property => property.id === row.propertyId)) return null;

      const file = await getPropertyDocumentFileForTenant(link.tenantId, row.propertyId, row.documentId, {
        managedByMandate: true
      });
      return { file, grantId: grant.id, documentName: row.document.fileName };
    });
  } catch (error) {
    // Fichier absent du disque ou bien disparu : le même refus que le reste.
    if (error instanceof NotFoundError) throw invalidSecureLinkError();
    throw error;
  }
  if (!found) throw invalidSecureLinkError();

  try {
    logAuditEvent({
      actorUserId: null,
      tenantId: link.tenantId,
      actionKey: AuditActionKey.EXTERNAL_ACCESS_GRANT_DOCUMENT_DOWNLOADED,
      entityType: EXTERNAL_ACCESS_OBJECT_TYPE,
      entityId: found.grantId,
      ipAddress: ctx.ip ?? null,
      userAgent: clip(ctx.userAgent, MAX_USER_AGENT),
      payload: {
        grantId: found.grantId,
        linkId: link.id,
        sections: ['DOCUMENTS'],
        documentRef,
        documentName: found.documentName
      }
    });
  } catch (error) {
    logger.warn('External access download could not be recorded', {
      linkId: link.id,
      errorName: error instanceof Error ? error.name : 'UnknownError'
    });
  }
  return found.file;
}
