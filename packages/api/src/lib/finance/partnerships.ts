/**
 * Associations — lot 4, deuxième sous-lot (`types-lot4-partnerships.ts`, contrat
 * gelé, en lire l'en-tête avant celui-ci : il tranche l'ambiguïté du PRD sur ce
 * que reçoit « le compte loyer principal »).
 *
 * Style suivi : `land-leases.ts` (sous-lot précédent) pour la discipline
 * « lecture avant écriture » imposée par PostgreSQL (une commande en échec
 * condamne toute la transaction — voir l'en-tête de `ledger.ts`) et pour les
 * lectures par lot (jamais une requête par ligne).
 *
 * ---------------------------------------------------------------------------
 * Différence majeure avec les sous-lots précédents : AUCUNE ÉCRITURE COMPTABLE
 * ---------------------------------------------------------------------------
 *
 * Ni les fournisseurs (lot 2) ni les baux de terrain (lot 4, premier sous-lot)
 * n'avaient ce trait : ce fichier n'appelle jamais `postDocumentEntryTx`, et ne
 * touche donc jamais `accounting.ts`. C'est délibéré, pas un oubli : le lot 1
 * n'a jamais construit de comptabilisation du loyer en produit (la campagne de
 * facturation n'écrit qu'un mouvement de compte de tiers, jamais une écriture
 * de journal), et ce sous-lot ne peut pas en inventer une sans PRD. Ce qui se
 * répartit ici est donc uniquement le grand livre des comptes de tiers
 * (`ledger.ts`) : le locataire doit toujours le loyer entier, et l'agence doit
 * désormais une part à chaque associé.
 *
 * ---------------------------------------------------------------------------
 * `distributeInstallmentToPartnersTx` ne lève JAMAIS, et c'est absolu
 * ---------------------------------------------------------------------------
 *
 * Le contrat le dit, et ce n'est pas une précaution parmi d'autres : cette
 * fonction s'exécute DANS la transaction par bail de la campagne de
 * facturation (`billing-run.ts`, hors du territoire de cet agent), pas dans sa
 * propre transaction. Une exception qui s'en échapperait remonterait jusqu'à
 * `runRentBilling`, qui fait alors échouer TOUTE la campagne — tous les baux,
 * de tous les locataires, y compris ceux qui n'ont aucune association. C'est
 * exactement l'incident que le contrat interdit. La fonction enveloppe donc
 * tout son corps dans un `try/catch` qui journalise et renvoie `[]` plutôt que
 * de distinguer finement « association mal configurée » d'une erreur
 * inattendue : dans ce contexte précis, toute distinction fine coûterait plus
 * cher qu'une campagne cassée pour tout le monde. Voir la rubrique
 * « HYPOTHÈSES » du rapport de fin de tâche pour la discussion de ce choix.
 */

import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { badRequest, conflict, notFound } from '../errors';
import { appendThirdPartyMovementTx } from './ledger';
import { roundMoneyXof, roundPercent } from './money';
import type { PeriodRange } from './types';
import { toAmountOrZero } from './types';
import type {
  AddPartnershipShareTx,
  AttachPropertyToPartnershipTx,
  CreatePartnershipTx,
  DistributeInstallmentToPartnersTx,
  GetPartnerStatement,
  GetPartnership,
  ListPartnerships,
  PartnerStatementLine,
  PartnershipDistributionRecord,
  PartnershipPropertyRef,
  PartnershipRecord,
  PartnershipShareRecord,
  RemovePartnershipShareTx
} from './types-lot4-partnerships';

/** Devise unique du lot (décision D9 du plan, déjà actée au lot 1). */
const DEFAULT_CURRENCY = 'XOF';

// ---------------------------------------------------------------------------
// Libellés en français — mêmes noms de mois que `ledger.ts`/`billing-run.ts`
// (copie locale volontaire : ni l'un ni l'autre n'exporte ce tableau, voir
// leurs en-têtes respectifs).
// ---------------------------------------------------------------------------

