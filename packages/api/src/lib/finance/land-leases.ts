/**
 * Baux de terrain — lot 4, premier sous-lot (`specs/019-finance-baux-terrain/`).
 *
 * Implémente les dix fonctions du contrat gelé (`./types-lot4.ts`) : le bail
 * et son compte de tiers, le rattachement d'un chantier, le paiement annuel
 * (brouillon puis validé) et la constatation mensuelle du douzième — la seule
 * pièce du module qui naît déjà validée.
 *
 * Style suivi : `suppliers.ts` (lot 2) pour le cycle brouillon → validation et
 * la mise à jour conditionnelle qui ferme la fenêtre de concurrence,
 * `cash.ts` pour la discipline « lecture avant écriture » imposée par
 * PostgreSQL (une commande en échec condamne toute la transaction — voir
 * l'en-tête de `ledger.ts`).
 *
 * ---------------------------------------------------------------------------
 * Mise à jour du 19 septembre 2026 — le schéma a été complété
 * ---------------------------------------------------------------------------
 *
 * La première version de ce fichier documentait ici trois écarts entre le
 * contrat gelé et le schéma gelé. Le plus grave (pas de table pour persister
 * la ventilation d'une constatation par chantier) videait le sous-lot de son
 * sens : sans imputation `CostAllocation` réelle, le loyer d'un terrain
 * n'entrait JAMAIS dans le coût réel du chantier (`sumSiteActualCost` ne
 * somme que des `CostAllocation`). La migration
 * `20260919220000_land_lease_cost_allocation` a comblé les trois manques :
 *
 *   1. `CostAllocationSourceType` (enum Postgres) porte désormais
 *      `LAND_LEASE_ACCRUAL` — une constatation peut donc imputer un vrai
 *      `CostAllocation`, lu par `sumSiteActualCost` comme n'importe quelle
 *      facture ou pièce de caisse.
 *   2. `SourceType` (enum Postgres du journal général) porte désormais
 *      `LAND_LEASE_PAYMENT` et `LAND_LEASE_ACCRUAL` — la table
 *      `SOURCE_TYPE_BY_DOCUMENT` d'`accounting.ts` sera complétée à
 *      l'intégration pour que les écritures de ce fichier cessent de
 *      retomber sur `sourceType = 'MANUAL'`.
 *   3. `LandLease` porte désormais `costCategoryId`, obligatoire et choisi à
 *      la création (`CreateLandLeaseTx`) : c'est le poste que chaque
 *      constatation impute.
 *
 * **Un écart subsiste, plus étroit, et non corrigible depuis ce fichier** :
 * `VoidableDocumentType` (le type de `PostDocumentEntryTx.documentType`,
 * `types-lot2.ts`, gelé) et `FinanceSourceType` (`types.ts`, gelé) n'ont, eux,
 * pas été étendus — seuls les DEUX ENUMS POSTGRES ci-dessus l'ont été, pas les
 * unions TypeScript qui gardent ces deux paramètres. `asDocumentType` et
 * `asFinanceSourceType` restent donc nécessaires : sans eux, `postDocumentEntryTx`
 * et `appendThirdPartyMovementTx` refuseraient à la compilation les valeurs
 * 'LAND_LEASE_PAYMENT'/'LAND_LEASE_ACCRUAL', alors que les colonnes réelles
 * qu'ils écrivent (`JournalEntry.documentType`, `ThirdPartyMovement.sourceType`)
 * sont toutes deux des `String` libres en base, pas des enums.
 */

import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { badRequest, conflict, notFound } from '../errors';
import { ensureOperationalChartOfAccountsTx, ensureOperationalJournalTx, postDocumentEntryTx } from './accounting';
import { syncWorkProgramCostTx } from './cost-allocation';
import { appendThirdPartyMovementTx } from './ledger';
import { roundMoneyXof } from './money';
import { ensureDefaultTreasuryAccountTx } from '../treasury/accounts';
import type { FinanceSourceType } from './types';
import { toAmountOrZero } from './types';
import type {
  AttachSiteToLandLeaseTx,
  CreateLandLeasePaymentTx,
  CreateLandLeaseTx,
  GetLandLease,
  LandLeaseAccrualRecord,
  LandLeasePaymentRecord,
  LandLeaseRecord,
  LandLeaseSiteRef,
  ListLandLeaseAccruals,
  ListLandLeasePayments,
  ListLandLeases,
  RecordLandLeaseAccrualTx,
  RunMonthlyLandLeaseAccruals,
  ValidateLandLeasePaymentTx
} from './types-lot4';

/** Devise unique du lot (décision D9 du plan, déjà actée au lot 1). */
const DEFAULT_CURRENCY = 'XOF';

// ---------------------------------------------------------------------------
// Transtypages — voir le point 1 et 2 de l'en-tête du fichier
// ---------------------------------------------------------------------------

type LandLeaseSourceType = 'LAND_LEASE_PAYMENT' | 'LAND_LEASE_ACCRUAL';

function asFinanceSourceType(value: LandLeaseSourceType): FinanceSourceType {
  return value as unknown as FinanceSourceType;
}

/**
 * `PostDocumentEntryTx.documentType` (types-lot2.ts, gelé) est typé
 * `VoidableDocumentType | 'VOID'`, un enum Postgres qui ne connaît que les
 * pièces du lot 2. La colonne réelle est un `String` libre (voir l'en-tête).
 */
function asDocumentType(value: LandLeaseSourceType): any {
  return value;
}

