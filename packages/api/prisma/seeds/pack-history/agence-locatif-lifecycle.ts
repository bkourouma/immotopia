/**
 * Vie des baux : colocataires, conditions d'honoraires par bail, commissions des
 * gestionnaires et chronologie (renouvellements, avenants, révisions de loyer,
 * préavis et résiliations).
 *
 * Cohérence : l'historique passé n'écrit que ce que l'état actuel des échéances
 * permet (renouvellement aux mêmes conditions, avenants sans effet chiffré,
 * résiliations de baux déjà terminés). Les révisions de loyer, les préavis en
 * cours et les renouvellements récents passent par les vrais services du produit
 * (échéances recalculées, compte du locataire ajusté).
 */
import { LeaseEventType, Prisma } from '@prisma/client';
import {
  fcfa,
  monthStartUtc,
  noonUtc,
  pickOne,
  pickWeighted,
  plusDays,
  plusMonths,
  roundTo,
  ymd
} from './agence-locatif-base';
import type { LocatifBase } from './agence-locatif-base';

type LifecycleService = typeof import('../../../src/lib/lease-lifecycle/service');

// ───────────────────────────────────────────────────────────── colocataires

export async function seedCoRenters(base: LocatifBase): Promise<void> {
  const { prisma, tenantId, rng, log } = base.ctx;
  if ((await prisma.rentalLeaseCoRenter.count({ where: { tenant_id: tenantId } })) > 0) {
    log('colocataires : déjà présents, bloc sauté.');
    return;
  }
  const renters = await prisma.tenantClient.findMany({
    where: { tenantId, clientType: 'RENTER' },
    select: { id: true },
    orderBy: { id: 'asc' }
  });
  if (renters.length < 2) return;

  const residential = base.leases.filter(
    l =>
      ['APPARTEMENT', 'MAISON_VILLA', 'DUPLEX_TRIPLEX', 'STUDIO'].includes(l.propertyType) &&
      (l.status === 'ACTIVE' || rng() < 0.15)
  );
  const rows: Prisma.RentalLeaseCoRenterCreateManyInput[] = [];
  const stride = Math.max(2, Math.floor(residential.length / 9));
  for (let i = 0; i < residential.length && rows.length < 9; i += stride) {
    const lease = residential[i];
    const candidates = renters.filter(r => r.id !== lease.renterId);
    const coRenter = pickOne(rng, candidates);
    rows.push({
      tenant_id: tenantId,
      lease_id: lease.id,
      renter_client_id: coRenter.id,
      created_at: plusDays(lease.start, -3)
    });
  }
  await prisma.rentalLeaseCoRenter.createMany({ data: rows, skipDuplicates: true });
  log(`colocataires : ${rows.length} baux avec colocataire.`);
}

// ───────────────────────────────────────────────────── honoraires et gestionnaires

export async function seedFeeTerms(base: LocatifBase): Promise<void> {
  const { prisma, tenantId, rng, log } = base.ctx;
  const agents = base.staff.slice(1);

  // Part de commission des collaborateurs (vide tant que l'équipe n'existe pas).
  let rateRows = 0;
  if (agents.length > 0 && (await prisma.agentCommissionRate.count({ where: { tenantId } })) === 0) {
    const shares = [30, 40, 25, 35, 45, 20];
    const data = agents.map((a, i) => ({
      tenantId,
      userId: a.id,
      sharePercent: new Prisma.Decimal(shares[i % shares.length])
    }));
    await prisma.agentCommissionRate.createMany({ data, skipDuplicates: true });
    rateRows = data.length;
  }

  if ((await prisma.leaseManagementTerms.count({ where: { tenantId } })) > 0) {
    log(`conditions par bail : déjà présentes (${rateRows} taux de commission ajoutés).`);
    return;
  }
  const managers = agents.length > 0 ? agents : base.staff;
  const rows: Prisma.LeaseManagementTermsCreateManyInput[] = [];
  base.leases.forEach((lease, i) => {
    const manager = managers[i % managers.length];
    const override = rng() < 0.45;
    const cheap = lease.rent < 120000;
    let mode: 'PERCENT' | 'FIXED' | null = null;
    if (override) mode = cheap && rng() < 0.5 ? 'FIXED' : 'PERCENT';
    rows.push({
      tenantId,
      leaseId: lease.id,
      managementFeeMode: mode,
      managementFeeRate: mode === 'PERCENT' ? new Prisma.Decimal(pickOne(rng, [6, 7, 8, 9, 10, 12])) : null,
      managementFeeFixedAmount: mode === 'FIXED' ? new Prisma.Decimal(pickOne(rng, [7500, 10000, 15000])) : null,
      managementFeeBase: mode ? pickOne(rng, ['RENT_ONLY', 'RENT_ONLY', 'ALL_COLLECTED'] as const) : null,
      agentUserId: manager.id,
      updatedByUserId: base.signers[0].id,
      createdAt: lease.createdAt
    });
  });
  await prisma.leaseManagementTerms.createMany({ data: rows });

  // Les honoraires déjà figés à l'encaissement portent la part du gestionnaire du bail.
  let fees = 0;
  if (agents.length > 0) {
    const shareByUser = new Map(
      (await prisma.agentCommissionRate.findMany({ where: { tenantId } })).map(r => [r.userId, Number(r.sharePercent)])
    );
    for (const row of rows) {
      const share = shareByUser.get(row.agentUserId as string);
      if (!share) continue;
      const leaseFees = await prisma.managementFee.findMany({
        where: { tenantId, leaseId: row.leaseId, agentUserId: null },
        select: { id: true, feeAmount: true }
      });
      for (const fee of leaseFees) {
        await prisma.managementFee.update({
          where: { id: fee.id, tenantId },
          data: {
            agentUserId: row.agentUserId as string,
            agentSharePercent: new Prisma.Decimal(share),
            agentShareAmount: new Prisma.Decimal(Math.round((Number(fee.feeAmount) * share) / 100))
          }
        });
        fees += 1;
      }
    }
  }
  log(`conditions par bail : ${rows.length} baux, ${rateRows} taux de commission, ${fees} honoraires rattachés.`);
}