const MOIS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre'
];

function libellePeriode(periodYear: number, periodMonth: number): string {
  const mois = MOIS_FR[(periodMonth - 1 + 12) % 12] ?? `mois ${periodMonth}`;
  return `${mois} ${periodYear}`;
}

// ---------------------------------------------------------------------------
// Répartition proportionnelle — reliquat d'arrondi au premier associé
// ---------------------------------------------------------------------------

/**
 * Répartit `amount` entre les associés d'une association, proportionnellement
 * à leur quote-part DÉJÀ ARRONDIE — celle qui est stockée, jamais une valeur
 * brute (même règle qu'au contrôle des cent pour cent, voir
 * `addPartnershipShareTx`).
 *
 * **Ne PAS normaliser sur la somme des quotes-parts.** Un associé à 33,33 %
 * reçoit `montant × 33,33 / 100`, jamais `montant × 33,33 / totalSharePercent`.
 * Confondre les deux ferait disparaître la part de l'entreprise en la
 * redistribuant aux associés — exactement l'erreur que l'en-tête du contrat
 * met en garde contre («la part de l'entreprise est ce qui reste»). Le test
 * `partnerships.test.ts` sur trois associés à 33,33 % le vérifie : la somme
 * versée aux associés doit valoir 999 900 sur un loyer de 1 000 000, jamais
 * 1 000 000 (ce que produirait une normalisation).
 *
 * Le reliquat d'arrondi (différence entre la somme des parts arrondies
 * individuellement et le produit réparti arrondi une fois) va au premier
 * associé, par ordre de création — même geste que `splitAmountAcrossSites`
 * dans `land-leases.ts`, transposé d'un partage égal à un partage
 * proportionnel.
 */
function splitAmountAcrossShares(
  amount: number,
  shares: Array<{ id: string; sharePercent: number }>
): Map<string, number> {
  const result = new Map<string, number>();
  if (shares.length === 0) {
    return result;
  }

  const totalSharePercent = roundPercent(shares.reduce((sum, share) => sum + share.sharePercent, 0));
  const totalToDistribute = roundMoneyXof((amount * totalSharePercent) / 100);

  const rawShares = shares.map(share => roundMoneyXof((amount * share.sharePercent) / 100));
  const sumRaw = rawShares.reduce((sum, value) => sum + value, 0);

  // Le reliquat peut être positif ou négatif selon le sens des arrondis
  // individuels — dans les deux cas, c'est le premier associé qui l'absorbe,
  // pour que la somme colle exactement au produit réparti.
  rawShares[0] = roundMoneyXof(rawShares[0] + (totalToDistribute - sumRaw));

  shares.forEach((share, index) => result.set(share.id, rawShares[index]));
  return result;
}

// ---------------------------------------------------------------------------
// Conversions Prisma -> contrat
// ---------------------------------------------------------------------------

function toShareRecord(row: any): PartnershipShareRecord {
  return {
    id: row.id,
    partnerAccountId: row.partnerAccountId,
    partnerName: row.partnerName,
    sharePercent: roundPercent(toAmountOrZero(row.sharePercent))
  };
}

function toPropertyRef(row: any): PartnershipPropertyRef {
  return { propertyId: row.id, propertyLabel: row.title };
}

function toPartnershipRecord(
  row: any,
  shares: PartnershipShareRecord[],
  properties: PartnershipPropertyRef[]
): PartnershipRecord {
  const totalSharePercent = roundPercent(shares.reduce((sum, share) => sum + share.sharePercent, 0));
  return {
    id: row.id,
    tenantId: row.tenantId,
    label: row.label,
    isActive: row.isActive,
    shares,
    totalSharePercent,
    // Par différence, jamais stockée (voir le contrat) : ce n'est pas un
    // associé, elle ne porte pas de compte de tiers.
    companySharePercent: roundPercent(100 - totalSharePercent),
    properties
  };
}

