/**
 * Campagne de facturation mensuelle — lot 1, volet clients.
 *
 * Le geste que la gestionnaire répète chaque mois, bail par bail aujourd'hui :
 * ce module le fait en une seule opération, sur tous les baux actifs d'un
 * tenant pour une période donnée, avec un compte rendu qui motive chaque
 * exclusion (`specs/016-finance-operationnelle/spec.md`, récit 3).
 *
 * Trois règles tiennent ce fichier :
 *
 *   1. **L'idempotence ne repose jamais sur une vérification préalable.**
 *      Relancer la campagne sur une période déjà traitée ne doit dupliquer
 *      aucune échéance, mais un `findFirst` puis `create` laisserait une
 *      fenêtre de concurrence (deux exécutions à quelques secondes
 *      d'intervalle, cf. les cas limites de la spec). On tente la création et
 *      on relit la violation `P2002` de la contrainte unique déjà posée sur
 *      `rental_installments` (`lease_id, period_year, period_month`) : c'est
 *      elle qui protège, pas notre code.
 *   2. **Une échéance, son mouvement et ses allocations d'avance naissent
 *      ensemble ou pas du tout.** Tout le monde ci-dessous passe par un seul
 *      `prisma.$transaction` par bail : si le grand livre échoue, l'échéance
 *      de ce bail n'existe pas non plus.
 *   3. **Une exclusion sans motif est un défaut.** Les six valeurs de
 *      `BillingExclusionReason` (`./types.ts`) couvrent tous les chemins de
 *      sortie de la boucle ci-dessous ; en ajouter un nouveau sans motif
 *      explicite est une régression, pas un raccourci.
 *
 * Références : `specs/016-finance-operationnelle/spec.md` (récits 3 et 4),
 * `specs/016-finance-operationnelle/data-model.md` (entité `RentBillingRun`),
 * `docs/finance/PLAN-mise-en-oeuvre.md` §5.2 (tâche 1.5).
 */

import {
  Prisma,
  RentalLeaseStatus,
  RentalInstallmentStatus,
  RentalPaymentStatus,
  RentBillingRunStatus,
  ThirdPartyMovementType
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { appendThirdPartyMovementTx, getOrCreateTenantAccountTx } from './ledger';
import { distributeInstallmentToPartnersTx } from './partnerships';
import { buildInstallmentForPeriod } from './installment-builder';
import type { LeaseForInstallmentBuilding } from './installment-builder';
import { roundMoney } from './money';
import type { BillingRunRecord, BillingRunSummary, RunRentBilling } from './types';

// ---------------------------------------------------------------------------
// Libellés en français — mêmes noms de mois que `ledger.ts` (sans accents,
// pour rester alignés avec les libellés déjà écrits par
// `rebuildThirdPartyAccount`), avec en plus l'élision correcte de « de »
// devant une voyelle (« d'octobre »), absente là-bas mais explicitement
// attendue ici par la spec (exemples du plan : « Loyer de septembre 2026 »,
// « Avance imputée sur le loyer d'octobre 2026 »).
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

const MOIS_AVEC_ELISION = new Set(['avril', 'aout', 'octobre']);

/** « de septembre 2026 » ou « d'octobre 2026 », prêt à suivre « Loyer » ou « le loyer ». */
function libellePeriode(periodYear: number, periodMonth: number): string {
  const mois = MOIS_FR[(periodMonth - 1 + 12) % 12] ?? `mois ${periodMonth}`;
  const connecteur = MOIS_AVEC_ELISION.has(mois) ? `d'${mois}` : `de ${mois}`;
  return `${connecteur} ${periodYear}`;
}

function libelleCampagne(periodYear: number, periodMonth: number): string {
  return `Loyer ${libellePeriode(periodYear, periodMonth)}`;
}

/** Détecte une violation de contrainte unique Prisma, sans dépendre de la classe d'erreur exacte. */
function isUniqueConstraintViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002');
}

// ---------------------------------------------------------------------------
// Sélection des baux — voir `LeaseForInstallmentBuilding` (installment-builder.ts)
// ---------------------------------------------------------------------------

type BillableLease = LeaseForInstallmentBuilding & {
  status: RentalLeaseStatus;
  primary_renter_client_id: string;
  /**
   * Le bien loué. Ajouté au lot 4 : la ventilation entre associés part du
   * bien, pas du bail — c'est le bien qui appartient à une association, et
   * deux baux successifs sur le même bien alimentent les mêmes associés.
   */
  property_id: string;
  property: { title: string } | null;
  primaryRenter: { user: { fullName: string | null; email: string } | null } | null;
};