// ---------------------------------------------------------------------------
// Chantiers « actifs » — le contrat ne définit pas ce mot pour un statut
// ---------------------------------------------------------------------------

/**
 * HYPOTHÈSE (voir la rubrique dédiée du rapport) : le contrat (`types-lot4.ts`,
 * `data-model.md` §3.1) parle de « chantiers actifs du bail » sans jamais
 * définir ce mot en fonction de `ConstructionSiteStatus` (PLANNED, IN_PROGRESS,
 * SUSPENDED, CLOSED). Faute d'un mot plus précis, « actif » est ici lu comme
 * « non clos » : un chantier planifié ou suspendu peut encore recevoir sa part
 * du loyer du terrain qu'il occupe, alors qu'un chantier clos ne consomme plus
 * rien. Un chantier sans aucun statut « actif » au sens ci-dessous se comporte
 * comme un bail sans chantier (allocations vides).
 */
/**
 * Les statuts qui absorbent le loyer du terrain.
 *
 * `CLOSED` en est absent, et c'est ce qui tient lieu ici de la garde
 * `assertSiteOpenTx` du sous-lot 6 : un chantier clos sort de la repartition,
 * et le loyer se repartit sur les chantiers restants. L'appel explicite serait
 * du code mort — un chantier clos n'arrive jamais jusqu'a l'imputation.
 */
const ACTIVE_SITE_STATUSES = ['PLANNED', 'IN_PROGRESS', 'SUSPENDED'] as const;

// ---------------------------------------------------------------------------
// Comptes et journal opérationnels
// ---------------------------------------------------------------------------

interface OperationalAccounts {
  journalId: string;
  /**
   * 476 — Charges constatées d'avance : le loyer payé, pas encore consommé.
   *
   * Numéro corrigé le 23 septembre 2026 (consolidation SYSCOHADA, point 6) :
   * le 486 n'existe pas dans ce plan, 476 est le bon compte de cette nature.
   * Une agence dont le 486 porte déjà des écritures garde ce compte — voir
   * `legacyPrepaidAccountTx` ci-dessous, même logique de reprise que
   * `legacyAccountWithLinesTx` dans `treasury/accounts.ts`.
   */
  prepaidExpenseAccountId: string;
  /** 613 — Locations : la part du loyer consommée le mois constaté. */
  rentExpenseAccountId: string;
  /** Caisse : la même trésorerie que partout ailleurs, résolue par `treasury/accounts.ts`. */
  cashAccountId: string;
}

/**
 * Un compte '486' hérité qui porte déjà des écritures, pour une agence déjà
 * en production avant la correction du 23 septembre 2026. On ne migre pas
 * une trésorerie ou un compte de charges constatées d'avance en changeant
 * simplement son numéro : une agence qui a déjà compté dessus le garde.
 */
async function legacyPrepaidAccountTx(tx: PrismaTransactionClient, tenantId: string): Promise<string | null> {
  const account = await tx.chartOfAccount.findFirst({
    where: { tenantId, scope: 'OPERATIONS', accountNumber: '486' },
    select: { id: true }
  });
  if (!account) return null;
  const line = await tx.journalEntryLine.findFirst({ where: { accountId: account.id }, select: { id: true } });
  return line ? account.id : null;
}

/**
 * Résout le journal et les comptes dont une pièce de bail de terrain a
 * besoin. Délègue entièrement à `accounting.ts`, comme `suppliers.ts` et
 * `cash.ts` : ce fichier ne porte aucune copie du plan de comptes.
 */
async function resolveOperationalAccounts(
  tx: PrismaTransactionClient,
  tenantId: string,
  entryDate: Date
): Promise<OperationalAccounts> {
  const [journalId, comptes, cashTreasury, legacyPrepaidAccountId] = await Promise.all([
    ensureOperationalJournalTx(tx, tenantId, entryDate.getUTCFullYear()),
    ensureOperationalChartOfAccountsTx(tx, tenantId),
    ensureDefaultTreasuryAccountTx(tx, tenantId, 'CASH'),
    legacyPrepaidAccountTx(tx, tenantId)
  ]);

  const exiger = (numero: string): string => {
    const id = comptes.get(numero);
    if (!id) {
      throw new Error(`Compte opérationnel ${numero} absent après amorçage du plan de comptes.`);
    }
    return id;
  };

  return {
    journalId,
    prepaidExpenseAccountId: legacyPrepaidAccountId ?? exiger('476'),
    rentExpenseAccountId: exiger('613'),
    cashAccountId: cashTreasury.chartOfAccountId
  };
}

// ---------------------------------------------------------------------------
// Conversions Prisma -> contrat
// ---------------------------------------------------------------------------

function toLandLeaseRecord(row: any, sites: LandLeaseSiteRef[], accountBalance: number): LandLeaseRecord {
  const annualAmount = roundMoneyXof(toAmountOrZero(row.annualAmount));
  return {
    id: row.id,
    tenantId: row.tenantId,
    landlordAccountId: row.landlordAccountId,
    landlordName: row.landlordName,
    landLabel: row.landLabel,
    annualAmount,
    costCategoryId: row.costCategoryId,
    // Résolu par la même requête que le reste du bail (`include`), jamais une
    // requête séparée par ligne — voir les appelants de cette fonction.
    costCategoryLabel: row.costCategory?.label ?? 'Poste de dépense inconnu',
    // Calculé, jamais stocké (voir `LandLeaseRecord.monthlyAmount`, types-lot4.ts).
    monthlyAmount: roundMoneyXof(annualAmount / 12),
    currency: row.currency,
    startDate: row.startDate,
    endDate: row.endDate ?? null,
    isActive: row.isActive,
    sites,
    accountBalance
  };
}

