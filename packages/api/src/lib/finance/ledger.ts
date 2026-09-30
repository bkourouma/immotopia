/**
 * Grand livre a solde courant, partage entre la copropriete (`OwnerAccount`)
 * et les futurs comptes de tiers du lot 1 (`ThirdPartyAccount`).
 *
 * Extrait de `lib/syndics/queries.ts` (decision D1 du plan de mise en
 * oeuvre) : le calcul de `balanceAfter` existait deja, enfoui dans la
 * comptabilite de copropriete. Le lot 1 en a besoin pour le compte de tiers
 * locataire, sans dupliquer ce calcul ni migrer la table `OwnerAccount`. Ce
 * fichier est un refactoring a comportement identique : aucune regle n'y est
 * corrigee, y compris les defauts connus (voir `docs/finance/PLAN-mise-en-oeuvre.md`
 * §6.1 bis), qui seront traites au lot 2 en meme temps que leurs tests.
 */

import type { PrismaTransactionClient } from '../../utils/database';
import { roundMoney } from './money';
import { syncDirectRenterMovementEntryTx } from './rental-direct-ledger';

export type OwnerAccountTxClient = PrismaTransactionClient;

/**
 * Un client de transaction Prisma restreint aux tests (voir les mocks de
 * caracterisation) peut ne pas exposer les modeles du compte de lot : on le
 * detecte plutot que de laisser echouer un appel Prisma sur un modele absent.
 */
export function supportsOwnerAccount(tx: any): tx is OwnerAccountTxClient {
  return Boolean(tx?.ownerAccount && tx?.ownerAccountTransaction && tx?.syndicateLot);
}

/** Un client de transaction de test peut ne pas exposer le journal : on ne l'appelle alors pas. */
function supportsDirectJournal(tx: any): boolean {
  return Boolean(tx?.journalEntry?.findFirst && tx?.rentalLease?.findFirst && tx?.chartOfAccount?.findFirst);
}

export interface LedgerMovementComputation {
  debit: number;
  credit: number;
  balanceAfter: number;
}

/**
 * Calcule le solde apres mouvement, sans Prisma ni effet de bord.
 *
 * Reproduit exactement le calcul historique (meme arrondis, meme ordre) :
 * chaque grandeur est arrondie au centime avant d'entrer dans l'addition, un
 * debit augmente le solde, un credit le diminue. Ce sens est verifie par les
 * tests de caracterisation et n'est pas negociable ici — la generalisation du
 * lot 2 pourra le faire evoluer, pas ce refactoring.
 */
export function computeBalanceAfterMovement(
  currentBalance: number,
  debit: number | undefined | null,
  credit: number | undefined | null
): LedgerMovementComputation {
  const roundedDebit = roundMoney(debit ?? 0);
  const roundedCredit = roundMoney(credit ?? 0);
  const roundedCurrentBalance = roundMoney(Number(currentBalance ?? 0));
  const balanceAfter = roundMoney(roundedCurrentBalance + roundedDebit - roundedCredit);

  return { debit: roundedDebit, credit: roundedCredit, balanceAfter };
}

/**
 * Ajoute un mouvement au grand livre d'un compte de lot et met a jour son
 * solde courant, dans la meme transaction Prisma que l'appelant.
 *
 * Tolerances conservees a l'identique (defauts connus, non corriges ici) :
 * - renvoie `null` si `tx` n'expose pas les modeles necessaires ;
 * - renvoie `null` si le compte est introuvable (recharge par id, pas
 *   reutilise depuis l'appelant, au cas ou il aurait disparu entre-temps) ;
 * - un montant nul laisse `debit`/`credit` a `undefined` plutot qu'a 0.
 */