// ---------------------------------------------------------------------------
// Lectures par lot — parts et biens d'une ou plusieurs associations
//
// « Libellés résolus par requête PAR LOT, jamais une par ligne » : une seule
// requête sert `listPartnerships` pour N associations, jamais N requêtes.
// ---------------------------------------------------------------------------

async function loadSharesByPartnershipIds(
  client: PrismaTransactionClient,
  partnershipIds: string[]
): Promise<Map<string, PartnershipShareRecord[]>> {
  const map = new Map<string, PartnershipShareRecord[]>();
  if (partnershipIds.length === 0) {
    return map;
  }

  const rows = await client.partnershipShare.findMany({
    where: { partnershipId: { in: partnershipIds } },
    orderBy: { createdAt: 'asc' }
  });

  for (const row of rows as Array<Record<string, any>>) {
    const list = map.get(row.partnershipId) ?? [];
    list.push(toShareRecord(row));
    map.set(row.partnershipId, list);
  }

  return map;
}

async function loadPropertiesByPartnershipIds(
  client: PrismaTransactionClient,
  tenantId: string,
  partnershipIds: string[]
): Promise<Map<string, PartnershipPropertyRef[]>> {
  const map = new Map<string, PartnershipPropertyRef[]>();
  if (partnershipIds.length === 0) {
    return map;
  }

  const rows = await client.property.findMany({
    where: { tenantId, partnershipId: { in: partnershipIds } },
    select: { id: true, title: true, partnershipId: true },
    orderBy: { createdAt: 'asc' }
  });

  for (const row of rows as Array<Record<string, any>>) {
    const key = row.partnershipId as string;
    const list = map.get(key) ?? [];
    list.push(toPropertyRef(row));
    map.set(key, list);
  }

  return map;
}

/** Charge parts et biens pour UNE SEULE association — mêmes requêtes que ci-dessus, sans lot à faire. */
async function loadPartnershipRecord(
  client: PrismaTransactionClient,
  tenantId: string,
  partnershipId: string
): Promise<PartnershipRecord> {
  const row = await client.partnership.findFirst({ where: { id: partnershipId, tenantId } });
  if (!row) {
    throw notFound('Association introuvable');
  }

  const [sharesByPartnership, propertiesByPartnership] = await Promise.all([
    loadSharesByPartnershipIds(client, [partnershipId]),
    loadPropertiesByPartnershipIds(client, tenantId, [partnershipId])
  ]);

  return toPartnershipRecord(
    row,
    sharesByPartnership.get(partnershipId) ?? [],
    propertiesByPartnership.get(partnershipId) ?? []
  );
}

// ---------------------------------------------------------------------------
// A. Création de l'association — sans associé
// ---------------------------------------------------------------------------

/** Voir `CreatePartnershipTx` dans `./types-lot4-partnerships.ts`. */
export const createPartnershipTx: CreatePartnershipTx = async (tx, tenantId, params) => {
  if (!params.label?.trim()) {
    throw badRequest("Le libellé de l'association est obligatoire");
  }

  const row = await tx.partnership.create({
    data: { tenantId, label: params.label, isActive: true }
  });

  return toPartnershipRecord(row, [], []);
};

// ---------------------------------------------------------------------------
// B. Ajout d'un associé — quote-part et compte de tiers
// ---------------------------------------------------------------------------