function toCreatedByLabel(user?: { fullName?: string | null; email?: string | null } | null): string {
  return user?.fullName || user?.email || 'Utilisateur inconnu';
}

function toLandLeasePaymentRecord(row: any, landlordName: string): LandLeasePaymentRecord {
  return {
    id: row.id,
    landLeaseId: row.landLeaseId,
    landlordName,
    paymentDate: row.paymentDate,
    amount: roundMoneyXof(toAmountOrZero(row.amount)),
    currency: row.currency,
    coverageStartDate: row.coverageStartDate,
    coverageEndDate: row.coverageEndDate,
    status: row.validatedAt ? 'VALIDATED' : 'DRAFT',
    createdByLabel: toCreatedByLabel(row.createdBy),
    validatedAt: row.validatedAt ?? null
  };
}

// ---------------------------------------------------------------------------
// Lectures par lot — sites rattachés et solde des comptes de bailleur
//
// « Libellés résolus par requête PAR LOT, jamais une par ligne » : une seule
// requête sert `listLandLeases` pour N baux, jamais N requêtes.
// ---------------------------------------------------------------------------

async function loadSitesByLeaseIds(
  client: PrismaTransactionClient,
  tenantId: string,
  leaseIds: string[]
): Promise<Map<string, LandLeaseSiteRef[]>> {
  const map = new Map<string, LandLeaseSiteRef[]>();
  if (leaseIds.length === 0) {
    return map;
  }

  const rows = await client.constructionSite.findMany({
    where: { tenantId, landLeaseId: { in: leaseIds } },
    select: { id: true, name: true, status: true, landLeaseId: true },
    orderBy: { createdAt: 'asc' }
  });

  for (const row of rows as Array<Record<string, any>>) {
    const leaseId = row.landLeaseId as string;
    const list = map.get(leaseId) ?? [];
    list.push({ siteId: row.id, siteLabel: row.name, status: row.status });
    map.set(leaseId, list);
  }

  return map;
}

async function loadBalancesByAccountIds(
  client: PrismaTransactionClient,
  accountIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (accountIds.length === 0) {
    return map;
  }

  const rows = await client.thirdPartyAccount.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, balance: true }
  });

  for (const row of rows as Array<Record<string, any>>) {
    map.set(row.id, roundMoneyXof(toAmountOrZero(row.balance)));
  }

  return map;
}

/** Charge sites et solde pour UN SEUL bail — même requêtes que ci-dessus, sans lot à faire. */
async function loadSingleLeaseAssociations(
  client: PrismaTransactionClient,
  tenantId: string,
  leaseId: string,
  landlordAccountId: string
): Promise<{ sites: LandLeaseSiteRef[]; accountBalance: number }> {
  const [sitesByLease, balanceByAccount] = await Promise.all([
    loadSitesByLeaseIds(client, tenantId, [leaseId]),
    loadBalancesByAccountIds(client, [landlordAccountId])
  ]);
  return {
    sites: sitesByLease.get(leaseId) ?? [],
    accountBalance: balanceByAccount.get(landlordAccountId) ?? 0
  };
}

// ---------------------------------------------------------------------------
// A. Enregistrement du bail et de son compte de tiers
// ---------------------------------------------------------------------------

/** Voir `CreateLandLeaseTx` dans `./types-lot4.ts`. */
export const createLandLeaseTx: CreateLandLeaseTx = async (tx, tenantId, params) => {
  if (!params.landlordName?.trim()) {
    throw badRequest('Le nom du bailleur est obligatoire');
  }
  if (!params.landLabel?.trim()) {
    throw badRequest('Le libellé du terrain est obligatoire');
  }

  const annualAmount = roundMoneyXof(params.annualAmount);
  if (annualAmount <= 0) {
    throw badRequest('Le montant annuel du bail doit être strictement positif');
  }
  if (params.endDate && params.endDate <= params.startDate) {
    throw badRequest('La date de fin du bail doit être postérieure à la date de début');
  }

  // Le poste est demandé, jamais deviné (voir le commentaire du contrat sur
  // `CreateLandLeaseTx.costCategoryId`) : c'est la gestionnaire qui sait si le
  // loyer relève des « Divers » ou d'un poste créé pour cela. Vérifié AVANT
  // toute écriture, même discipline qu'ailleurs.
  const costCategory = await tx.costCategory.findFirst({
    where: { id: params.costCategoryId, tenantId },
    select: { id: true, label: true, isActive: true }
  });
  if (!costCategory) {
    throw notFound('Poste de dépense introuvable');
  }
  if (!costCategory.isActive) {
    // Refus délibéré, pas un repli sur un autre poste : un poste désactivé
    // est un geste de paramétrage voulu par la gestionnaire (même règle qu'à
    // la pièce de caisse, `cash.ts`, `createCashVoucherTx`).
    throw conflict('Ce poste de dépense est désactivé');
  }

  // Le compte naît avec le bail, dans la même transaction : un bail sans
  // compte ne pourrait rien devoir, et le premier paiement le trouverait
  // manquant. Même raison qu'au lot 2 pour le fournisseur.
  const account = await tx.thirdPartyAccount.create({
    data: {
      tenantId,
      kind: 'LANDLORD' as any,
      label: params.landlordName,
      balance: 0,
      currency: DEFAULT_CURRENCY
    }
  });

  const lease = await tx.landLease.create({
    data: {
      tenantId,
      landlordAccountId: account.id,
      landlordName: params.landlordName,
      landLabel: params.landLabel,
      annualAmount,
      costCategoryId: costCategory.id,
      currency: DEFAULT_CURRENCY,
      startDate: params.startDate,
      endDate: params.endDate ?? null
    }
  });

  return toLandLeaseRecord({ ...lease, costCategory }, [], 0);
};