export async function appendOwnerAccountTransactionTx(
  tx: OwnerAccountTxClient,
  params: {
    accountId: string;
    type: 'CHARGE_CALL' | 'PAYMENT' | 'PENALTY' | 'WAIVER' | 'ADJUSTMENT' | 'FUND_TRANSFER';
    debit?: number;
    credit?: number;
    label: string;
    reference?: string | null;
    sourceId?: string | null;
    transactionDate?: Date;
  }
) {
  if (!supportsOwnerAccount(tx)) {
    return null;
  }

  const account = await tx.ownerAccount.findUnique({
    where: { id: params.accountId },
    select: { id: true, balance: true }
  });

  if (!account) {
    return null;
  }

  const { debit, credit, balanceAfter } = computeBalanceAfterMovement(
    Number(account.balance ?? 0),
    params.debit,
    params.credit
  );

  const transaction = await tx.ownerAccountTransaction.create({
    data: {
      accountId: params.accountId,
      transactionDate: params.transactionDate ?? new Date(),
      type: params.type as any,
      debit: debit > 0 ? debit : undefined,
      credit: credit > 0 ? credit : undefined,
      balanceAfter,
      label: params.label,
      reference: params.reference ?? undefined,
      sourceId: params.sourceId ?? undefined
    }
  });

  await tx.ownerAccount.update({
    where: { id: params.accountId },
    data: { balance: balanceAfter }
  });

  return transaction;
}

// ---------------------------------------------------------------------------
// Grand livre des comptes de tiers — lot 1
//
// Le contrat de ces trois fonctions est dans `./types.ts` et ne bouge pas :
// d'autres agents codent contre lui en parallele de cette implementation.
//
// Traduction billed/settled -> debit/credit : c'est ici, et nulle part
// ailleurs, que la frontiere API (qui parle "facture"/"regle") rejoint les
// colonnes de la table (`debit`/`credit`). Le sens est le meme que le grand
// livre de copropriete ci-dessus, verifie via `computeBalanceAfterMovement` :
// ce qui est facture augmente le solde (le tiers nous doit plus), ce qui est
// regle le diminue.
// ---------------------------------------------------------------------------

import { prisma } from '../../utils/database';
import type {
  AppendMovementParams,
  AppendThirdPartyMovementTx,
  GetOrCreateTenantAccountTx,
  RebuildThirdPartyAccount,
  ThirdPartyMovementRecord
} from './types';
import { toAmount, toAmountOrZero } from './types';

/** Convertit une ligne Prisma de `ThirdPartyMovement` vers le format expose par le contrat. */
function toMovementRecord(row: any): ThirdPartyMovementRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    movementDate: row.movementDate,
    type: row.type,
    amountBilled: toAmount(row.debit),
    amountSettled: toAmount(row.credit),
    balanceAfter: toAmountOrZero(row.balanceAfter),
    label: row.label,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    leaseId: row.leaseId ?? null,
    createdAt: row.createdAt
  };
}

/**
 * Voir `AppendThirdPartyMovementTx` dans `./types.ts`.
 *
 * **L'idempotence lit avant d'ecrire, et c'est impose par PostgreSQL.**
 *
 * Ce code tentait d'abord l'insertion pour relire la violation `P2002`,
 * afin de fermer la fenetre de concurrence qu'une lecture prealable laisse
 * ouverte. Le motif est juste en theorie et ne marche pas ici : en
 * PostgreSQL, une commande qui echoue **annule toute la transaction**, et
 * chaque commande suivante est refusee avec l'erreur 25P02 jusqu'au
 * rollback. La relecture de rattrapage interrogeait donc une transaction
 * morte. Le retro-remplissage echouait sur chaque compte deja rempli.
 *
 * Les tests unitaires ne pouvaient pas le voir : ils simulent Prisma par un
 * magasin en memoire, qui n'a pas cette semantique d'annulation.
 *
 * La fenetre de concurrence subsiste donc, mais elle est benigne : deux
 * ecritures reellement simultanees du meme triplet leveront `P2002`, la
 * transaction sera annulee, et l'appelant rejouera. C'est le comportement
 * correct — mieux vaut un rejeu qu'un solde faux.
 */