/** Voir `AddPartnershipShareTx` dans `./types-lot4-partnerships.ts`. */
export const addPartnershipShareTx: AddPartnershipShareTx = async (tx, tenantId, params) => {
  if (!params.partnerName?.trim()) {
    throw badRequest("Le nom de l'associé est obligatoire");
  }

  const sharePercent = roundPercent(params.sharePercent);
  if (sharePercent <= 0) {
    throw badRequest('La quote-part doit être strictement positive');
  }
  if (sharePercent > 100) {
    throw badRequest('La quote-part ne peut pas dépasser cent pour cent');
  }

  const partnership = await tx.partnership.findFirst({ where: { id: params.partnershipId, tenantId } });
  if (!partnership) {
    throw notFound('Association introuvable');
  }

  // LA SOMME DES QUOTES-PARTS NE PEUT PAS DÉPASSER CENT. Vérifiée AVANT
  // d'écrire (P-2), sur les parts DÉJÀ ARRONDIES — celles qui seront
  // stockées, jamais sur des valeurs brutes. En PostgreSQL une commande en
  // échec condamne toute la transaction (voir l'en-tête de `ledger.ts`) :
  // « tenter puis rattraper » ne marche pas ici, la vérification doit
  // précéder l'écriture.
  const existingShares = await tx.partnershipShare.findMany({
    where: { partnershipId: partnership.id },
    select: { sharePercent: true }
  });
  const currentTotal = roundPercent(
    existingShares.reduce((sum: number, share: any) => sum + toAmountOrZero(share.sharePercent), 0)
  );
  const projectedTotal = roundPercent(currentTotal + sharePercent);
  if (projectedTotal > 100) {
    throw badRequest(
      `La somme des quotes-parts dépasserait cent pour cent (${currentTotal} % déjà attribués, ${sharePercent} % demandés)`
    );
  }

  // Le compte naît avec la part, dans la même transaction : un associé sans
  // compte ne pourrait rien recevoir, et la première ventilation le
  // trouverait manquant (même raison qu'au lot 2 pour le fournisseur, et
  // qu'au lot 4 pour le bailleur).
  const account = await tx.thirdPartyAccount.create({
    data: {
      tenantId,
      kind: 'PARTNER' as any,
      label: params.partnerName,
      balance: 0,
      currency: DEFAULT_CURRENCY
    }
  });

  await tx.partnershipShare.create({
    data: {
      partnershipId: partnership.id,
      partnerAccountId: account.id,
      partnerName: params.partnerName,
      sharePercent
    }
  });

  return loadPartnershipRecord(tx, tenantId, partnership.id);
};

// ---------------------------------------------------------------------------
// C. Retrait d'un associé
// ---------------------------------------------------------------------------

/** Voir `RemovePartnershipShareTx` dans `./types-lot4-partnerships.ts`. */
export const removePartnershipShareTx: RemovePartnershipShareTx = async (tx, tenantId, shareId) => {
  const share = await tx.partnershipShare.findFirst({
    where: { id: shareId, partnership: { tenantId } },
    select: { id: true, partnershipId: true }
  });
  if (!share) {
    throw notFound('Quote-part introuvable');
  }

  // Refusé dès qu'une ventilation a été constatée sur cette part (voir le
  // contrat) : on ne fait pas disparaître un associé à qui l'agence doit déjà
  // de l'argent, l'historique de ce qui lui revient deviendrait illisible.
  const hasDistribution = await tx.partnershipDistribution.findFirst({
    where: { partnershipShareId: shareId },
    select: { id: true }
  });
  if (hasDistribution) {
    throw conflict(
      'Cet associé a déjà une ventilation constatée sur cette part : son historique ne peut pas disparaître avec elle.'
    );
  }

  await tx.partnershipShare.delete({ where: { id: shareId } });

  return loadPartnershipRecord(tx, tenantId, share.partnershipId);
};

// ---------------------------------------------------------------------------
// D. Rattachement (ou détachement) d'un bien
// ---------------------------------------------------------------------------