// ───────────────────────────────────────────────────────────── chronologie

const AMENDMENT_SUMMARIES = [
  'Avenant : autorisation de sous-location partielle à un membre de la famille du locataire.',
  'Avenant : changement du mode de règlement, virement bancaire mensuel en remplacement des espèces.',
  'Avenant : ajout d’un colocataire, solidairement tenu du paiement du loyer et des charges.',
  'Avenant : autorisation d’exercer une activité de profession libérale dans les lieux loués.',
  'Avenant : report de la date d’échéance mensuelle, du 5 au 10 de chaque mois.',
  'Avenant : mise à disposition d’un emplacement de parking supplémentaire sans modification du loyer.',
  'Avenant : installation d’un groupe électrogène aux frais du locataire, à déduire de deux loyers.',
  'Avenant : travaux de peinture pris en charge par le bailleur, sans révision du loyer.',
  'Procès-verbal de conciliation : litige sur la régularisation des charges réglé à l’amiable, dossier clos.',
  'Protocole d’accord après mise en demeure : arriéré échelonné sur trois mois, litige clos à la dernière échéance.'
];

const TERMINATION_SUMMARIES: Record<string, string[]> = {
  TENANT: [
    'Congé donné par le locataire pour mutation professionnelle.',
    'Congé donné par le locataire : acquisition d’un logement.',
    'Congé donné par le locataire : départ pour raisons familiales.',
    'Congé donné par le locataire : fin d’activité dans les locaux.'
  ],
  LANDLORD: [
    'Congé donné par le bailleur pour reprise du bien par son propriétaire.',
    'Congé donné par le bailleur : mise en vente du bien.'
  ],
  MUTUAL: [
    'Résiliation amiable d’un commun accord, état des lieux de sortie programmé.',
    'Fin de bail à son terme, non renouvelé à la demande des deux parties.'
  ]
};

function monthsBetween(start: Date, end: Date): number {
  return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()) + 1;
}