// ---------------------------------------------------------------------------
// B. Rattachement d'un chantier
// ---------------------------------------------------------------------------

/** Voir `AttachSiteToLandLeaseTx` dans `./types-lot4.ts`. */
export const attachSiteToLandLeaseTx: AttachSiteToLandLeaseTx = async (tx, tenantId, siteId, landLeaseId) => {
  const site = await tx.constructionSite.findFirst({ where: { id: siteId, tenantId }, select: { id: true } });
  if (!site) {
    throw notFound('Chantier introuvable');
  }

  if (landLeaseId === null) {
    // Détache : aucun bail à renvoyer, `null` est la réponse elle-même (voir
    // le commentaire du contrat sur cette fonction).
    await tx.constructionSite.update({ where: { id: siteId }, data: { landLeaseId: null } });
    return null;
  }

  const lease = await tx.landLease.findFirst({
    where: { id: landLeaseId, tenantId },
    include: { costCategory: { select: { label: true } } }
  });
  if (!lease) {
    throw notFound('Bail de terrain introuvable');
  }

  // Remplace le lien sans erreur si le chantier dépendait déjà d'un autre
  // bail : c'est une correction, pas un conflit (voir le contrat). Aucune
  // constatation passée n'est recalculée — cette fonction ne touche à rien
  // d'autre que la colonne `landLeaseId`.
  await tx.constructionSite.update({ where: { id: siteId }, data: { landLeaseId } });

  const { sites, accountBalance } = await loadSingleLeaseAssociations(tx, tenantId, lease.id, lease.landlordAccountId);
  return toLandLeaseRecord(lease, sites, accountBalance);
};

// ---------------------------------------------------------------------------
// C. Lectures — liste et détail d'un bail
// ---------------------------------------------------------------------------

/** Voir `ListLandLeases` dans `./types-lot4.ts`. */
export const listLandLeases: ListLandLeases = async (tenantId, filters) => {
  const rows = await prisma.landLease.findMany({
    where: { tenantId, ...(filters?.onlyActive ? { isActive: true } : {}) },
    include: { costCategory: { select: { label: true } } },
    orderBy: { createdAt: 'desc' }
  });

  if (rows.length === 0) {
    return [];
  }

  const [sitesByLease, balanceByAccount] = await Promise.all([
    loadSitesByLeaseIds(
      prisma,
      tenantId,
      rows.map((row: any) => row.id)
    ),
    loadBalancesByAccountIds(
      prisma,
      rows.map((row: any) => row.landlordAccountId)
    )
  ]);

  return rows.map((row: any) =>
    toLandLeaseRecord(row, sitesByLease.get(row.id) ?? [], balanceByAccount.get(row.landlordAccountId) ?? 0)
  );
};

/** Voir `GetLandLease` dans `./types-lot4.ts`. */
export const getLandLease: GetLandLease = async (tenantId, landLeaseId) => {
  const row = await prisma.landLease.findFirst({
    where: { id: landLeaseId, tenantId },
    include: { costCategory: { select: { label: true } } }
  });
  if (!row) {
    throw notFound('Bail de terrain introuvable');
  }

  const { sites, accountBalance } = await loadSingleLeaseAssociations(prisma, tenantId, row.id, row.landlordAccountId);
  return toLandLeaseRecord(row, sites, accountBalance);
};

// ---------------------------------------------------------------------------
// D. Paiement annuel — saisie en brouillon
// ---------------------------------------------------------------------------

/** Voir `CreateLandLeasePaymentTx` dans `./types-lot4.ts`. */
export const createLandLeasePaymentTx: CreateLandLeasePaymentTx = async (tx, tenantId, params) => {
  const lease = await tx.landLease.findFirst({ where: { id: params.landLeaseId, tenantId } });
  if (!lease) {
    throw notFound('Bail de terrain introuvable');
  }

  const amount = roundMoneyXof(params.amount);
  if (amount <= 0) {
    throw badRequest('Le montant du paiement doit être strictement positif');
  }
  if (params.coverageEndDate <= params.coverageStartDate) {
    throw badRequest('La période couverte par le paiement doit se terminer après son début');
  }

  // BROUILLON. Ni écriture, ni mouvement de compte : un paiement saisi n'a
  // encore rien payé. Tout naît à la validation (`validateLandLeasePaymentTx`),
  // comme toute pièce depuis le lot 2.
  const payment = await tx.landLeasePayment.create({
    data: {
      tenantId,
      landLeaseId: params.landLeaseId,
      paymentDate: params.paymentDate,
      amount,
      currency: lease.currency,
      coverageStartDate: params.coverageStartDate,
      coverageEndDate: params.coverageEndDate,
      createdByUserId: params.createdByUserId
    },
    include: { createdBy: { select: { fullName: true, email: true } } }
  });

  return toLandLeasePaymentRecord(payment, lease.landlordName);
};

// ---------------------------------------------------------------------------
// E. Paiement annuel — validation (écriture + mouvement, une transaction)
// ---------------------------------------------------------------------------