const LEASE_SELECT = {
  id: true,
  tenant_id: true,
  status: true,
  primary_renter_client_id: true,
  start_date: true,
  end_date: true,
  billing_frequency: true,
  due_day_of_month: true,
  currency: true,
  rent_amount: true,
  service_charge_amount: true,
  property_id: true,
  // Le compte rendu doit se lire sans aller chercher ailleurs : « Fatoumata
  // Diallo — Villa Kipe 12 », jamais un identifiant. On resout les deux noms
  // ici, en une requete, plutot qu'a l'affichage ligne par ligne.
  property: { select: { title: true } },
  primaryRenter: { select: { user: { select: { fullName: true, email: true } } } }
} satisfies Record<keyof BillableLease, unknown>;

/**
 * Nom lisible d'un bail : le locataire, puis le bien.
 *
 * Les replis en cascade evitent qu'une donnee manquante fasse reapparaitre un
 * identifiant a l'ecran. En dernier recours seulement, on montre l'identifiant
 * abrege, qui reste plus utile qu'une chaine vide pour retrouver la ligne.
 */
function libelleBail(lease: BillableLease): string {
  const locataire = lease.primaryRenter?.user?.fullName || lease.primaryRenter?.user?.email;
  const bien = lease.property?.title;

  if (locataire && bien) return `${locataire} — ${bien}`;
  if (locataire) return locataire;
  if (bien) return bien;
  return `Bail ${lease.id.slice(0, 8)}`;
}

/** Nom lisible d'un locataire, memes replis. */
function libelleLocataire(lease: BillableLease): string {
  return (
    lease.primaryRenter?.user?.fullName ||
    lease.primaryRenter?.user?.email ||
    `Locataire ${lease.primary_renter_client_id.slice(0, 8)}`
  );
}

// ---------------------------------------------------------------------------
// Campagne — récupération ou création
// ---------------------------------------------------------------------------

type RentBillingRunRow = Awaited<ReturnType<typeof prisma.rentBillingRun.findUnique>>;

/**
 * Retrouve la campagne de la période, ou la crée. L'unicité
 * `(tenantId, periodYear, periodMonth)` protège déjà des relances
 * concurrentes (double clic, cf. cas limites de la spec) : une collision à la
 * création est relue plutôt que propagée, même logique que
 * `getOrCreateTenantAccountTx` dans `ledger.ts`.
 *
 * Relancer une campagne existante la remet à `RUNNING` et efface son
 * `finishedAt` : c'est la même campagne qui reprend, jamais une seconde.
 */
async function findOrStartRun(
  tenantId: string,
  periodYear: number,
  periodMonth: number,
  requestedLabel: string | undefined,
  actorUserId: string
): Promise<NonNullable<RentBillingRunRow>> {
  const where = { tenantId_periodYear_periodMonth: { tenantId, periodYear, periodMonth } } as const;

  const existing = await prisma.rentBillingRun.findUnique({ where });
  const label = requestedLabel ?? existing?.label ?? libelleCampagne(periodYear, periodMonth);

  if (existing) {
    return prisma.rentBillingRun.update({
      // `tenantId` en plus de l'id : anticipe le futur garde-fou Prisma (lot D).
      where: { id: existing.id, tenantId },
      data: { label, status: RentBillingRunStatus.RUNNING, startedAt: new Date(), finishedAt: null }
    });
  }

  try {
    return await prisma.rentBillingRun.create({
      data: {
        tenantId,
        periodYear,
        periodMonth,
        label,
        status: RentBillingRunStatus.RUNNING,
        createdByUserId: actorUserId
      }
    });
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) {
      throw error;
    }

    // Double clic : une autre exécution a créé la campagne entre notre
    // lecture et notre écriture. On la reprend plutôt que d'échouer.
    const raced = await prisma.rentBillingRun.findUnique({ where });
    if (!raced) {
      throw error;
    }
    return prisma.rentBillingRun.update({
      // `tenantId` en plus de l'id : anticipe le futur garde-fou Prisma (lot D).
      where: { id: raced.id, tenantId },
      data: { label, status: RentBillingRunStatus.RUNNING, startedAt: new Date(), finishedAt: null }
    });
  }
}

function toRecord(row: NonNullable<RentBillingRunRow>, summary: BillingRunSummary | null): BillingRunRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    periodYear: row.periodYear,
    periodMonth: row.periodMonth,
    label: row.label,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    createdByUserId: row.createdByUserId,
    summary
  };
}