export const appendThirdPartyMovementTx: AppendThirdPartyMovementTx = async (tx, params) => {
  const account = await tx.thirdPartyAccount.findFirst({
    where: { id: params.accountId, tenantId: params.tenantId },
    select: { id: true, balance: true, kind: true }
  });

  if (!account) {
    return null;
  }

  // Rejeu du meme triplet : le mouvement existe deja, on le renvoie sans
  // toucher au solde, deja a jour depuis sa premiere ecriture.
  const existant = await tx.thirdPartyMovement.findUnique({
    where: {
      // Redondant avec l'unicité du triplet, mais nommé à plat pour le
      // garde-fou multi-tenant (utils/prisma-tenant-guard-extension.ts), qui
      // ne lit pas l'intérieur d'une clé composée.
      tenantId: params.tenantId,
      sourceType_sourceId_type: {
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        type: params.type as any
      }
    }
  });

  if (existant) {
    return toMovementRecord(existant);
  }

  const { debit, credit, balanceAfter } = computeBalanceAfterMovement(
    Number(account.balance ?? 0),
    params.billed,
    params.settled
  );

  {
    const movement = await tx.thirdPartyMovement.create({
      data: {
        accountId: params.accountId,
        tenantId: params.tenantId,
        movementDate: params.movementDate ?? new Date(),
        type: params.type as any,
        debit: debit > 0 ? debit : undefined,
        credit: credit > 0 ? credit : undefined,
        balanceAfter,
        label: params.label,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        leaseId: params.leaseId ?? undefined
      }
    });

    await tx.thirdPartyAccount.update({
      // `tenantId` en plus de l'id : anticipe le futur garde-fou Prisma (lot D).
      where: { id: params.accountId, tenantId: params.tenantId },
      data: { balance: balanceAfter }
    });

    // Gestion locative directe (BUG-2026-09-30-058) : la créance d'un locataire
    // dont le bail n'a pas de propriétaire mandant est aussi constatée au
    // journal, dans la même transaction que son mouvement.
    if (account.kind === 'TENANT' && supportsDirectJournal(tx)) {
      await syncDirectRenterMovementEntryTx(tx, params.tenantId, {
        id: movement.id,
        accountId: params.accountId,
        type: String(params.type),
        sourceType: params.sourceType,
        leaseId: params.leaseId ?? null,
        debit: movement.debit,
        credit: movement.credit,
        movementDate: movement.movementDate,
        label: params.label
      });
    }

    return toMovementRecord(movement);
  }
};

/**
 * Voir `GetOrCreateTenantAccountTx` dans `./types.ts`.
 *
 * Le `label` est copie depuis le nom du locataire une seule fois, a la
 * creation : la balance clients (agregation SQL, voir `GetClientsBalance`)
 * n'a ainsi jamais besoin de joindre `TenantClient`/`User` ligne a ligne.
 */
export const getOrCreateTenantAccountTx: GetOrCreateTenantAccountTx = async (tx, tenantId, tenantClientId) => {
  const existing = await tx.thirdPartyAccount.findUnique({
    where: {
      // Même remarque : l'agence est dans la clé composée, mais le garde-fou
      // ne la voit qu'à plat.
      tenantId,
      tenantId_kind_tenantClientId: {
        tenantId,
        kind: 'TENANT' as any,
        tenantClientId
      }
    },
    select: { id: true, label: true, balance: true }
  });

  if (existing) {
    return { id: existing.id, label: existing.label, balance: toAmountOrZero(existing.balance) };
  }

  const tenantClient = await tx.tenantClient.findFirst({
    where: { id: tenantClientId, tenantId },
    select: {
      id: true,
      user: { select: { fullName: true, email: true } }
    }
  });

  if (!tenantClient) {
    return null;
  }

  const label = (tenantClient as any).user?.fullName || (tenantClient as any).user?.email || 'Locataire';

  // Pas de rattrapage apres echec ici : en PostgreSQL, une violation de
  // contrainte annule toute la transaction, et la relecture qui suivrait
  // serait refusee avec l'erreur 25P02. La lecture prealable ci-dessus couvre
  // le cas normal — un compte deja ouvert. Deux creations reellement
  // simultanees leveront `P2002`, la transaction sera annulee, et l'appelant
  // rejouera : c'est le bon comportement, un rejeu valant mieux qu'un solde
  // faux. Voir l'en-tete de `appendThirdPartyMovementTx` pour le detail.
  const created = await tx.thirdPartyAccount.create({
    data: {
      tenantId,
      kind: 'TENANT' as any,
      tenantClientId,
      label,
      balance: 0,
      currency: 'XOF'
    }
  });

  return { id: created.id, label: created.label, balance: toAmountOrZero(created.balance) };
};