/** Voir `ValidateLandLeasePaymentTx` dans `./types-lot4.ts`. */
export const validateLandLeasePaymentTx: ValidateLandLeasePaymentTx = async (
  tx,
  tenantId,
  paymentId,
  validatedByUserId
) => {
  const payment = await tx.landLeasePayment.findFirst({ where: { id: paymentId, tenantId } });
  if (!payment) {
    throw notFound('Paiement de bail introuvable');
  }
  if (payment.validatedAt) {
    // Ce qui est validé ne bouge plus (principe P-6) : une seconde validation
    // n'est pas une mise à jour, c'est un refus.
    throw conflict('Ce paiement de bail est déjà validé');
  }

  const lease = await tx.landLease.findFirst({ where: { id: payment.landLeaseId, tenantId } });
  if (!lease) {
    throw notFound('Bail de terrain introuvable pour ce paiement');
  }

  const amount = roundMoneyXof(toAmountOrZero(payment.amount));
  const accounts = await resolveOperationalAccounts(tx, tenantId, payment.paymentDate);

  // Journal : débit des charges constatées d'avance (476, ou 486 hérité),
  // crédit de la caisse. C'est le paiement lui-même, pas encore sa consommation.
  const entry = await postDocumentEntryTx(tx, {
    tenantId,
    journalId: accounts.journalId,
    entryDate: payment.paymentDate,
    reference: `BAIL-${lease.id}-${payment.paymentDate.getTime()}`,
    description: `Paiement annuel de bail — ${lease.landlordName} — ${lease.landLabel}`,
    documentType: asDocumentType('LAND_LEASE_PAYMENT'),
    documentId: payment.id,
    lines: [
      { accountId: accounts.prepaidExpenseAccountId, debit: amount, label: `Loyer d'avance — ${lease.landlordName}` },
      { accountId: accounts.cashAccountId, credit: amount, label: `Paiement de bail — ${lease.landlordName}` }
    ]
  });

  // Compte de tiers : le bailleur nous doit désormais la jouissance du
  // terrain pour tout le montant versé. `settled` fait descendre le solde
  // (négatif = avance versée), symétrique exact de l'acompte fournisseur du
  // lot 2 — voir `LandLeaseRecord.accountBalance` dans le contrat.
  const movement = await appendThirdPartyMovementTx(tx, {
    accountId: lease.landlordAccountId,
    tenantId,
    type: 'PAYMENT',
    settled: amount,
    label: `Paiement annuel — ${lease.landLabel}`,
    sourceType: asFinanceSourceType('LAND_LEASE_PAYMENT'),
    sourceId: payment.id,
    movementDate: payment.paymentDate
  });
  if (!movement) {
    throw notFound('Compte du bailleur introuvable');
  }

  // Mise à jour conditionnelle, même discipline qu'à la pièce de caisse et au
  // règlement fournisseur : si une autre transaction a validé ce même
  // paiement entre notre lecture et cet instant, `count` vaut 0 et on
  // abandonne — l'écriture et le mouvement créés ici repartent avec le
  // rollback, rien ne subsiste en double.
  const updateResult = await tx.landLeasePayment.updateMany({
    where: { id: payment.id, tenantId, validatedAt: null },
    data: { validatedAt: new Date(), validatedByUserId, journalEntryId: entry.entryId }
  });
  if (updateResult.count !== 1) {
    throw conflict("Ce paiement de bail vient d'être validé par ailleurs");
  }

  const updated = await tx.landLeasePayment.findFirst({
    where: { id: payment.id, tenantId },
    include: { createdBy: { select: { fullName: true, email: true } } }
  });
  return toLandLeasePaymentRecord(updated, lease.landlordName);
};

// ---------------------------------------------------------------------------
// F. Paiements — liste
// ---------------------------------------------------------------------------

/** Voir `ListLandLeasePayments` dans `./types-lot4.ts`. */
export const listLandLeasePayments: ListLandLeasePayments = async (tenantId, landLeaseId) => {
  const lease = await prisma.landLease.findFirst({
    where: { id: landLeaseId, tenantId },
    select: { id: true, landlordName: true }
  });
  if (!lease) {
    throw notFound('Bail de terrain introuvable');
  }

  const rows = await prisma.landLeasePayment.findMany({
    where: { landLeaseId, tenantId },
    include: { createdBy: { select: { fullName: true, email: true } } },
    orderBy: { paymentDate: 'desc' }
  });

  return rows.map((row: any) => toLandLeasePaymentRecord(row, lease.landlordName));
};

// ---------------------------------------------------------------------------
// G. Le douzième — calcul de l'ordre de mois et du montant
// ---------------------------------------------------------------------------

/**
 * Numéro d'ordre (1..12) du mois cible dans le cycle annuel du bail, compté
 * depuis sa date de début — jamais depuis janvier (contrat, section « le
 * douzième et son reliquat »). Un bail qui commence en mars a son douzième
 * mois en février suivant : mars=1, avril=2, ..., février suivant=12,
 * puis mars suivant recommence à 1.
 *
 * Les mois sont comptés en UTC : les dates qui traversent cette fonction
 * viennent de colonnes `DateTime` Prisma, déjà normalisées en UTC à l'entrée
 * (`startDate`) et fournies en paramètre (`periodYear`/`periodMonth`, des
 * entiers sans fuseau). Utiliser les accesseurs locaux exposerait le calcul
 * au fuseau du serveur qui l'exécute.
 */