// ---------------------------------------------------------------------------
// Avances — imputation du reliquat non alloué, plus ancien d'abord
// ---------------------------------------------------------------------------

/** Sous-ensemble de l'échéance nécessaire à l'imputation d'avance. */
interface InstallmentForAdvance {
  id: string;
  currency: string;
  due_date: Date;
}

/**
 * Impute, sur l'échéance qui vient d'être créée, le reliquat non alloué des
 * règlements du locataire — du plus ancien au plus récent (FR-011, US4). Le
 * reliquat d'un paiement est son montant moins la somme de ses allocations,
 * exactement comme le calcule `allocatePayment`
 * (`services/rental-payment-service.ts`) ; une imputation partielle est
 * normale et laisse le reste du reliquat disponible pour l'échéance suivante.
 *
 * Le mouvement `ADVANCE_APPLIED` posé ici est délibérément sans effet sur le
 * solde (ni `billed`, ni `settled`) : le règlement a déjà été crédité au
 * compte au moment de son encaissement (mouvement `ADVANCE_RECEIVED`, posé
 * ailleurs — branchement locatif, tâche 1.3 du plan — ou reconstruit par
 * `rebuildThirdPartyAccount`), et l'échéance vient d'être débitée en entier
 * par le mouvement `INSTALLMENT` ci-dessus : la somme des deux est déjà le
 * solde exact. Ajouter ici un débit ou un crédit non nul rejouerait le même
 * argent une seconde fois. Ce mouvement n'existe que pour la traçabilité du
 * relevé (FR-011 : « le relevé montre distinctement l'échéance et son
 * imputation ») ; le montant précis de chaque imputation reste consultable
 * dans `summary.advancesApplied`. Hypothèse prise faute d'arbitrage
 * disponible sur ce point précis du plan — voir le rapport de fin de tâche.
 */