/** Voir `AttachPropertyToPartnershipTx` dans `./types-lot4-partnerships.ts`. */
export const attachPropertyToPartnershipTx: AttachPropertyToPartnershipTx = async (
  tx,
  tenantId,
  propertyId,
  partnershipId
) => {
  const property = await tx.property.findFirst({ where: { id: propertyId, tenantId }, select: { id: true } });
  if (!property) {
    throw notFound('Bien introuvable');
  }

  if (partnershipId === null) {
    // Détache : aucune association à renvoyer, `null` est la réponse
    // elle-même (même convention qu'`attachSiteToLandLeaseTx`).
    await tx.property.update({ where: { id: propertyId }, data: { partnershipId: null } });
    return null;
  }

  const partnership = await tx.partnership.findFirst({ where: { id: partnershipId, tenantId } });
  if (!partnership) {
    throw notFound('Association introuvable');
  }

  // Remplace le lien sans erreur si le bien appartenait déjà à une autre
  // association : c'est une correction, pas un conflit (contrat, « au plus
  // une association »). Aucune ventilation passée n'est recalculée — cette
  // fonction ne touche à rien d'autre que la colonne `partnershipId`.
  await tx.property.update({ where: { id: propertyId }, data: { partnershipId } });

  return loadPartnershipRecord(tx, tenantId, partnership.id);
};

// ---------------------------------------------------------------------------
// E/F. Lectures — liste et détail d'une association
// ---------------------------------------------------------------------------

/** Voir `ListPartnerships` dans `./types-lot4-partnerships.ts`. */
export const listPartnerships: ListPartnerships = async (tenantId, filters) => {
  const rows = await prisma.partnership.findMany({
    where: { tenantId, ...(filters?.onlyActive ? { isActive: true } : {}) },
    orderBy: { createdAt: 'desc' }
  });

  if (rows.length === 0) {
    return [];
  }

  const ids = rows.map((row: any) => row.id);
  const [sharesByPartnership, propertiesByPartnership] = await Promise.all([
    loadSharesByPartnershipIds(prisma, ids),
    loadPropertiesByPartnershipIds(prisma, tenantId, ids)
  ]);

  return rows.map((row: any) =>
    toPartnershipRecord(row, sharesByPartnership.get(row.id) ?? [], propertiesByPartnership.get(row.id) ?? [])
  );
};

/** Voir `GetPartnership` dans `./types-lot4-partnerships.ts`. */
export const getPartnership: GetPartnership = async (tenantId, partnershipId) => {
  return loadPartnershipRecord(prisma, tenantId, partnershipId);
};

// ---------------------------------------------------------------------------
// G. La ventilation — cœur du sous-lot
// ---------------------------------------------------------------------------

function toDistributionRecord(row: any, propertyLabel: string, partnerName: string): PartnershipDistributionRecord {
  return {
    id: row.id,
    partnershipId: row.partnershipId,
    partnershipShareId: row.partnershipShareId,
    partnerName,
    rentalInstallmentId: row.rentalInstallmentId,
    propertyLabel,
    periodYear: row.periodYear,
    periodMonth: row.periodMonth,
    amount: roundMoneyXof(toAmountOrZero(row.amount)),
    currency: row.currency
  };
}