// ---------------------------------------------------------------------------
// Reconstruction — rebuildThirdPartyAccount
//
// Rejoue, dans l'ordre des dates metier (pas l'ordre d'insertion, qui
// dependrait de l'ordre des requetes ci-dessous), les pieces d'origine d'un
// locataire : chaque `balanceAfter` depend du mouvement precedent, un ordre
// different produirait des soldes intermediaires corrects mais differents de
// ceux qu'aurait produits l'ecriture au fil de l'eau.
// ---------------------------------------------------------------------------

const MOIS_FR = [
  'janvier',
  'fevrier',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'aout',
  'septembre',
  'octobre',
  'novembre',
  'decembre'
];

function labelPeriode(periodYear?: number | null, periodMonth?: number | null): string | null {
  if (!periodYear || !periodMonth) {
    return null;
  }
  const mois = MOIS_FR[(periodMonth - 1 + 12) % 12] ?? `mois ${periodMonth}`;
  return `${mois} ${periodYear}`;
}

const MOYEN_PAIEMENT_FR: Record<string, string> = {
  CASH: 'especes',
  BANK_TRANSFER: 'virement bancaire',
  CHECK: 'cheque',
  MOBILE_MONEY: 'Mobile Money',
  CARD: 'carte',
  OTHER: 'autre moyen'
};

function labelMoyen(method: string | null | undefined): string {
  return (method && MOYEN_PAIEMENT_FR[method]) || 'moyen non precise';
}

interface PendingMovement {
  /** Depart age (piece la plus ancienne d'abord) puis identifiant, pour un tri stable a date egale. */
  sortKey: string;
  params: AppendMovementParams;
}

