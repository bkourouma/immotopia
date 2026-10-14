/**
 * PATRIMOINE (correctifs, 2e vague) : la gestion locative vivante.
 *
 * Ce que la recette reprochait au jeu de données : des baux seulement ACTIVE ou ENDED, aucune
 * échéance à échoir, aucun impayé ancien (balance âgée à zéro), des loyers plats d'un mois à
 * l'autre, une seule pénalité lisible. On ajoute des histoires de location (voir
 * `patrimoine-fixes-locatif-data.ts`) : rotations de locataires, vacance entre deux baux,
 * révisions de loyer, retards, paiements partiels, impayés de 0 à plus de 90 jours, baux
 * suspendus, en brouillon ou annulés, avec leurs échéances, règlements, dépôts de garantie,
 * pénalités (calculées, ajustées, remises) et événements de bail.
 *
 * On N'ALTÈRE PAS l'historique déjà écrit (règlements et écritures comptables en place) : tout
 * est ajouté. Les écritures et comptes de tiers de ces lignes sont rejoués par
 * `seedFinanceTransverse`, qui s'exécute après les modules.
 *
 * Idempotent : un bail dont le numéro existe est ignoré.
 */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { addDays, between, monthsAgo, pick } from './types';
import type { PatLease, PatProperty, PatState } from './patrimoine-extras-state';
import { author } from './patrimoine-extras-state';
import { ESS_STORIES, PRO_STORIES } from './patrimoine-fixes-locatif-data';
import type { LeaseStory } from './patrimoine-fixes-locatif-data';

const DAY = 86_400_000;
const roundTo = (value: number, step: number): number => Math.round(value / step) * step;
const leaseNumber = (no: number): string => `PAT-BAIL-1${String(no).padStart(2, '0')}`;

/** Premier jour du mois situé `i` mois avant maintenant (i négatif : à venir). */
const monthStart = (end: Date, i: number): Date => new Date(end.getFullYear(), end.getMonth() - i, 1, 10, 0, 0, 0);
const endOfMonth = (d: Date): Date => new Date(d.getFullYear(), d.getMonth() + 1, 0, 18, 0, 0, 0);

function rentAt(story: LeaseStory, i: number): number {
  let rent = story.rent;
  const revisions = [...(story.revisions ?? [])].sort((a, b) => b.from - a.from);
  for (const r of revisions) if (i <= r.from) rent = r.rent;
  return rent;
}

const serviceOf = (rent: number): number => roundTo(rent * 0.06, 5_000);

function stripe(story: LeaseStory): number[] {
  const out: number[] = [];
  if (story.status === 'DRAFT' || story.status === 'CANCELED') return out;
  const first = Math.min(story.start, 36);
  const last = story.last ?? 0;
  for (let i = first; i >= last; i--) out.push(i);
  return out;
}