function leaseMonthOrdinal(startDate: Date, periodYear: number, periodMonth: number): number {
  const startIndex = startDate.getUTCFullYear() * 12 + (startDate.getUTCMonth() + 1);
  const targetIndex = periodYear * 12 + periodMonth;
  const elapsed = targetIndex - startIndex;
  if (elapsed < 0) {
    throw badRequest('La période demandée est antérieure à la date de début du bail');
  }
  return (elapsed % 12) + 1;
}

/**
 * Montant du douzième pour un ordre de mois donné.
 *
 * Onze mois à `arrondi(annuel / 12)`, le douzième absorbe le reliquat :
 * `annuel − 11 × arrondi(annuel / 12)`. Sans cela, douze douzièmes ne
 * feraient pas un an, et le compte du bailleur n'atteindrait jamais
 * exactement zéro — ce que le PRD exige explicitement (contrat, `data-model.md` §3.2).
 */
function computeAccrualAmount(annualAmount: number, ordinal: number): number {
  const monthly = roundMoneyXof(annualAmount / 12);
  if (ordinal === 12) {
    return roundMoneyXof(annualAmount - 11 * monthly);
  }
  return monthly;
}

// ---------------------------------------------------------------------------
// H. Le prorata entre chantiers actifs — imputations RÉELLES, persistées
//
// Chaque constatation crée une vraie ligne `CostAllocation` par chantier actif
// (`sourceType: 'LAND_LEASE_ACCRUAL'`, `sourceId` = l'identifiant de la
// constatation, poste = celui du bail), exactement comme une facture
// fournisseur ou une pièce de caisse. C'est ce filtre précis — imputations
// validées, non annulées — que `sumSiteActualCost` (`site-cost.ts`) lit pour
// calculer le coût réel d'un chantier : sans cette persistance, le loyer d'un
// terrain n'entrait JAMAIS dans ce coût, ce qui aurait vidé le sous-lot de son
// sens (voir l'en-tête du fichier, « mise à jour du 19 septembre 2026 »).
//
// Conséquence directe : une constatation ANCIENNE relue via
// `listLandLeaseAccruals` montre désormais la répartition qu'elle a
// RÉELLEMENT produite, jamais un recalcul sur les chantiers actuellement
// actifs. Rattacher ou détacher un chantier après coup ne change plus rien à
// l'affichage d'une constatation passée — la fissure documentée dans la
// version précédente de ce fichier est refermée.
// ---------------------------------------------------------------------------

/**
 * Répartit `amount` (déjà arrondi à l'unité de franc) à parts égales entre
 * `siteCount` chantiers, le reliquat d'arrondi allant au premier — celui
 * d'indice 0, à charge de l'appelant de trier ses chantiers par ordre de
 * création avant d'appeler cette fonction. La division entière garantit que
 * la somme des parts vaut exactement `amount`, y compris quand `siteCount` ne
 * divise pas `amount` (critère de sortie §7.3).
 */
function splitAmountAcrossSites(amount: number, siteCount: number): number[] {
  if (siteCount === 0) {
    return [];
  }
  const base = Math.floor(amount / siteCount);
  const remainder = amount - base * siteCount;
  const shares = new Array<number>(siteCount).fill(base);
  shares[0] += remainder;
  return shares;
}

/**
 * Charge les imputations RÉELLEMENT persistées de N constatations, en une
 * seule requête (« libellés résolus par lot, jamais une par ligne ») — plus
 * une seule requête pour résoudre le nom des chantiers touchés, quel que soit
 * le nombre de constatations demandées.
 *
 * Ne lit que les imputations validées et non annulées, exactement le filtre
 * de `sumSiteActualCost` : une constatation qui n'a produit aucune imputation
 * (bail sans chantier actif) est absente ici, l'appelant lit `?? []`.
 */
async function loadPersistedAllocationsTx(
  client: PrismaTransactionClient,
  tenantId: string,
  accrualIds: string[]
): Promise<Map<string, LandLeaseAccrualRecord['allocations']>> {
  const map = new Map<string, LandLeaseAccrualRecord['allocations']>();
  if (accrualIds.length === 0) {
    return map;
  }

  const rows = await client.costAllocation.findMany({
    where: {
      tenantId,
      sourceType: 'LAND_LEASE_ACCRUAL',
      sourceId: { in: accrualIds },
      voidedAt: null
    },
    select: { sourceId: true, siteId: true, amount: true },
    orderBy: { createdAt: 'asc' }
  });

  const siteIds = [...new Set((rows as Array<Record<string, any>>).map(row => row.siteId as string))];
  const sites = siteIds.length
    ? await client.constructionSite.findMany({
        where: { tenantId, id: { in: siteIds } },
        select: { id: true, name: true }
      })
    : [];
  const siteLabelById = new Map(
    (sites as Array<Record<string, any>>).map(site => [site.id as string, site.name as string])
  );

  for (const row of rows as Array<Record<string, any>>) {
    const list = map.get(row.sourceId) ?? [];
    list.push({
      siteId: row.siteId,
      siteLabel: siteLabelById.get(row.siteId) ?? 'Chantier inconnu',
      amount: roundMoneyXof(toAmountOrZero(row.amount))
    });
    map.set(row.sourceId, list);
  }

  return map;
}

// ---------------------------------------------------------------------------
// I. Constatation mensuelle — cœur du sous-lot
// ---------------------------------------------------------------------------