export async function seedLeaseEvents(base: LocatifBase, svc: LifecycleService): Promise<void> {
  const { prisma, tenantId, rng, end, log } = base.ctx;
  const actor = base.signers[0];
  const counts = { renewals: 0, amendments: 0, terminations: 0, revisions: 0, notices: 0 };

  const has = async (type: LeaseEventType) => (await prisma.leaseEvent.count({ where: { tenantId, type } })) > 0;

  // ── Renouvellements passés : aux mêmes conditions, fin de bail repoussée jusqu'à la fin actuelle.
  if (!(await has(LeaseEventType.RENEWAL))) {
    for (const lease of base.leases) {
      if (!lease.end) continue;
      const months = monthsBetween(lease.start, lease.end);
      const initial = months >= 36 ? 24 : months >= 24 ? 12 : 0;
      if (initial === 0) continue;
      const effective = monthStartUtc(lease.start, initial);
      if (effective.getTime() > end.getTime()) continue;
      const created = await prisma.rentalInstallment.count({
        where: { tenant_id: tenantId, lease_id: lease.id, due_date: { gte: effective } }
      });
      await prisma.leaseEvent.create({
        data: {
          tenantId,
          leaseId: lease.id,
          type: LeaseEventType.RENEWAL,
          effectiveDate: effective,
          previousEndDate: plusDays(effective, -1),
          newEndDate: lease.end,
          previousRent: new Prisma.Decimal(lease.rent),
          newRent: new Prisma.Decimal(lease.rent),
          previousCharges: new Prisma.Decimal(lease.charges),
          newCharges: new Prisma.Decimal(lease.charges),
          summary: `Renouvellement du bail pour ${months - initial} mois aux mêmes conditions de loyer et de charges.`,
          details: { installmentsCreated: created } as Prisma.InputJsonValue,
          createdByUserId: pickOne(rng, base.signers).id,
          createdAt: plusDays(effective, -30)
        }
      });
      counts.renewals += 1;
    }
  }

  // ── Avenants : sans effet chiffré, étalés sur les 36 mois.
  if (!(await has(LeaseEventType.AMENDMENT))) {
    const overdue = await prisma.rentalInstallment.findMany({
      where: { tenant_id: tenantId, status: 'OVERDUE' },
      select: { lease_id: true },
      distinct: ['lease_id']
    });
    const overdueLeases = new Set(overdue.map(o => o.lease_id));
    const candidates = base.leases.filter(l => monthsBetween(l.start, l.end ?? end) >= 8);
    let n = 0;
    for (let i = 0; i < candidates.length && n < 16; i += 2) {
      const lease = candidates[i];
      const latest = lease.status === 'ENDED' ? (lease.end ?? end) : end;
      const spanDays = Math.max(60, Math.floor((latest.getTime() - lease.start.getTime()) / 86_400_000) - 90);
      const eff = noonUtc(plusDays(lease.start, 60 + Math.floor(rng() * (spanDays - 60 + 1))));
      const litige = overdueLeases.has(lease.id);
      const summary = litige ? AMENDMENT_SUMMARIES[9] : AMENDMENT_SUMMARIES[n % 9];
      await prisma.leaseEvent.create({
        data: {
          tenantId,
          leaseId: lease.id,
          type: LeaseEventType.AMENDMENT,
          effectiveDate: eff,
          summary: `${summary} (avenant n°1)`,
          createdByUserId: pickOne(rng, base.signers).id,
          createdAt: eff
        }
      });
      counts.amendments += 1;
      n += 1;
      // Un second avenant sur quelques baux longs.
      if (!litige && monthsBetween(lease.start, lease.end ?? end) >= 30 && n % 4 === 0) {
        const eff2 = noonUtc(plusDays(eff, 150));
        if (eff2.getTime() < latest.getTime() && eff2.getTime() < end.getTime()) {
          await prisma.leaseEvent.create({
            data: {
              tenantId,
              leaseId: lease.id,
              type: LeaseEventType.AMENDMENT,
              effectiveDate: eff2,
              summary: `${AMENDMENT_SUMMARIES[(n + 3) % 9]} (avenant n°2)`,
              createdByUserId: pickOne(rng, base.signers).id,
              createdAt: eff2
            }
          });
          counts.amendments += 1;
        }
      }
    }
  }

  // ── Résiliations des baux terminés (le bail est déjà ENDED : aucun effet de bord).
  if (!(await has(LeaseEventType.TERMINATION))) {
    for (const lease of base.leases.filter(l => l.status === 'ENDED')) {
      const effective = noonUtc(lease.end ?? end);
      const initiatedBy = pickWeighted(rng, [
        ['TENANT', 55],
        ['LANDLORD', 15],
        ['MUTUAL', 30]
      ] as const);
      const noticeDays = pickOne(rng, [30, 60, 90]);
      const notice = new Date(Math.max(lease.start.getTime(), effective.getTime() - noticeDays * 86_400_000));
      await prisma.leaseEvent.create({
        data: {
          tenantId,
          leaseId: lease.id,
          type: LeaseEventType.TERMINATION,
          effectiveDate: effective,
          previousEndDate: effective,
          newEndDate: effective,
          noticeDate: noonUtc(notice),
          initiatedBy,
          moveOutDate: noonUtc(lease.moveOut ?? plusDays(effective, 1)),
          summary: pickOne(rng, TERMINATION_SUMMARIES[initiatedBy]),
          details: { installmentsCanceled: 0, billedAfterEnd: 0 } as Prisma.InputJsonValue,
          createdByUserId: pickOne(rng, base.signers).id,
          createdAt: noonUtc(notice)
        }
      });
      counts.terminations += 1;
    }
  }

  // ── Services réels : renouvellements récents, préavis en cours, révisions planifiées.
  const terminatedIds = new Set(
    (await prisma.leaseEvent.findMany({ where: { tenantId, type: 'TERMINATION' }, select: { leaseId: true } })).map(
      e => e.leaseId
    )
  );
  const upcoming = base.leases
    .filter(l => l.status === 'ACTIVE' && l.end && l.end.getTime() > end.getTime() + 15 * 86_400_000)
    .filter(l => !terminatedIds.has(l.id))
    .sort((a, b) => (a.end as Date).getTime() - (b.end as Date).getTime());

  const realRenewalDone =
    (await prisma.leaseEvent.count({
      where: { tenantId, type: { in: ['RENEWAL', 'TERMINATION'] }, effectiveDate: { gt: end } }
    })) > 0;
  const used = new Set<string>();
  // Les deux baux qui finissent en premier restent à traiter : ils alimentent l'alerte « baux arrivant à échéance ».
  const actionable = upcoming.length >= 6 ? upcoming.slice(2) : upcoming;
  if (!realRenewalDone && actionable.length >= 4) {
    const [renewBig, noticeTenant, renewSame, noticeLandlord] = actionable;
    const stepFor = (rent: number) => (rent >= 500000 ? 10000 : rent >= 100000 ? 5000 : 1000);
    const attempts: Array<() => Promise<unknown>> = [
      async () => {
        const newEnd = ymd(plusMonths(renewBig.end as Date, 24));
        const newRent = roundTo(renewBig.rent * 1.05, stepFor(renewBig.rent));
        await svc.renewLease(
          tenantId,
          renewBig.id,
          {
            newEndDate: newEnd,
            newRent,
            summary: `Renouvellement de 24 mois avec révision du loyer de 5 % (${fcfa(renewBig.rent)} → ${fcfa(newRent)}).`
          },
          actor.id
        );
        counts.renewals += 1;
      },
      async () => {
        await svc.terminateLease(
          tenantId,
          noticeTenant.id,
          {
            noticeDate: ymd(plusDays(end, -8)),
            effectiveDate: ymd(noticeTenant.end as Date),
            initiatedBy: 'TENANT',
            moveOutDate: ymd(noticeTenant.end as Date),
            summary: 'Congé donné par le locataire : mutation professionnelle, préavis en cours.'
          },
          actor.id
        );
        counts.notices += 1;
      },
      async () => {
        await svc.renewLease(
          tenantId,
          renewSame.id,
          {
            newEndDate: ymd(plusMonths(renewSame.end as Date, 12)),
            summary: 'Renouvellement de 12 mois aux mêmes conditions, accord des deux parties.'
          },
          actor.id
        );
        counts.renewals += 1;
      },
      async () => {
        await svc.terminateLease(
          tenantId,
          noticeLandlord.id,
          {
            noticeDate: ymd(plusDays(end, -20)),
            effectiveDate: ymd(noticeLandlord.end as Date),
            initiatedBy: 'LANDLORD',
            moveOutDate: ymd(noticeLandlord.end as Date),
            summary: 'Congé donné par le bailleur : mise en vente du bien, préavis en cours.'
          },
          actor.id
        );
        counts.notices += 1;
      }
    ];
    for (const run of attempts) {
      try {
        await run();
      } catch (error) {
        log(`chronologie : opération ignorée — ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    [renewBig, noticeTenant, renewSame, noticeLandlord].forEach(l => used.add(l.id));
  }

  // Révisions de loyer planifiées au mois prochain (les échéances à venir sont recalculées).
  const annualRevisions = await prisma.leaseEvent.count({
    where: { tenantId, type: LeaseEventType.REVISION, summary: { startsWith: 'Révision annuelle' } }
  });
  if (annualRevisions === 0) {
    const nextMonth = monthStartUtc(end, 1);
    const effectiveMonth = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, '0')}`;
    const pool = base.leases.filter(l => l.status === 'ACTIVE' && !used.has(l.id) && !terminatedIds.has(l.id));
    const shuffled = [...pool].sort(() => rng() - 0.5);
    for (const lease of shuffled) {
      if (counts.revisions >= 8) break;
      const rate = pickOne(rng, [3, 4, 5, 6, 8]);
      const step = lease.rent >= 500000 ? 10000 : lease.rent >= 100000 ? 5000 : 1000;
      const newRent = roundTo(lease.rent * (1 + rate / 100), step);
      if (newRent <= lease.rent) continue;
      try {
        await svc.reviseRent(
          tenantId,
          lease.id,
          {
            effectiveMonth,
            newRent,
            revisionRate: rate,
            summary: `Révision annuelle du loyer (+${rate} %) selon la clause d’indexation du bail.`
          },
          pickOne(rng, base.signers).id
        );
        counts.revisions += 1;
      } catch (error) {
        log(`révision ${lease.number} ignorée — ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  log(
    `chronologie des baux : ${counts.renewals} renouvellements, ${counts.amendments} avenants, ` +
      `${counts.terminations} résiliations, ${counts.notices} préavis en cours, ${counts.revisions} révisions planifiées.`
  );
}