async function applyAdvancesTx(
  tx: PrismaTransactionClient,
  args: {
    tenantId: string;
    tenantClientId: string;
    tenantLabel: string;
    accountId: string;
    leaseId: string;
    installment: InstallmentForAdvance;
    totalAmountDue: number;
    periodYear: number;
    periodMonth: number;
    summary: BillingRunSummary;
  }
): Promise<void> {
  let remainingDue = roundMoney(args.totalAmountDue);
  if (remainingDue <= 0) {
    return;
  }

  const payments = await tx.rentalPayment.findMany({
    where: {
      tenant_id: args.tenantId,
      renter_client_id: args.tenantClientId,
      status: RentalPaymentStatus.SUCCESS
    },
    orderBy: [{ succeeded_at: 'asc' }, { initiated_at: 'asc' }],
    select: {
      id: true,
      amount: true,
      allocations: { select: { amount: true } },
      // Ce qui a été déposé en garantie n'est plus disponible pour un loyer.
      depositMovements: { where: { type: 'COLLECT' }, select: { amount: true } }
    }
  });

  let totalAppliedToInstallment = 0;

  for (const payment of payments) {
    if (remainingDue <= 0) {
      break;
    }

    const alreadyAllocated = payment.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
    const deposited = (payment.depositMovements ?? []).reduce((sum, movement) => sum + Number(movement.amount), 0);
    const reliquat = roundMoney(Number(payment.amount) - alreadyAllocated - deposited);
    if (reliquat <= 0) {
      continue;
    }

    const applyAmount = roundMoney(Math.min(reliquat, remainingDue));
    if (applyAmount <= 0) {
      continue;
    }

    const allocation = await tx.rentalPaymentAllocation.create({
      data: {
        tenant_id: args.tenantId,
        payment_id: payment.id,
        installment_id: args.installment.id,
        amount: new Decimal(applyAmount),
        currency: args.installment.currency
      }
    });

    // Imputer une avance, c'est DEUX mouvements, et non un seul.
    //
    // Le reglement avait ete credite en entier a l'encaissement
    // (`ADVANCE_RECEIVED`). L'affecter a une echeance revient donc a reprendre
    // ce credit, puis a le reposer au titre de l'allocation. Le solde ne bouge
    // pas — les deux s'annulent — mais le releve montre distinctement l'avance
    // consommee et le reglement de l'echeance, ce qu'exige le besoin B4.
    //
    // Ce n'est pas une elegance : c'est la seule forme qui s'accorde avec le
    // retro-remplissage, qui rejoue toute allocation sous
    // `(RENTAL_PAYMENT_ALLOCATION, id, PAYMENT)`. Une campagne qui ecrirait
    // son imputation sous une autre cle laisserait le rejeu creer un second
    // credit pour la meme allocation, et le compte du locataire deviendrait
    // faux sans que rien ne le signale.
    await appendThirdPartyMovementTx(tx, {
      accountId: args.accountId,
      tenantId: args.tenantId,
      type: ThirdPartyMovementType.ADVANCE_APPLIED,
      billed: applyAmount,
      label: `Reprise de l'avance, imputée au loyer ${libellePeriode(args.periodYear, args.periodMonth)}`,
      sourceType: 'RENTAL_PAYMENT_ALLOCATION',
      sourceId: allocation.id,
      leaseId: args.leaseId,
      movementDate: args.installment.due_date
    });

    await appendThirdPartyMovementTx(tx, {
      accountId: args.accountId,
      tenantId: args.tenantId,
      type: ThirdPartyMovementType.PAYMENT,
      settled: applyAmount,
      label: `Règlement du loyer ${libellePeriode(args.periodYear, args.periodMonth)}`,
      sourceType: 'RENTAL_PAYMENT_ALLOCATION',
      sourceId: allocation.id,
      leaseId: args.leaseId,
      movementDate: args.installment.due_date
    });

    remainingDue = roundMoney(remainingDue - applyAmount);
    totalAppliedToInstallment = roundMoney(totalAppliedToInstallment + applyAmount);

    args.summary.advancesApplied.push({
      tenantClientId: args.tenantClientId,
      tenantLabel: args.tenantLabel,
      installmentId: args.installment.id,
      amount: applyAmount,
      sourcePaymentId: payment.id
    });
  }

  if (totalAppliedToInstallment > 0) {
    // Même règle que `allocatePayment` : `amount_paid` est toujours la somme
    // des allocations, et le statut suit le solde restant dû.
    const status =
      totalAppliedToInstallment >= args.totalAmountDue ? RentalInstallmentStatus.PAID : RentalInstallmentStatus.PARTIAL;

    await tx.rentalInstallment.update({
      // `tenant_id` en plus de l'id : anticipe le futur garde-fou Prisma (lot D).
      where: { id: args.installment.id, tenant_id: args.tenantId },
      data: {
        amount_paid: new Decimal(totalAppliedToInstallment),
        status,
        paid_at: status === RentalInstallmentStatus.PAID ? new Date() : undefined
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Campagne de facturation
// ---------------------------------------------------------------------------

/** Voir `RunRentBilling` dans `./types.ts`. */
export const runRentBilling: RunRentBilling = async (tenantId, params, actorUserId) => {
  const { periodYear, periodMonth } = params;

  const run = await findOrStartRun(tenantId, periodYear, periodMonth, params.label, actorUserId);

  const summary: BillingRunSummary = { billed: [], excluded: [], advancesApplied: [] };

  try {
    // Tous les baux du tenant, sans filtre de statut : un bail suspendu, en
    // brouillon ou terminé doit apparaître dans les exclus avec son motif
    // (récit 3, scénario 2), pas simplement être absent du compte rendu.
    const leases = (await prisma.rentalLease.findMany({
      where: { tenant_id: tenantId },
      select: LEASE_SELECT
    })) as BillableLease[];

    for (const lease of leases) {
      if (lease.status !== RentalLeaseStatus.ACTIVE) {
        summary.excluded.push({ leaseId: lease.id, leaseLabel: libelleBail(lease), reason: 'LEASE_NOT_ACTIVE' });
        continue;
      }

      const built = buildInstallmentForPeriod(lease, periodYear, periodMonth);
      if (!built.included) {
        summary.excluded.push({ leaseId: lease.id, leaseLabel: libelleBail(lease), reason: built.reason });
        continue;
      }

      const totalAmountDue = roundMoney(
        Number(built.data.amount_rent) + Number(built.data.amount_service) + Number(built.data.amount_other_fees)
      );

      // Bail qui ne doit rien sur la periode : exclu avec motif.
      //
      // Le test porte sur le TOTAL, pas sur le seul loyer. Un bail a loyer nul
      // mais portant des charges locatives existe — periode de franchise de
      // loyer, local ou seules les charges sont refacturees — et il doit etre
      // facture. L'exclure sur son seul loyer ferait perdre a l'agence un
      // argent qui lui est du, sans que rien ne le signale : une exclusion est
      // motivee, donc discrete, et personne ne la relirait.
      if (totalAmountDue <= 0) {
        summary.excluded.push({ leaseId: lease.id, leaseLabel: libelleBail(lease), reason: 'LEASE_WITHOUT_AMOUNT' });
        continue;
      }

      let installmentId: string;
      try {
        installmentId = await prisma.$transaction(async tx => {
          const installment = await tx.rentalInstallment.create({ data: built.data });

          const account = await getOrCreateTenantAccountTx(tx, tenantId, lease.primary_renter_client_id);
          if (!account) {
            throw new Error(
              `Compte de tiers introuvable ou impossible à créer pour le locataire ${lease.primary_renter_client_id}`
            );
          }

          const movement = await appendThirdPartyMovementTx(tx, {
            accountId: account.id,
            tenantId,
            type: ThirdPartyMovementType.INSTALLMENT,
            billed: totalAmountDue,
            label: libelleCampagne(periodYear, periodMonth),
            sourceType: 'RENTAL_INSTALLMENT',
            sourceId: installment.id,
            leaseId: lease.id,
            movementDate: installment.due_date
          });
          if (!movement) {
            throw new Error(`Mouvement de facturation impossible à écrire pour le bail ${lease.id}`);
          }

          // Lot 4 : ce qui revient aux associés du bien, s'il en a.
          //
          // ICI, et pas ailleurs. Dans la transaction du bail, juste après le
          // mouvement : une ventilation écrite hors de cette transaction
          // survivrait à un bail qui échoue, et l'agence devrait de l'argent
          // pour un loyer qu'elle n'a jamais facturé.
          //
          // On lui passe `totalAmountDue`, c'est-à-dire loyer + charges +
          // autres frais — la même grandeur que `rentBilled` de l'état de
          // quote-part, sans quoi le relevé d'un associé contredirait ce qu'il
          // a réellement reçu. Que les charges locatives, qui sont un
          // remboursement de frais plutôt qu'un produit, doivent ou non entrer
          // dans la quote-part est une question pour la cliente ; les deux
          // moitiés du mécanisme répondent au moins la même chose.
          //
          // Cette fonction ne lève jamais : une association mal configurée ne
          // doit pas empêcher de facturer un locataire qui n'y est pour rien.
          await distributeInstallmentToPartnersTx(tx, tenantId, {
            rentalInstallmentId: installment.id,
            propertyId: lease.property_id,
            amount: totalAmountDue,
            periodYear,
            periodMonth
          });

          await applyAdvancesTx(tx, {
            tenantId,
            tenantClientId: lease.primary_renter_client_id,
            tenantLabel: libelleLocataire(lease),
            accountId: account.id,
            leaseId: lease.id,
            installment: { id: installment.id, currency: installment.currency, due_date: installment.due_date },
            totalAmountDue,
            periodYear,
            periodMonth,
            summary
          });

          return installment.id;
        });
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          summary.excluded.push({
            leaseId: lease.id,
            leaseLabel: libelleBail(lease),
            reason: 'INSTALLMENT_ALREADY_EXISTS'
          });
          continue;
        }
        // Toute autre erreur (grand livre en échec, compte introuvable…) fait
        // échouer la campagne entière : aucune ligne partielle, cf.
        // data-model.md. La transaction ci-dessus n'a rien laissé pour ce
        // bail (ni échéance, ni mouvement, ni allocation).
        throw error;
      }

      summary.billed.push({
        leaseId: lease.id,
        leaseLabel: libelleBail(lease),
        installmentId,
        amount: totalAmountDue
      });
    }

    const finished = await prisma.rentBillingRun.update({
      // `tenantId` en plus de l'id : anticipe le futur garde-fou Prisma (lot D).
      where: { id: run.id, tenantId },
      data: {
        status: RentBillingRunStatus.DONE,
        finishedAt: new Date(),
        summary: summary as unknown as Prisma.InputJsonValue
      }
    });

    return toRecord(finished, summary);
  } catch (error) {
    await prisma.rentBillingRun
      .update({
        where: { id: run.id, tenantId },
        data: {
          status: RentBillingRunStatus.FAILED,
          finishedAt: new Date(),
          summary: summary as unknown as Prisma.InputJsonValue
        }
      })
      // Ne masque jamais l'erreur d'origine si l'écriture du statut d'échec
      // échoue elle-même (ex. base injoignable) : c'est elle qui doit remonter.
      .catch(() => undefined);

    throw error;
  }
};