/**
 * Implémentation interne, partagée par `recordLandLeaseAccrualTx` (contrat
 * public, une seule constatation) et `runMonthlyLandLeaseAccruals` (qui a
 * besoin de savoir si la constatation existait déjà, pour distinguer
 * `constatees` de `dejaConstatees` dans son compte rendu — une distinction que
 * le contrat public n'expose pas).
 */
async function recordLandLeaseAccrualInternalTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  params: { landLeaseId: string; periodYear: number; periodMonth: number }
): Promise<{ record: LandLeaseAccrualRecord; alreadyExisted: boolean }> {
  const lease = await tx.landLease.findFirst({ where: { id: params.landLeaseId, tenantId } });
  if (!lease) {
    throw notFound('Bail de terrain introuvable');
  }

  // IDEMPOTENCE : lecture avant écriture, imposée par PostgreSQL — une
  // commande en échec condamne toute la transaction, donc « tenter puis
  // rattraper la violation d'unicité » ne marche pas ici (voir l'en-tête de
  // `ledger.ts`, même raisonnement). La contrainte d'unicité en base
  // (`@@unique([landLeaseId, periodYear, periodMonth])`) reste le filet pour
  // une collision réellement concurrente ; ce n'est pas elle qui porte la
  // discipline de rejeu.
  const existing = await tx.landLeaseAccrual.findUnique({
    where: {
      landLeaseId_periodYear_periodMonth: {
        landLeaseId: params.landLeaseId,
        periodYear: params.periodYear,
        periodMonth: params.periodMonth
      }
    }
  });

  if (existing) {
    // Rejeu du même triplet : on renvoie la constatation existante SANS
    // recréer de pièce, sans reposer d'écriture, sans retoucher au solde du
    // bailleur, et SANS créer une seconde fois ses imputations — déjà
    // persistées depuis la première écriture. `allocations` est relu depuis
    // `CostAllocation`, jamais recalculé.
    const amount = roundMoneyXof(toAmountOrZero(existing.amount));
    const allocationsByAccrual = await loadPersistedAllocationsTx(tx, tenantId, [existing.id]);
    return {
      record: {
        id: existing.id,
        landLeaseId: existing.landLeaseId,
        landlordName: lease.landlordName,
        periodYear: existing.periodYear,
        periodMonth: existing.periodMonth,
        amount,
        currency: existing.currency,
        allocations: allocationsByAccrual.get(existing.id) ?? [],
        createdAt: existing.createdAt
      },
      alreadyExisted: true
    };
  }

  const ordinal = leaseMonthOrdinal(lease.startDate, params.periodYear, params.periodMonth);
  const annualAmount = roundMoneyXof(toAmountOrZero(lease.annualAmount));
  const amount = computeAccrualAmount(annualAmount, ordinal);

  // Pièce d'abord (P-2), même sans état brouillon : elle nait dans cette
  // transaction, avant l'écriture qui la porte. Son identifiant sert de
  // `documentId`/`sourceId` pour l'écriture et le mouvement ci-dessous, comme
  // pour toute pièce depuis le lot 2.
  const accrual = await tx.landLeaseAccrual.create({
    data: {
      tenantId,
      landLeaseId: params.landLeaseId,
      periodYear: params.periodYear,
      periodMonth: params.periodMonth,
      amount,
      currency: lease.currency
    }
  });

  // Date d'écriture : le premier jour du mois constaté — il n'existe pas de
  // « date de la pièce » saisie par quelqu'un, cette constatation étant posée
  // par un travail programmé (voir le contrat).
  const entryDate = new Date(Date.UTC(params.periodYear, params.periodMonth - 1, 1));
  const accounts = await resolveOperationalAccounts(tx, tenantId, entryDate);

  // Journal : débit des locations (613), crédit des charges constatées
  // d'avance (476, ou 486 hérité) — la consommation du mois, prélevée sur
  // l'avance déjà payée.
  const entry = await postDocumentEntryTx(tx, {
    tenantId,
    journalId: accounts.journalId,
    entryDate,
    reference: `BAIL-CST-${accrual.id}`,
    description: `Constatation mensuelle de loyer — ${lease.landlordName} — ${lease.landLabel}`,
    documentType: asDocumentType('LAND_LEASE_ACCRUAL'),
    documentId: accrual.id,
    lines: [
      {
        accountId: accounts.rentExpenseAccountId,
        debit: amount,
        label: `Consommation de loyer — ${lease.landlordName}`
      },
      {
        accountId: accounts.prepaidExpenseAccountId,
        credit: amount,
        label: `Constatation de loyer — ${lease.landlordName}`
      }
    ]
  });

  // Compte de tiers : la constatation fait REMONTER le solde du bailleur —
  // `billed`, symétrique du `settled` du paiement. Au douzième mois, le solde
  // revient exactement à zéro (critère de sortie §7.1).
  const movement = await appendThirdPartyMovementTx(tx, {
    accountId: lease.landlordAccountId,
    tenantId,
    type: 'INSTALLMENT',
    billed: amount,
    label: `Constatation de loyer — ${lease.landLabel}`,
    sourceType: asFinanceSourceType('LAND_LEASE_ACCRUAL'),
    sourceId: accrual.id,
    movementDate: entryDate
  });
  if (!movement) {
    throw notFound('Compte du bailleur introuvable');
  }

  // Chantiers actifs du bail, ordonnés par création : le premier absorbe le
  // reliquat d'arrondi (`splitAmountAcrossSites`). Un bail sans chantier actif
  // ne produit aucune imputation — la charge a bien eu lieu, elle n'est
  // simplement imputable à rien (critère de sortie §7.4).
  const activeSites = await tx.constructionSite.findMany({
    where: { tenantId, landLeaseId: params.landLeaseId, status: { in: ACTIVE_SITE_STATUSES as any } },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' }
  });
  const shares = splitAmountAcrossSites(amount, activeSites.length);

  const allocations: LandLeaseAccrualRecord['allocations'] = [];
  for (let index = 0; index < activeSites.length; index += 1) {
    const site = activeSites[index] as Record<string, any>;
    const share = shares[index];

    // Imputation RÉELLE, exactement comme une facture fournisseur ou une
    // pièce de caisse : `validatedAt` renseigné, `voidedAt` nul — c'est ce
    // filtre précis que `sumSiteActualCost` lit pour le coût réel du
    // chantier. Une constatation naît déjà validée (pas d'état brouillon),
    // son imputation l'est donc aussi, dès sa création.
    await tx.costAllocation.create({
      data: {
        tenantId,
        siteId: site.id,
        costCategoryId: lease.costCategoryId,
        sourceType: 'LAND_LEASE_ACCRUAL',
        sourceId: accrual.id,
        amount: share,
        validatedAt: new Date(),
        voidedAt: null
      }
    });
    allocations.push({ siteId: site.id, siteLabel: site.name, amount: share });
  }

  // Le coût réel de chaque chantier touché vient de changer : les programmes
  // de travaux qui lui sont rattachés doivent suivre, DANS CETTE transaction
  // — même geste qu'à la validation d'une facture fournisseur ou d'une pièce
  // de caisse (`suppliers.ts`, `cash.ts`). Rien à synchroniser quand la liste
  // est vide.
  for (const site of activeSites as Array<Record<string, any>>) {
    await syncWorkProgramCostTx(tx, tenantId, site.id);
  }

  const updated = await tx.landLeaseAccrual.update({
    where: { id: accrual.id },
    data: { journalEntryId: entry.entryId }
  });

  return {
    record: {
      id: updated.id,
      landLeaseId: updated.landLeaseId,
      landlordName: lease.landlordName,
      periodYear: updated.periodYear,
      periodMonth: updated.periodMonth,
      amount,
      currency: updated.currency,
      allocations,
      createdAt: updated.createdAt
    },
    alreadyExisted: false
  };
}