/** Voir `DistributeInstallmentToPartnersTx` dans `./types-lot4-partnerships.ts`. */
export const distributeInstallmentToPartnersTx: DistributeInstallmentToPartnersTx = async (tx, tenantId, params) => {
  try {
    // IDEMPOTENCE D'ABORD, ET SUR L'ÉCHÉANCE ENTIÈRE — lecture avant écriture,
    // imposée par PostgreSQL (voir l'en-tête de `ledger.ts`, même
    // raisonnement qu'à la constatation mensuelle du bail de terrain). On
    // teste par échéance, pas par part : si UNE ventilation existe déjà pour
    // cette échéance, la campagne a déjà tourné pour ce loyer, on ne refait
    // rien — ni écriture, ni mouvement, ni second passage sur les autres
    // parts.
    const existing = await tx.partnershipDistribution.findMany({
      where: { tenantId, rentalInstallmentId: params.rentalInstallmentId },
      orderBy: { createdAt: 'asc' }
    });

    // Le libellé du bien ne dépend que du paramètre `propertyId`, jamais de
    // l'association actuelle (qui a pu changer depuis, voir la note de
    // `attachPropertyToPartnershipTx`) : il est donc résolu une seule fois,
    // qu'on rejoue une ventilation existante ou qu'on en crée une nouvelle.
    const property = await tx.property.findFirst({
      where: { id: params.propertyId, tenantId },
      select: { id: true, title: true, partnershipId: true }
    });
    const propertyLabel = property?.title ?? 'Bien inconnu';

    if (existing.length > 0) {
      const shareIds = [...new Set(existing.map((row: any) => row.partnershipShareId as string))];
      const shares = await tx.partnershipShare.findMany({
        where: { id: { in: shareIds } },
        select: { id: true, partnerName: true }
      });
      const partnerNameByShareId = new Map(shares.map((share: any) => [share.id, share.partnerName]));
      return existing.map((row: any) =>
        toDistributionRecord(row, propertyLabel, partnerNameByShareId.get(row.partnershipShareId) ?? 'Associé inconnu')
      );
    }

    // Bien sans association : rien à ventiler, ce n'est pas une erreur — la
    // grande majorité des biens sont dans ce cas (contrat : « Ne fait rien
    // quand le bien n'appartient à aucune association »).
    if (!property?.partnershipId) {
      return [];
    }

    const shares = await tx.partnershipShare.findMany({
      where: { partnershipId: property.partnershipId },
      orderBy: { createdAt: 'asc' }
    });

    // Association sans associé : rien à ventiler non plus, même traitement.
    if (shares.length === 0) {
      console.warn(
        `[finance:partnerships] Ventilation ignorée — association ${property.partnershipId} sans associé (bien ${property.id}, échéance ${params.rentalInstallmentId}).`
      );
      return [];
    }

    const totalSharePercent = roundPercent(
      shares.reduce((sum: number, share: any) => sum + toAmountOrZero(share.sharePercent), 0)
    );
    if (totalSharePercent > 100) {
      // Ne devrait jamais arriver — `addPartnershipShareTx` refuse déjà ce
      // cas à l'écriture — mais une donnée corrompue ne doit pas non plus
      // faire échouer la campagne : elle est journalisée et sautée, comme
      // toute autre association mal configurée.
      console.warn(
        `[finance:partnerships] Ventilation ignorée — association ${property.partnershipId} totalise ${totalSharePercent} % (> 100).`
      );
      return [];
    }

    const amountByShareId = splitAmountAcrossShares(
      params.amount,
      shares.map((share: any) => ({ id: share.id, sharePercent: toAmountOrZero(share.sharePercent) }))
    );

    const label = `Quote-part sur le loyer de ${libellePeriode(params.periodYear, params.periodMonth)} — ${propertyLabel}`;
    // Date métier du mouvement : premier jour du mois constaté, comme la
    // constatation mensuelle du bail de terrain — il n'existe pas de « date
    // de saisie » ici non plus, la ventilation naît d'un geste programmé (la
    // campagne de facturation), pas d'une pièce saisie à la main.
    const movementDate = new Date(Date.UTC(params.periodYear, params.periodMonth - 1, 1));

    const created: PartnershipDistributionRecord[] = [];
    for (const share of shares as Array<Record<string, any>>) {
      const amount = amountByShareId.get(share.id) ?? 0;

      const distribution = await tx.partnershipDistribution.create({
        data: {
          tenantId,
          partnershipId: property.partnershipId,
          partnershipShareId: share.id,
          rentalInstallmentId: params.rentalInstallmentId,
          periodYear: params.periodYear,
          periodMonth: params.periodMonth,
          amount,
          currency: DEFAULT_CURRENCY
        }
      });

      // Compte de tiers de l'associé : la ventilation fait REMONTER son
      // solde — `billed`, jamais `settled` : ce n'est pas un règlement, c'est
      // la constatation de ce que l'agence lui doit désormais (même sens que
      // l'échéance côté locataire, `billing-run.ts`). Le compte du locataire
      // n'est JAMAIS touché ici : il doit le loyer entier, ce qui se répartit
      // est le produit, pas la créance.
      //
      // `type: 'INSTALLMENT'` est réutilisé plutôt qu'une valeur dédiée :
      // `ThirdPartyMovementType` (enum Postgres, gelé) n'a pas de valeur pour
      // une ventilation d'association, même situation qu'à `land-leases.ts`
      // pour sa constatation mensuelle. Signalé en HYPOTHÈSES.
      const movement = await appendThirdPartyMovementTx(tx, {
        accountId: share.partnerAccountId,
        tenantId,
        type: 'INSTALLMENT',
        billed: amount,
        label,
        sourceType: 'PARTNERSHIP_DISTRIBUTION',
        sourceId: distribution.id,
        movementDate
      });
      if (!movement) {
        // Compte d'associé introuvable : donnée corrompue (l'ajout de la part
        // crée toujours son compte dans la même transaction), mais toujours
        // pas un motif pour lever — cette part est sautée, journalisée, les
        // autres continuent.
        console.warn(
          `[finance:partnerships] Compte de l'associé introuvable (${share.partnerAccountId}) — sa part sur l'échéance ${params.rentalInstallmentId} est sautée.`
        );
        continue;
      }

      created.push(toDistributionRecord(distribution, propertyLabel, share.partnerName));
    }

    return created;
  } catch (error) {
    // Voir l'en-tête du fichier : cette fonction ne lève JAMAIS, quelle que
    // soit la cause, parce qu'elle s'exécute dans la transaction PAR BAIL de
    // la campagne de facturation — une exception ici ferait échouer toute la
    // campagne, pour tous les locataires, y compris ceux sans association.
    console.error(
      `[finance:partnerships] Ventilation en échec pour l'échéance ${params.rentalInstallmentId} (bien ${params.propertyId}) — ignorée pour ne pas bloquer la campagne de facturation.`,
      error
    );
    return [];
  }
};