/** Voir `RebuildThirdPartyAccount` dans `./types.ts`. */
export const rebuildThirdPartyAccount: RebuildThirdPartyAccount = async (tenantId, accountId) => {
  return prisma.$transaction(async tx => {
    const account = await tx.thirdPartyAccount.findFirst({
      where: { id: accountId, tenantId },
      select: { id: true, tenantClientId: true, balance: true }
    });

    // Rien a reconstruire : compte introuvable, ou tiers d'un genre que ce
    // lot ne sait pas encore projeter depuis des pieces d'origine (seul
    // `TENANT` l'est ; les lots suivants etendront cette fonction).
    if (!account || !account.tenantClientId) {
      return { movementsWritten: 0, balance: toAmountOrZero(account?.balance) };
    }

    const tenantClientId = account.tenantClientId;

    const [installments, allocations, penalties, payments] = await Promise.all([
      tx.rentalInstallment.findMany({
        where: { tenant_id: tenantId, lease: { primary_renter_client_id: tenantClientId } },
        select: {
          id: true,
          lease_id: true,
          due_date: true,
          period_year: true,
          period_month: true,
          amount_rent: true,
          amount_service: true,
          amount_other_fees: true
        }
      }),
      tx.rentalPaymentAllocation.findMany({
        where: { tenant_id: tenantId, payment: { renter_client_id: tenantClientId } },
        select: {
          id: true,
          amount: true,
          payment: { select: { id: true, method: true, succeeded_at: true, initiated_at: true, lease_id: true } },
          installment: { select: { lease_id: true, period_year: true, period_month: true } }
        }
      }),
      tx.rentalPenalty.findMany({
        where: { tenant_id: tenantId, installment: { lease: { primary_renter_client_id: tenantClientId } } },
        select: {
          id: true,
          amount: true,
          calculated_at: true,
          installment: { select: { lease_id: true, period_year: true, period_month: true } }
        }
      }),
      tx.rentalPayment.findMany({
        where: { tenant_id: tenantId, renter_client_id: tenantClientId, status: 'SUCCESS' as any },
        select: {
          id: true,
          amount: true,
          method: true,
          succeeded_at: true,
          initiated_at: true,
          lease_id: true,
          allocations: { select: { amount: true } }
        }
      })
    ]);

    const pending: PendingMovement[] = [];

    for (const installment of installments as any[]) {
      const billed = roundMoney(
        toAmountOrZero(installment.amount_rent) +
          toAmountOrZero(installment.amount_service) +
          toAmountOrZero(installment.amount_other_fees)
      );
      const periode = labelPeriode(installment.period_year, installment.period_month);
      pending.push({
        sortKey: `0-${installment.id}`,
        params: {
          accountId,
          tenantId,
          type: 'INSTALLMENT' as any,
          billed,
          label: periode ? `Loyer de ${periode}` : 'Loyer',
          sourceType: 'RENTAL_INSTALLMENT',
          sourceId: installment.id,
          leaseId: installment.lease_id,
          movementDate: installment.due_date
        }
      });
    }

    for (const allocation of allocations as any[]) {
      const movementDate = allocation.payment?.succeeded_at ?? allocation.payment?.initiated_at ?? new Date(0);
      const periode = labelPeriode(allocation.installment?.period_year, allocation.installment?.period_month);
      const moyen = labelMoyen(allocation.payment?.method);
      pending.push({
        sortKey: `1-${allocation.id}`,
        params: {
          accountId,
          tenantId,
          type: 'PAYMENT' as any,
          settled: toAmountOrZero(allocation.amount),
          label: periode ? `Reglement (${moyen}) affecte a l'echeance de ${periode}` : `Reglement (${moyen})`,
          sourceType: 'RENTAL_PAYMENT_ALLOCATION',
          sourceId: allocation.id,
          leaseId: allocation.installment?.lease_id ?? allocation.payment?.lease_id ?? null,
          movementDate
        }
      });
    }

    for (const penalty of penalties as any[]) {
      const periode = labelPeriode(penalty.installment?.period_year, penalty.installment?.period_month);
      pending.push({
        sortKey: `2-${penalty.id}`,
        params: {
          accountId,
          tenantId,
          type: 'PENALTY' as any,
          billed: toAmountOrZero(penalty.amount),
          label: periode ? `Penalite de retard sur l'echeance de ${periode}` : 'Penalite de retard',
          sourceType: 'RENTAL_PENALTY',
          sourceId: penalty.id,
          leaseId: penalty.installment?.lease_id ?? null,
          movementDate: penalty.calculated_at
        }
      });
    }

    for (const payment of payments as any[]) {
      const allocated = (payment.allocations ?? []).reduce((sum: number, a: any) => sum + toAmountOrZero(a.amount), 0);
      const remainder = roundMoney(toAmountOrZero(payment.amount) - allocated);
      // Un paiement integralement affecte ne laisse aucun reliquat : rien a
      // rejouer, il est deja represente par ses mouvements `PAYMENT`.
      if (remainder <= 0) {
        continue;
      }
      const movementDate = payment.succeeded_at ?? payment.initiated_at ?? new Date(0);
      const moyen = labelMoyen(payment.method);
      pending.push({
        sortKey: `3-${payment.id}`,
        params: {
          accountId,
          tenantId,
          type: 'ADVANCE_RECEIVED' as any,
          settled: remainder,
          label: `Reglement (${moyen}) recu en avance, non affecte`,
          sourceType: 'RENTAL_PAYMENT',
          sourceId: payment.id,
          leaseId: payment.lease_id ?? null,
          movementDate
        }
      });
    }

    pending.sort((a, b) => {
      const diff = (a.params.movementDate as Date).getTime() - (b.params.movementDate as Date).getTime();
      return diff !== 0 ? diff : a.sortKey.localeCompare(b.sortKey);
    });

    const before = await tx.thirdPartyMovement.count({ where: { accountId } });

    for (const item of pending) {
      await appendThirdPartyMovementTx(tx, item.params);
    }

    const after = await tx.thirdPartyMovement.count({ where: { accountId } });
    const refreshed = await tx.thirdPartyAccount.findUnique({ where: { id: accountId }, select: { balance: true } });

    return { movementsWritten: after - before, balance: toAmountOrZero(refreshed?.balance) };
  });
};