/** Voir `RecordLandLeaseAccrualTx` dans `./types-lot4.ts`. */
export const recordLandLeaseAccrualTx: RecordLandLeaseAccrualTx = async (tx, tenantId, params) => {
  const { record } = await recordLandLeaseAccrualInternalTx(tx, tenantId, params);
  return record;
};

/** Voir `ListLandLeaseAccruals` dans `./types-lot4.ts`. */
export const listLandLeaseAccruals: ListLandLeaseAccruals = async (tenantId, landLeaseId) => {
  const lease = await prisma.landLease.findFirst({
    where: { id: landLeaseId, tenantId },
    select: { id: true, landlordName: true }
  });
  if (!lease) {
    throw notFound('Bail de terrain introuvable');
  }

  const rows = await prisma.landLeaseAccrual.findMany({
    where: { landLeaseId, tenantId },
    orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }]
  });

  // Une seule requête d'imputations pour TOUTE la liste, jamais une par
  // constatation : chaque constatation montre la répartition qu'elle a
  // RÉELLEMENT produite (voir la note devant `loadPersistedAllocationsTx`).
  const allocationsByAccrual = await loadPersistedAllocationsTx(
    prisma,
    tenantId,
    rows.map((row: any) => row.id)
  );

  return rows.map((row: any) => ({
    id: row.id,
    landLeaseId: row.landLeaseId,
    landlordName: lease.landlordName,
    periodYear: row.periodYear,
    periodMonth: row.periodMonth,
    amount: roundMoneyXof(toAmountOrZero(row.amount)),
    currency: row.currency,
    allocations: allocationsByAccrual.get(row.id) ?? [],
    createdAt: row.createdAt
  }));
};

// ---------------------------------------------------------------------------
// J. Travail programmé — constatation du mois échu, toutes agences
// ---------------------------------------------------------------------------

/** Voir `RunMonthlyLandLeaseAccruals` dans `./types-lot4.ts`. */
export const runMonthlyLandLeaseAccruals: RunMonthlyLandLeaseAccruals = async params => {
  const leases = await prisma.landLease.findMany({
    where: { isActive: true, ...(params.tenantId ? { tenantId: params.tenantId } : {}) },
    select: { id: true, tenantId: true, landlordName: true }
  });

  let constatees = 0;
  let dejaConstatees = 0;
  const echecs: Array<{ landLeaseId: string; landlordName: string; raison: string }> = [];

  // Chaque bail dans SA PROPRE transaction : un bail mal configuré ne doit
  // pas empêcher les autres d'être constatés (contrat, §6 du data-model).
  for (const lease of leases as Array<Record<string, any>>) {
    try {
      const { alreadyExisted } = await prisma.$transaction(tx =>
        recordLandLeaseAccrualInternalTx(tx, lease.tenantId, {
          landLeaseId: lease.id,
          periodYear: params.periodYear,
          periodMonth: params.periodMonth
        })
      );
      if (alreadyExisted) {
        dejaConstatees += 1;
      } else {
        constatees += 1;
      }
    } catch (error) {
      echecs.push({
        landLeaseId: lease.id,
        landlordName: lease.landlordName,
        raison: error instanceof Error ? error.message : 'Erreur inconnue'
      });
    }
  }

  return { constatees, dejaConstatees, echecs };
};