// ---------------------------------------------------------------------------
// H. L'état de quote-part — lecture seule
// ---------------------------------------------------------------------------

function buildMovementDateFilter(range?: PeriodRange): { gte?: Date; lte?: Date } | undefined {
  if (!range?.from && !range?.to) {
    return undefined;
  }
  return {
    ...(range.from ? { gte: range.from } : {}),
    ...(range.to ? { lte: range.to } : {})
  };
}

/**
 * Une ventilation ne porte qu'une année et un mois, pas une date : on la
 * situe au premier jour de son mois pour la comparer aux bornes `from`/`to`
 * de la requête (mêmes bornes que la requête HTTP, `PeriodRange`).
 */
function periodWithinRange(periodYear: number, periodMonth: number, range?: PeriodRange): boolean {
  if (!range?.from && !range?.to) {
    return true;
  }
  const periodDate = new Date(Date.UTC(periodYear, periodMonth - 1, 1));
  if (range.from && periodDate < range.from) {
    return false;
  }
  if (range.to && periodDate > range.to) {
    return false;
  }
  return true;
}

/**
 * Résout, pour N échéances, le bien et les montants dont l'état de
 * quote-part a besoin — une seule requête, jamais une par ligne (même
 * discipline que `loadSitesByLeaseIds` dans `land-leases.ts`).
 */