export async function seedLeaseStories(s: PatState): Promise<number> {
  const { prisma, tenantId, adminUserId, end, rng, log } = s.ctx;
  const stories = s.isPro ? PRO_STORIES : ESS_STORIES;
  const known = new Set(s.leases.map(l => l.number));
  const todo = stories.filter(st => !known.has(leaseNumber(st.no)));
  if (todo.length === 0) return 0;
  const byRef = new Map(s.properties.map(p => [p.ref, p]));
  const tag = tenantId.slice(0, 8);

  const users: Prisma.UserCreateManyInput[] = [];
  const clients: Prisma.TenantClientCreateManyInput[] = [];
  const leases: Prisma.RentalLeaseCreateManyInput[] = [];
  const installments: Prisma.RentalInstallmentCreateManyInput[] = [];
  const items: Prisma.RentalInstallmentItemCreateManyInput[] = [];
  const payments: Prisma.RentalPaymentCreateManyInput[] = [];
  const allocations: Prisma.RentalPaymentAllocationCreateManyInput[] = [];
  const penalties: Prisma.RentalPenaltyUncheckedCreateInput[] = [];
  const events: Prisma.LeaseEventUncheckedCreateInput[] = [];
  const history: Prisma.PropertyStatusHistoryUncheckedCreateInput[] = [];
  const depositsToWrite: Array<{
    leaseId: string;
    story: LeaseStory;
    deposit: number;
    arrears: number;
    start: Date;
    moveOut: Date | null;
  }> = [];
  let counter = 0;

  for (const st of todo) {
    const prop = byRef.get(`PAT-${st.prop}`);
    if (!prop) continue;
    counter += 1;
    const leaseId = randomUUID();
    const userId = randomUUID();
    const clientId = randomUUID();
    const number = leaseNumber(st.no);
    const firstMonth = monthStart(end, st.status === 'DRAFT' ? -1 : st.start);
    const startDate = new Date(firstMonth.getFullYear(), firstMonth.getMonth(), 1, 10);
    const lastBilled = st.last;
    const finalRent = rentAt(st, lastBilled ?? 0);
    const service = serviceOf(finalRent);
    const stopped = st.status === 'ENDED' && lastBilled !== null ? endOfMonth(monthStart(end, lastBilled)) : null;

    users.push({
      id: userId,
      email: `locataire-s${st.no}.${tag}@packs.immotopia.test`,
      fullName: st.renter,
      isActive: true
    });
    clients.push({
      id: clientId,
      userId,
      tenantId,
      clientType: 'RENTER',
      details: { source: 'pack-history' }
    });
    leases.push({
      id: leaseId,
      tenant_id: tenantId,
      property_id: prop.id,
      primary_renter_client_id: clientId,
      lease_number: number,
      status: st.status,
      start_date: startDate,
      end_date: stopped,
      move_in_date: st.status === 'DRAFT' || st.status === 'CANCELED' ? null : startDate,
      move_out_date: stopped,
      billing_frequency: 'MONTHLY',
      due_day_of_month: st.dueDay,
      currency: 'FCFA',
      rent_amount: finalRent,
      service_charge_amount: service,
      security_deposit_amount: finalRent * 2,
      penalty_grace_days: 5,
      penalty_mode: 'PERCENT_OF_BALANCE',
      penalty_rate: 2,
      notes: `Bail ${st.commercial ? 'commercial' : 'd’habitation'} — ${prop.title}${st.unit ? ` (${st.unit})` : ''}${
        st.status === 'SUSPENDED'
          ? ' — suspendu : loyers impayés, procédure amiable en cours'
          : st.status === 'DRAFT'
            ? ' — projet de bail en attente de signature'
            : st.status === 'CANCELED'
              ? ' — annulé : désistement du candidat avant l’entrée dans les lieux'
              : ''
      }`,
      created_by_user_id: adminUserId,
      created_at: st.status === 'DRAFT' ? addDays(end, -4) : startDate
    });

    const pushPayment = (amount: number, at: Date, installmentId: string, ms: Date): void => {
      const paymentId = randomUUID();
      const method = pick(rng, ['MOBILE_MONEY', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CASH'] as const);
      payments.push({
        id: paymentId,
        tenant_id: tenantId,
        lease_id: leaseId,
        renter_client_id: clientId,
        method,
        status: 'SUCCESS',
        currency: 'FCFA',
        amount,
        mm_operator: method === 'MOBILE_MONEY' ? pick(rng, ['ORANGE', 'MTN', 'WAVE'] as const) : null,
        idempotency_key: `pat-fix:${number}:${ms.getFullYear()}-${String(ms.getMonth() + 1).padStart(2, '0')}`,
        initiated_at: at,
        succeeded_at: at,
        created_by_user_id: adminUserId,
        created_at: at
      });
      allocations.push({
        tenant_id: tenantId,
        payment_id: paymentId,
        installment_id: installmentId,
        amount,
        currency: 'FCFA',
        created_at: at
      });
    };

    // ---- échéances et règlements
    let arrears = 0;
    for (const i of stripe(st)) {
      const ms = monthStart(end, i);
      const due = new Date(ms.getFullYear(), ms.getMonth(), st.dueDay, 10, 0, 0, 0);
      const rent = rentAt(st, i);
      const svc = serviceOf(rent);
      const total = rent + svc;
      const daysLate = Math.floor((end.getTime() - due.getTime()) / DAY);
      const isUnpaid = st.unpaid?.includes(i) ?? false;
      const isPartial = st.partial?.includes(i) ?? false;
      const isLate = st.late?.includes(i) ?? false;
      let status: 'PAID' | 'PARTIAL' | 'OVERDUE' | 'DUE' = 'PAID';
      let paid = total;
      let paidAt: Date | null = addDays(due, between(rng, 0, 3));
      if (isUnpaid) {
        status = daysLate >= 5 ? 'OVERDUE' : 'DUE';
        paid = 0;
        paidAt = null;
      } else if (isPartial) {
        status = 'PARTIAL';
        paid = roundTo(total * 0.55, 5_000);
        paidAt = addDays(due, 12);
      } else if (isLate) {
        paidAt = addDays(due, between(rng, 14, 24));
      } else if (i === 0) {
        // Mois en cours : échéance future = à échoir ; échue = réglée (2 fois sur 3) ou en attente.
        if (due.getTime() > end.getTime()) {
          status = 'DUE';
          paid = 0;
          paidAt = null;
        } else if (rng() < 0.65) {
          paidAt = new Date(Math.min(end.getTime(), paidAt.getTime()));
        } else {
          status = daysLate >= 5 ? 'OVERDUE' : 'DUE';
          paid = 0;
          paidAt = null;
        }
      }
      if (paidAt && paidAt.getTime() > end.getTime()) paidAt = end;

      // Pénalité : retard d'au moins 10 jours sur un solde resté dû.
      let penaltyAmount = 0;
      const balance = total - paid;
      if (balance > 0 && daysLate >= 10) {
        const calc = roundTo(balance * 0.02, 500);
        const kind = (st.no + i) % 6;
        const adjusted = kind === 0 || kind === 3;
        const waived = kind === 5;
        const amount = waived ? 0 : adjusted ? roundTo(calc / 2, 500) : calc;
        penaltyAmount = amount;
        const installmentId = randomUUID();
        penalties.push({
          id: randomUUID(),
          tenant_id: tenantId,
          installment_id: installmentId,
          calculated_at: addDays(due, Math.min(daysLate, 30)),
          days_late: daysLate,
          mode: 'PERCENT_OF_BALANCE',
          rate: 2,
          amount,
          currency: 'FCFA',
          is_manual_override: adjusted || waived,
          override_reason: waived
            ? JSON.stringify({ reason: 'Pénalité remise : retard de virement bancaire attesté par le locataire.' })
            : adjusted
              ? JSON.stringify({ reason: 'Geste commercial : pénalité réduite de moitié après accord amiable.' })
              : null,
          created_by_user_id: author(s),
          created_at: addDays(due, Math.min(daysLate, 30))
        });
        installments.push({
          id: installmentId,
          tenant_id: tenantId,
          lease_id: leaseId,
          period_year: ms.getFullYear(),
          period_month: ms.getMonth() + 1,
          due_date: due,
          status,
          currency: 'FCFA',
          amount_rent: rent,
          amount_service: svc,
          penalty_amount: penaltyAmount,
          amount_paid: paid,
          paid_at: null,
          created_at: ms
        });
        items.push(...itemRows(tenantId, installmentId, rent, svc));
        arrears += balance + penaltyAmount;
        if (paid > 0 && paidAt) pushPayment(paid, paidAt, installmentId, ms);
        continue;
      }

      const installmentId = randomUUID();
      installments.push({
        id: installmentId,
        tenant_id: tenantId,
        lease_id: leaseId,
        period_year: ms.getFullYear(),
        period_month: ms.getMonth() + 1,
        due_date: due,
        status,
        currency: 'FCFA',
        amount_rent: rent,
        amount_service: svc,
        amount_paid: paid,
        paid_at: status === 'PAID' ? paidAt : null,
        created_at: ms
      });
      items.push(...itemRows(tenantId, installmentId, rent, svc));
      if (balance > 0) arrears += balance;
      if (paid > 0 && paidAt) pushPayment(paid, paidAt, installmentId, ms);
    }

    // ---- échéance du mois prochain pour un bail en cours (à échoir)
    if (st.status === 'ACTIVE' && st.last === null) {
      const ms = monthStart(end, -1);
      const rent = rentAt(st, -1);
      const svc = serviceOf(rent);
      const id = randomUUID();
      installments.push({
        id,
        tenant_id: tenantId,
        lease_id: leaseId,
        period_year: ms.getFullYear(),
        period_month: ms.getMonth() + 1,
        due_date: new Date(ms.getFullYear(), ms.getMonth(), st.dueDay, 10),
        status: 'DUE',
        currency: 'FCFA',
        amount_rent: rent,
        amount_service: svc,
        amount_paid: 0,
        created_at: end
      });
      items.push(...itemRows(tenantId, id, rent, svc));
    }

    // ---- dépôt de garantie
    if (st.status !== 'DRAFT' && st.status !== 'CANCELED') {
      depositsToWrite.push({ leaseId, story: st, deposit: finalRent * 2, arrears, start: startDate, moveOut: stopped });
    }

    // ---- événements de bail
    const authorId = (): string => author(s);
    if (st.status !== 'DRAFT' && st.status !== 'CANCELED') {
      for (const r of [...(st.revisions ?? [])].sort((a, b) => b.from - a.from)) {
        const when = monthStart(end, r.from);
        const previous = rentAt(st, r.from + 1);
        events.push({
          tenantId,
          leaseId,
          type: 'REVISION',
          effectiveDate: when,
          previousRent: previous,
          newRent: r.rent,
          previousCharges: serviceOf(previous),
          newCharges: serviceOf(r.rent),
          revisionRate: Number((((r.rent - previous) / previous) * 100).toFixed(2)),
          summary: `Révision annuelle du loyer : de ${previous.toLocaleString('fr-FR')} à ${r.rent.toLocaleString('fr-FR')} F CFA, notifiée au locataire.`,
          details: { reason: 'Indexation annuelle' },
          createdByUserId: authorId(),
          createdAt: addDays(when, -30)
        });
      }
      const ongoing = st.last === null || st.status === 'SUSPENDED';
      for (let y = 1; y <= 2; y++) {
        const when = new Date(startDate.getFullYear() + y, startDate.getMonth(), 1, 10);
        if (when.getTime() > end.getTime() - 30 * DAY) break;
        if (stopped && when.getTime() > stopped.getTime() - 30 * DAY) break;
        if (when.getTime() < monthsAgo(end, 36).getTime()) continue;
        events.push({
          tenantId,
          leaseId,
          type: 'RENEWAL',
          effectiveDate: when,
          previousRent: rentAt(st, Math.round((end.getTime() - when.getTime()) / (30.4 * DAY)) + 1),
          newRent: rentAt(st, Math.round((end.getTime() - when.getTime()) / (30.4 * DAY))),
          previousEndDate: addDays(when, -1),
          newEndDate: new Date(when.getFullYear() + 1, when.getMonth(), 0, 18),
          summary: `Reconduction du bail pour douze mois (${st.renter}).`,
          details: { tacite: true },
          createdByUserId: authorId(),
          createdAt: when
        });
      }
      if (st.status === 'SUSPENDED' && st.last !== null) {
        const when = addDays(monthStart(end, st.last), 40);
        events.push({
          tenantId,
          leaseId,
          type: 'AMENDMENT',
          effectiveDate: when,
          summary:
            'Suspension du bail : loyers impayés, mise en demeure adressée au locataire et plan d’apurement proposé.',
          details: { subject: 'Suspension pour impayés' },
          createdByUserId: authorId(),
          createdAt: when
        });
      } else if (!ongoing && st.status === 'ENDED' && stopped) {
        const initiators = ['TENANT', 'LANDLORD', 'MUTUAL'] as const;
        const initiator = arrears > 0 ? 'LANDLORD' : initiators[st.no % 3];
        events.push({
          tenantId,
          leaseId,
          type: 'TERMINATION',
          effectiveDate: stopped,
          noticeDate: addDays(stopped, -90),
          initiatedBy: initiator,
          moveOutDate: stopped,
          summary:
            arrears > 0
              ? 'Résiliation à l’initiative du bailleur pour loyers impayés ; dépôt de garantie imputé sur les arriérés.'
              : initiator === 'TENANT'
                ? 'Congé donné par le locataire avec préavis de trois mois.'
                : initiator === 'LANDLORD'
                  ? 'Congé donné par le bailleur pour reprise du bien.'
                  : 'Résiliation amiable : accord des deux parties sur la date de sortie.',
          details: { depositRefunded: arrears === 0 },
          createdByUserId: authorId(),
          createdAt: addDays(stopped, -90)
        });
      }
      if (st.no % 4 === 2 && st.start >= 10 && st.status === 'ACTIVE') {
        const when = addDays(startDate, 150);
        events.push({
          tenantId,
          leaseId,
          type: 'AMENDMENT',
          effectiveDate: when,
          summary: 'Avenant : mise à disposition d’une place de stationnement.',
          details: { subject: 'Place de stationnement' },
          createdByUserId: authorId(),
          createdAt: when
        });
      }
    }

    // ---- historique de statut du bien (uniquement les biens ajoutés par ce correctif)
    if (st.status === 'ACTIVE' || st.status === 'SUSPENDED' || st.status === 'ENDED') {
      history.push({
        propertyId: prop.id,
        tenantId,
        previousStatus: 'AVAILABLE',
        newStatus: 'RENTED',
        changedByUserId: author(s),
        notes: `Bail ${number} : entrée de ${st.renter}.`,
        createdAt: startDate
      });
      if (stopped) {
        history.push({
          propertyId: prop.id,
          tenantId,
          previousStatus: 'RENTED',
          newStatus: 'AVAILABLE',
          changedByUserId: author(s),
          notes: `Fin du bail ${number} : bien libéré.`,
          createdAt: addDays(stopped, 1)
        });
      }
    }
  }
  void counter;

  // Les nouveaux biens loués seulement : l'historique des biens de base existe déjà.
  const newRefs = new Set<string>();
  for (const st of todo) {
    const p = byRef.get(`PAT-${st.prop}`);
    if (p && s.leases.every(l => l.propertyId !== p.id)) newRefs.add(p.id);
  }
  const historyRows = history.filter(h => newRefs.has(h.propertyId));

  await prisma.$transaction(
    async tx => {
      await tx.user.createMany({ data: users });
      await tx.tenantClient.createMany({ data: clients });
      await tx.rentalLease.createMany({ data: leases });
      await tx.rentalInstallment.createMany({ data: installments });
      await tx.rentalInstallmentItem.createMany({ data: items });
      await tx.rentalPayment.createMany({ data: payments });
      await tx.rentalPaymentAllocation.createMany({ data: allocations });
      for (const p of penalties) await tx.rentalPenalty.create({ data: p });
      await tx.leaseEvent.createMany({ data: events });
      await tx.propertyStatusHistory.createMany({ data: historyRows });
    },
    { timeout: 120_000, maxWait: 30_000 }
  );

  // Dépôts de garantie (un par bail occupé) : encaissé, restitué, retenu sur les arriérés.
  for (const d of depositsToWrite) {
    const ended = d.story.status === 'ENDED' && d.moveOut;
    const forfeit = ended ? Math.min(d.deposit, Math.max(0, roundTo(d.arrears, 5_000))) : 0;
    const refunded = ended ? d.deposit - forfeit : 0;
    const row = await prisma.rentalSecurityDeposit.create({
      data: {
        tenant_id: tenantId,
        lease_id: d.leaseId,
        currency: 'FCFA',
        target_amount: d.deposit,
        collected_amount: d.deposit,
        held_amount: 0,
        refunded_amount: refunded,
        forfeited_amount: forfeit,
        created_at: d.start
      },
      select: { id: true }
    });
    const rows: Prisma.RentalDepositMovementUncheckedCreateInput[] = [
      {
        tenant_id: tenantId,
        deposit_id: row.id,
        type: 'COLLECT',
        currency: 'FCFA',
        amount: d.deposit,
        note: 'Dépôt de garantie encaissé à la signature du bail.',
        created_by_user_id: author(s),
        created_at: d.start
      }
    ];
    if (ended && d.moveOut) {
      const out = addDays(d.moveOut, 8);
      if (forfeit > 0) {
        rows.push({
          tenant_id: tenantId,
          deposit_id: row.id,
          type: 'FORFEIT',
          currency: 'FCFA',
          amount: forfeit,
          note: 'Retenue sur les loyers impayés à la sortie du locataire.',
          created_by_user_id: author(s),
          created_at: out
        });
      }
      if (refunded > 0) {
        rows.push({
          tenant_id: tenantId,
          deposit_id: row.id,
          type: 'REFUND',
          currency: 'FCFA',
          amount: refunded,
          note: forfeit > 0 ? 'Solde du dépôt restitué au locataire.' : 'Dépôt restitué intégralement.',
          created_by_user_id: author(s),
          created_at: out
        });
      }
    }
    await prisma.rentalDepositMovement.createMany({ data: rows });
  }

  log(
    `patrimoine-correctifs : ${leases.length} bail(s) ajouté(s) (statuts variés), ${installments.length} échéance(s), ${payments.length} règlement(s), ${penalties.length} pénalité(s), ${events.length} événement(s) de bail.`
  );
  return leases.length;
}

function itemRows(
  tenantId: string,
  installmentId: string,
  rent: number,
  service: number
): Prisma.RentalInstallmentItemCreateManyInput[] {
  return [
    {
      tenant_id: tenantId,
      installment_id: installmentId,
      charge_type: 'RENT',
      label: 'Loyer',
      amount: rent,
      currency: 'FCFA'
    },
    {
      tenant_id: tenantId,
      installment_id: installmentId,
      charge_type: 'SERVICE_CHARGE',
      label: 'Charges locatives',
      amount: service,
      currency: 'FCFA'
    }
  ];
}

// ------------------------------------------------------------------ échéances du mois prochain, révisions annoncées

/**
 * Les baux de base (en cours) n'avaient pas d'échéance à venir : on émet celle du mois prochain
 * (statut DUE, échéance dans le futur) et on annonce une révision de loyer sur quelques baux.
 * Les loyers déjà facturés ne changent pas : la révision prend effet au mois prochain.
 */
export async function seedNextInstallments(s: PatState): Promise<void> {
  const { prisma, tenantId, end, log } = s.ctx;
  const next = monthStart(end, -1);
  const year = next.getFullYear();
  const month = next.getMonth() + 1;
  const active = s.leases.filter(l => l.status === 'ACTIVE' && !l.number.startsWith('PAT-BAIL-1'));
  if (active.length === 0) return;
  const have = new Set(
    (
      await prisma.rentalInstallment.findMany({
        where: { tenant_id: tenantId, period_year: year, period_month: month },
        select: { lease_id: true }
      })
    ).map(i => i.lease_id)
  );
  const dueDayOf = new Map(
    (
      await prisma.rentalLease.findMany({
        where: { tenant_id: tenantId, id: { in: active.map(l => l.id) } },
        select: { id: true, due_day_of_month: true }
      })
    ).map(l => [l.id, l.due_day_of_month])
  );

  let created = 0;
  let revised = 0;
  for (const [n, l] of active.entries()) {
    if (have.has(l.id)) continue;
    let rent = l.rent;
    const service = l.service;
    // Une révision annoncée sur un bail d'habitation sur quatre, effective le mois prochain.
    if (n % 4 === 1 && !isCommercialLease(s, l)) {
      const newRent = roundTo(l.rent * 1.05, 5_000);
      const effective = monthStart(end, -1);
      const already = await prisma.leaseEvent.findFirst({
        where: { tenantId, leaseId: l.id, type: 'REVISION', effectiveDate: effective },
        select: { id: true }
      });
      if (!already && newRent > l.rent) {
        await prisma.leaseEvent.create({
          data: {
            tenantId,
            leaseId: l.id,
            type: 'REVISION',
            effectiveDate: effective,
            previousRent: l.rent,
            newRent,
            previousCharges: l.service,
            newCharges: l.service,
            revisionRate: 5,
            summary: `Révision annuelle de 5 % notifiée à ${l.renterName} : nouveau loyer applicable au ${effective.toLocaleDateString('fr-FR')}.`,
            details: { reason: 'Indexation annuelle' },
            createdByUserId: author(s),
            createdAt: addDays(end, -12)
          }
        });
        await prisma.rentalLease.update({ where: { id: l.id }, data: { rent_amount: newRent } });
        rent = newRent;
        revised += 1;
      }
    }
    const installment = await prisma.rentalInstallment.create({
      data: {
        tenant_id: tenantId,
        lease_id: l.id,
        period_year: year,
        period_month: month,
        due_date: new Date(year, month - 1, dueDayOf.get(l.id) ?? 5, 10),
        status: 'DUE',
        currency: 'FCFA',
        amount_rent: rent,
        amount_service: service,
        amount_paid: 0,
        created_at: end
      },
      select: { id: true }
    });
    await prisma.rentalInstallmentItem.createMany({ data: itemRows(tenantId, installment.id, rent, service) });
    created += 1;
  }
  if (created > 0)
    log(
      `patrimoine-correctifs : ${created} échéance(s) du mois prochain émise(s) (DUE), ${revised} révision(s) annoncée(s).`
    );
}

function isCommercialLease(s: PatState, l: PatLease): boolean {
  const p: PatProperty | undefined = s.properties.find(x => x.id === l.propertyId);
  return !!p && ['BUREAU', 'BOUTIQUE_COMMERCIAL', 'ENTREPOT_INDUSTRIEL'].includes(p.type);
}