async function loadInstallmentContextByIds(
  client: PrismaTransactionClient,
  tenantId: string,
  installmentIds: string[]
): Promise<Map<string, { propertyLabel: string; rentBilled: number; rentCollected: number }>> {
  const map = new Map<string, { propertyLabel: string; rentBilled: number; rentCollected: number }>();
  if (installmentIds.length === 0) {
    return map;
  }

  const rows = await client.rentalInstallment.findMany({
    where: { id: { in: installmentIds }, tenant_id: tenantId },
    select: {
      id: true,
      amount_rent: true,
      amount_service: true,
      amount_other_fees: true,
      amount_paid: true,
      lease: { select: { property: { select: { title: true } } } }
    }
  });

  for (const row of rows as Array<Record<string, any>>) {
    map.set(row.id, {
      propertyLabel: row.lease?.property?.title ?? 'Bien inconnu',
      rentBilled: roundMoneyXof(
        toAmountOrZero(row.amount_rent) + toAmountOrZero(row.amount_service) + toAmountOrZero(row.amount_other_fees)
      ),
      rentCollected: roundMoneyXof(toAmountOrZero(row.amount_paid))
    });
  }

  return map;
}

/** Voir `GetPartnerStatement` dans `./types-lot4-partnerships.ts`. */
export const getPartnerStatement: GetPartnerStatement = async (tenantId, shareId, range) => {
  const share = await prisma.partnershipShare.findFirst({
    where: { id: shareId, partnership: { tenantId } },
    select: { id: true, partnerAccountId: true, partnerName: true, sharePercent: true }
  });
  if (!share) {
    throw notFound('Quote-part introuvable');
  }

  const account = await prisma.thirdPartyAccount.findFirst({
    where: { id: share.partnerAccountId, tenantId },
    select: { currency: true, balance: true }
  });

  const distributions = await prisma.partnershipDistribution.findMany({
    where: { tenantId, partnershipShareId: shareId },
    orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }]
  });

  const filtered = (distributions as Array<Record<string, any>>).filter(row =>
    periodWithinRange(row.periodYear, row.periodMonth, range)
  );

  const installmentContextById = await loadInstallmentContextByIds(
    prisma,
    tenantId,
    filtered.map(row => row.rentalInstallmentId)
  );

  const lines: PartnerStatementLine[] = filtered.map(row => {
    const context = installmentContextById.get(row.rentalInstallmentId);
    return {
      propertyLabel: context?.propertyLabel ?? 'Bien inconnu',
      periodYear: row.periodYear,
      periodMonth: row.periodMonth,
      rentBilled: context?.rentBilled ?? 0,
      rentCollected: context?.rentCollected ?? 0,
      partnerShare: roundMoneyXof(toAmountOrZero(row.amount))
    };
  });

  const totalShare = roundMoneyXof(lines.reduce((sum, line) => sum + line.partnerShare, 0));

  // « Ce qui a déjà été reversé, sur la période » : la somme des règlements
  // (`credit`, jamais `debit` — voir `ledger.ts`) portés au compte de
  // l'associé, sur les mêmes bornes que les lignes ci-dessus.
  const movementDateFilter = buildMovementDateFilter(range);
  const paidOutAggregate = await prisma.thirdPartyMovement.aggregate({
    where: {
      accountId: share.partnerAccountId,
      tenantId,
      credit: { not: null },
      ...(movementDateFilter ? { movementDate: movementDateFilter } : {})
    },
    _sum: { credit: true }
  });

  return {
    partnershipShareId: share.id,
    partnerName: share.partnerName,
    sharePercent: roundPercent(toAmountOrZero(share.sharePercent)),
    lines,
    totalShare,
    totalPaidOut: roundMoneyXof(toAmountOrZero((paidOutAggregate as any)._sum?.credit)),
    // Solde COURANT du compte, sur TOUTE son histoire — jamais recalculé
    // depuis `totalShare − totalPaidOut`, qui eux portent sur la période du
    // relevé. Un relevé borné à un mois n'a pas à connaître les mouvements
    // antérieurs pour que ce chiffre soit exact : c'est exactement pour cela
    // qu'on le lit sur le compte, pas qu'on le déduit des lignes filtrées
    // ci-dessus (même lecture qu'un solde fournisseur au lot 2).
    accountBalance: roundMoneyXof(toAmountOrZero(account?.balance)),
    currency: account?.currency ?? DEFAULT_CURRENCY
  };
};
