/**
 * Gestion locative directe des biens détenus : historique de statut des biens,
 * états des lieux (entrée et sortie, photos), dépôts de garantie, événements de
 * bail, documents locatifs en Word, pénalités, déclarations de paiement des
 * locataires, tickets de maintenance et liens de paiement.
 *
 * Idempotent par bloc ; chaque fichier référencé est écrit sur disque au chemin
 * que le module attend (`lease-inspections/`, `portal/payments/`, `maintenance/`,
 * `rental/penalties/`, `assets/generated_documents/`).
 */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { writeDemoPdf, writeUpload } from './seed-files';
import {
  depositReceipt,
  hnum,
  leaseAddendum,
  leaseContract,
  rentQuittance,
  rentStatement,
  type LeaseFacts
} from './patrimoine-extras-docs';
import {
  buildDocx,
  dateFr,
  monthFr,
  sceneImage,
  sha256,
  writeGeneratedDocx,
  xof,
  type SceneKind
} from './patrimoine-extras-files';
import { author, facts, isCommercial, type PatLease, type PatProperty, type PatState } from './patrimoine-extras-state';
import { addDays, between, monthsAgo, pick } from './types';
import { defaultRooms, furnishedRooms } from '../../../src/lib/lease-inspections/inventory';
import type { Condition, Deduction, InspectionRoom } from '../../../src/lib/lease-inspections/inventory';

const roundTo = (value: number, step: number): number => Math.round(value / step) * step;
const atDay = (d: Date, day: number): Date => new Date(d.getFullYear(), d.getMonth(), day, 10, 0, 0, 0);

const propOf = (s: PatState, l: PatLease): PatProperty => s.properties.find(p => p.id === l.propertyId) as PatProperty;

function leaseFacts(s: PatState, l: PatLease): LeaseFacts {
  const p = propOf(s, l);
  return {
    number: l.number,
    property: facts(p),
    renter: l.renterName,
    landlord: s.ownerName,
    rent: l.rent,
    service: l.service,
    deposit: l.deposit,
    start: l.start,
    end: l.end,
    commercial: isCommercial(p.type)
  };
}

/** Retenue sur dépôt de garantie à la sortie d'un bail terminé : stable, donc identique pour l'état des lieux et le dépôt. */
function exitForfeit(l: PatLease): number {
  const h = hnum(l.number, 0, 9);
  return h < 4 ? 0 : roundTo(l.rent * (0.1 + (h % 3) * 0.12), 5_000);
}

// ------------------------------------------------------------------ historique de statut des biens

export async function seedStatusHistory(s: PatState): Promise<void> {
  const { prisma, tenantId, log } = s.ctx;
  if ((await prisma.propertyStatusHistory.count({ where: { tenantId } })) > 0) return;
  const rows: Prisma.PropertyStatusHistoryUncheckedCreateInput[] = [];
  for (const p of s.properties) {
    let current: 'DRAFT' | 'AVAILABLE' | 'RENTED' | null = null;
    const push = (to: 'DRAFT' | 'AVAILABLE' | 'RENTED', at: Date, note: string): void => {
      rows.push({
        propertyId: p.id,
        tenantId,
        previousStatus: current,
        newStatus: to,
        changedByUserId: author(s),
        notes: note,
        createdAt: at
      });
      current = to;
    };
    push('DRAFT', p.createdAt, 'Bien ajouté au patrimoine.');
    push('AVAILABLE', addDays(p.createdAt, 3), 'Bien vérifié et disponible.');
    const leases = s.leases.filter(l => l.propertyId === p.id).sort((a, b) => a.start.getTime() - b.start.getTime());
    for (const l of leases) {
      push('RENTED', l.start, `Bail ${l.number} : entrée de ${l.renterName}.`);
      if (l.status === 'ENDED' && l.moveOut)
        push('AVAILABLE', addDays(l.moveOut, 1), `Fin du bail ${l.number} : bien libéré.`);
    }
  }
  await prisma.propertyStatusHistory.createMany({ data: rows });
  log(`patrimoine-extras : ${rows.length} changement(s) de statut des biens.`);
}

// ------------------------------------------------------------------ états des lieux

function commercialRooms(type: string): InspectionRoom[] {
  const mk = (name: string, labels: string[]): InspectionRoom => ({
    id: randomUUID(),
    name,
    items: labels.map(label => ({ id: randomUUID(), label, condition: null, comment: null, kind: 'FIXTURE' as const }))
  });
  if (type === 'BUREAU') {
    return [
      mk('Open space', ['Sol', 'Murs', 'Plafond et dalles', 'Climatisation', 'Prises et réseau']),
      mk('Bureaux fermés', ['Cloisons vitrées', 'Portes', 'Éclairage']),
      mk('Sanitaires', ['Sol', 'Lavabos', 'Cuvettes'])
    ];
  }
  if (type === 'ENTREPOT_INDUSTRIEL') {
    return [
      mk('Hall de stockage', ['Dalle béton', 'Charpente et bardage', 'Éclairage', 'Portail coulissant']),
      mk('Quai de chargement', ['Rampe', 'Rideau métallique']),
      mk("Bureau d'exploitation", ['Sol', 'Murs', 'Climatisation']),
      mk('Sanitaires', ['Sol', 'Lavabos'])
    ];
  }
  return [
    mk('Surface de vente', ['Sol', 'Murs', 'Plafond', 'Vitrine', 'Éclairage']),
    mk('Réserve', ['Sol', 'Murs', 'Rayonnages']),
    mk('Façade', ['Rideau métallique', 'Enseigne', 'Porte vitrée']),
    mk('Sanitaires', ['Sol', 'Lavabo'])
  ];
}

function roomsFor(p: PatProperty): InspectionRoom[] {
  if (isCommercial(p.type)) return commercialRooms(p.type);
  if (p.type === 'STUDIO') return furnishedRooms({ withQuantities: true });
  return defaultRooms();
}

export async function seedInspections(s: PatState): Promise<void> {
  const { prisma, tenantId, rng, log } = s.ctx;
  const users = await prisma.user.findMany({ where: { id: { in: s.staff } }, select: { id: true, fullName: true } });
  const agentName = users[0]?.fullName ?? s.ownerName;
  let created = 0;
  let photos = 0;

  for (const l of s.leases) {
    const p = propOf(s, l);
    const entryDone = await prisma.leaseInspection.findFirst({
      where: { tenantId, leaseId: l.id, type: 'ENTRY' },
      select: { id: true }
    });
    const entryRooms: InspectionRoom[] = roomsFor(p).map(room => ({
      ...room,
      items: room.items.map(item => {
        const r = rng();
        const condition: Condition = r < 0.25 ? 'NEW' : r < 0.85 ? 'GOOD' : 'FAIR';
        return {
          ...item,
          condition,
          comment:
            condition === 'FAIR'
              ? pick(rng, ['Légères traces d’usure.', 'Petite rayure à signaler.', 'Peinture à rafraîchir.'])
              : null
        };
      })
    }));
    const baseReading = between(rng, 4_000, 22_000);

    const scenesFor = (rooms: InspectionRoom[]): Array<{ room: InspectionRoom; scene: SceneKind }> =>
      rooms.slice(0, 3).map((room, i) => ({
        room,
        scene: isCommercial(p.type)
          ? i === 0
            ? 'room'
            : 'facade'
          : i === 0
            ? 'room'
            : i === 1
              ? 'kitchen'
              : 'bathroom'
      }));

    const write = async (
      type: 'ENTRY' | 'EXIT',
      rooms: InspectionRoom[],
      date: Date,
      meters: Prisma.InputJsonValue,
      deductions: Deduction[],
      comment: string
    ): Promise<void> => {
      const id = randomUUID();
      await prisma.leaseInspection.create({
        data: {
          id,
          tenantId,
          leaseId: l.id,
          type,
          status: 'FINALIZED',
          inspectionDate: date,
          rooms: rooms as unknown as Prisma.InputJsonValue,
          meters,
          keysCount: between(rng, 2, 4),
          generalComment: comment,
          tenantPresent: true,
          tenantSignatoryName: l.renterName,
          agentSignatoryName: agentName,
          deductions: deductions as unknown as Prisma.InputJsonValue,
          finalizedAt: addDays(date, 1),
          finalizedByUserId: author(s),
          createdByUserId: author(s),
          createdAt: date
        }
      });
      created += 1;
      for (const [k, { room, scene }] of scenesFor(rooms).entries()) {
        const file = await writeUpload(
          ['lease-inspections', tenantId, id],
          `${randomUUID()}.png`,
          sceneImage(scene, hnum(l.number, 0, 4) + k)
        );
        await prisma.leaseInspectionPhoto.create({
          data: {
            tenantId,
            inspectionId: id,
            roomId: room.id,
            fileName: `${type === 'ENTRY' ? 'entree' : 'sortie'}-${k + 1}.png`,
            filePath: file.filePath,
            mimeType: 'image/png',
            sizeBytes: file.fileSize,
            caption: `${room.name} — état des lieux d’${type === 'ENTRY' ? 'entrée' : 'sortie'}`,
            uploadedByUserId: author(s),
            createdAt: date
          }
        });
        photos += 1;
      }
    };

    if (!entryDone) {
      await write(
        'ENTRY',
        entryRooms,
        l.start,
        { electricity: `${baseReading} kWh`, water: `${between(rng, 100, 900)} m³`, gas: null },
        [],
        `Logement remis en bon état d’usage à ${l.renterName}. Clés remises en main propre.`
      );
    }

    if (l.status === 'ENDED' && l.moveOut) {
      const exitDone = await prisma.leaseInspection.findFirst({
        where: { tenantId, leaseId: l.id, type: 'EXIT' },
        select: { id: true }
      });
      if (exitDone) continue;
      const forfeit = exitForfeit(l);
      const exitRooms: InspectionRoom[] = entryRooms.map((room, ri) => ({
        ...room,
        items: room.items.map((item, ii) => {
          const hit = forfeit > 0 && ri === 0 && ii < 2;
          return {
            ...item,
            condition: hit ? ('POOR' as Condition) : item.condition,
            comment: hit ? 'Murs sales et rayés, remise en peinture nécessaire.' : item.comment
          };
        })
      }));
      const deductions: Deduction[] = [];
      if (forfeit > 0) {
        const keys = forfeit >= 60_000 ? 15_000 : 0;
        deductions.push({
          id: randomUUID(),
          label: 'Remise en peinture des murs',
          amount: forfeit - keys,
          roomId: exitRooms[0].id,
          itemId: exitRooms[0].items[1]?.id ?? null,
          source: 'DEGRADED',
          proposedAmount: forfeit - keys
        });
        if (keys) {
          deductions.push({
            id: randomUUID(),
            label: 'Remplacement d’une clé perdue',
            amount: keys,
            roomId: null,
            itemId: null,
            source: 'KEYS',
            proposedAmount: keys
          });
        }
      }
      await write(
        'EXIT',
        exitRooms,
        l.moveOut,
        {
          electricity: `${baseReading + between(rng, 2_000, 9_000)} kWh`,
          water: `${between(rng, 900, 1_900)} m³`,
          gas: null
        },
        deductions,
        forfeit > 0
          ? `Logement rendu avec dégradations légères : retenue de ${xof(forfeit)} sur le dépôt de garantie.`
          : 'Logement rendu en bon état : dépôt de garantie restitué intégralement.'
      );
    }
  }
  log(`patrimoine-extras : ${created} état(s) des lieux, ${photos} photo(s).`);
}

// ------------------------------------------------------------------ dépôts de garantie

export async function seedDeposits(s: PatState): Promise<void> {
  const { prisma, tenantId, log } = s.ctx;
  if ((await prisma.rentalSecurityDeposit.count({ where: { tenant_id: tenantId } })) > 0) return;
  let movements = 0;
  for (const l of s.leases) {
    const forfeit = l.status === 'ENDED' ? exitForfeit(l) : 0;
    const ended = l.status === 'ENDED' && l.moveOut;
    const refunded = ended ? l.deposit - forfeit : 0;
    const deposit = await prisma.rentalSecurityDeposit.create({
      data: {
        tenant_id: tenantId,
        lease_id: l.id,
        currency: 'FCFA',
        target_amount: l.deposit,
        collected_amount: l.deposit,
        held_amount: 0,
        refunded_amount: refunded,
        forfeited_amount: forfeit,
        created_at: l.start
      },
      select: { id: true }
    });
    const rows: Prisma.RentalDepositMovementUncheckedCreateInput[] = [
      {
        tenant_id: tenantId,
        deposit_id: deposit.id,
        type: 'COLLECT',
        currency: 'FCFA',
        amount: l.deposit,
        note: 'Dépôt de garantie encaissé à la signature du bail.',
        created_by_user_id: author(s),
        created_at: l.start
      }
    ];
    if (ended && l.moveOut) {
      const out = addDays(l.moveOut, 8);
      if (forfeit > 0) {
        rows.push(
          {
            tenant_id: tenantId,
            deposit_id: deposit.id,
            type: 'HOLD',
            currency: 'FCFA',
            amount: forfeit,
            note: 'Retenue en attente du devis de remise en état.',
            created_by_user_id: author(s),
            created_at: addDays(l.moveOut, 1)
          },
          {
            tenant_id: tenantId,
            deposit_id: deposit.id,
            type: 'RELEASE',
            currency: 'FCFA',
            amount: forfeit,
            note: 'Devis reçu : retenue levée pour être imputée.',
            created_by_user_id: author(s),
            created_at: addDays(l.moveOut, 6)
          },
          {
            tenant_id: tenantId,
            deposit_id: deposit.id,
            type: 'FORFEIT',
            currency: 'FCFA',
            amount: forfeit,
            note: 'Retenue pour remise en état des lieux (voir état des lieux de sortie).',
            created_by_user_id: author(s),
            created_at: out
          }
        );
      }
      rows.push({
        tenant_id: tenantId,
        deposit_id: deposit.id,
        type: 'REFUND',
        currency: 'FCFA',
        amount: refunded,
        note: forfeit > 0 ? 'Solde du dépôt restitué au locataire.' : 'Dépôt restitué intégralement.',
        created_by_user_id: author(s),
        created_at: out
      });
    }
    await prisma.rentalDepositMovement.createMany({ data: rows });
    movements += rows.length;
  }
  log(`patrimoine-extras : ${s.leases.length} dépôt(s) de garantie, ${movements} mouvement(s).`);
}

// ------------------------------------------------------------------ événements de bail

export async function seedLeaseEvents(s: PatState): Promise<void> {
  const { prisma, tenantId, end, log } = s.ctx;
  if ((await prisma.leaseEvent.count({ where: { tenantId } })) > 0) return;
  const rows: Prisma.LeaseEventUncheckedCreateInput[] = [];
  const amendmentSubjects = [
    'Mise à disposition d’une place de stationnement couverte',
    'Autorisation d’une activité complémentaire dans les locaux',
    'Paiement du loyer par virement permanent',
    'Pose d’un compteur d’eau individuel'
  ];
  for (const [i, l] of s.leases.entries()) {
    const p = propOf(s, l);
    const rent = l.rent;
    const eff = (years: number): Date =>
      new Date(l.start.getFullYear() + years, l.start.getMonth(), l.start.getDate(), 10);
    const months = (end.getFullYear() - l.start.getFullYear()) * 12 + end.getMonth() - l.start.getMonth();
    const lastYear = l.status === 'ENDED' && l.moveOut ? l.moveOut : end;
    let renewals = 0;
    for (let y = 1; y <= 3 && renewals < 2; y++) {
      const when = eff(y);
      if (when.getTime() > lastYear.getTime() - 30 * 86_400_000) break;
      if (when.getTime() < monthsAgo(end, 36).getTime()) continue;
      rows.push({
        tenantId,
        leaseId: l.id,
        type: 'RENEWAL',
        effectiveDate: when,
        previousRent: rent,
        newRent: rent,
        previousCharges: l.service,
        newCharges: l.service,
        previousEndDate: addDays(when, -1),
        newEndDate: addDays(eff(y + 1), -1),
        summary: `Reconduction du bail pour douze mois : loyer et charges maintenus (${l.renterName}).`,
        details: { tacite: true },
        createdByUserId: author(s),
        createdAt: when
      });
      renewals += 1;
    }
    if (months >= 26 && !isCommercial(p.type)) {
      const when = eff(2);
      if (when.getTime() >= monthsAgo(end, 36).getTime()) {
        rows.push({
          tenantId,
          leaseId: l.id,
          type: 'REVISION',
          effectiveDate: addDays(when, 20),
          previousRent: rent,
          newRent: rent,
          previousCharges: l.service,
          newCharges: l.service,
          revisionRate: 0,
          summary: 'Révision annuelle examinée : le bailleur maintient le loyer en l’état, d’un commun accord.',
          details: { reason: 'Maintien du loyer' },
          createdByUserId: author(s),
          createdAt: addDays(when, 20)
        });
      }
    }
    if (i % 4 === 1 && months >= 10) {
      const when = addDays(l.start, 200);
      rows.push({
        tenantId,
        leaseId: l.id,
        type: 'AMENDMENT',
        effectiveDate: when,
        summary: `Avenant : ${amendmentSubjects[(i >> 2) % amendmentSubjects.length].toLowerCase()}.`,
        details: { subject: amendmentSubjects[(i >> 2) % amendmentSubjects.length] },
        createdByUserId: author(s),
        createdAt: when
      });
    }
    if (l.status === 'ENDED' && l.moveOut) {
      const initiators = ['TENANT', 'LANDLORD', 'MUTUAL'] as const;
      const initiator = initiators[hnum(l.number, 0, 2)];
      rows.push({
        tenantId,
        leaseId: l.id,
        type: 'TERMINATION',
        effectiveDate: l.moveOut,
        noticeDate: addDays(l.moveOut, -90),
        initiatedBy: initiator,
        moveOutDate: l.moveOut,
        summary:
          initiator === 'TENANT'
            ? 'Congé donné par le locataire (mutation professionnelle) avec préavis de trois mois.'
            : initiator === 'LANDLORD'
              ? 'Congé donné par le bailleur pour reprise du bien et travaux de rénovation.'
              : 'Résiliation amiable : accord des deux parties sur la date de sortie.',
        details: { depositRefunded: true },
        createdByUserId: author(s),
        createdAt: addDays(l.moveOut, -90)
      });
    }
  }
  await prisma.leaseEvent.createMany({ data: rows });
  log(`patrimoine-extras : ${rows.length} événement(s) de bail.`);
}

// ------------------------------------------------------------------ documents locatifs (Word)

export async function seedRentalDocuments(s: PatState): Promise<void> {
  const { prisma, tenantId, end, log } = s.ctx;
  if ((await prisma.rentalDocument.count({ where: { tenant_id: tenantId } })) > 0) return;
  const leaseById = new Map(s.leases.map(l => [l.id, l]));
  const counters = new Map<string, number>();
  const nextNumber = (prefix: string, year: number): string => {
    const key = `${prefix}-${year}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    return `${prefix}-${year}-${String(n).padStart(4, '0')}`;
  };
  const counts: Record<string, number> = {};

  const make = async (input: {
    type: 'LEASE_CONTRACT' | 'LEASE_ADDENDUM' | 'RENT_RECEIPT' | 'RENT_QUITTANCE' | 'DEPOSIT_RECEIPT' | 'STATEMENT';
    status: 'DRAFT' | 'FINAL' | 'VOID' | 'SUPERSEDED';
    number: string;
    title: string;
    description?: string;
    lease: PatLease;
    installmentId?: string;
    paymentId?: string;
    issuedAt: Date;
    doc: { title: string; lines: string[] };
    revision?: number;
    id?: string;
    supersededById?: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<string> => {
    const buffer = buildDocx(input.doc.title, input.doc.lines);
    const filePath = await writeGeneratedDocx(
      tenantId,
      input.type,
      input.number,
      input.id ?? input.lease.id,
      input.issuedAt,
      buffer
    );
    const row = await prisma.rentalDocument.create({
      data: {
        id: input.id,
        tenant_id: tenantId,
        type: input.type,
        status: input.status,
        lease_id: input.lease.id,
        installment_id: input.installmentId ?? null,
        payment_id: input.paymentId ?? null,
        document_number: input.number,
        file_path: filePath,
        mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        file_hash: sha256(buffer),
        issued_at: input.issuedAt,
        title: input.title,
        description: input.description ?? null,
        metadata: input.metadata,
        revision: input.revision ?? 1,
        superseded_by_id: input.supersededById ?? null,
        created_by_user_id: author(s),
        created_at: input.issuedAt
      },
      select: { id: true }
    });
    counts[input.type] = (counts[input.type] ?? 0) + 1;
    return row.id;
  };

  for (const l of s.leases) {
    const lf = leaseFacts(s, l);
    await make({
      type: 'LEASE_CONTRACT',
      status: 'FINAL',
      number: l.number,
      title: `Contrat de bail ${l.number}`,
      lease: l,
      issuedAt: l.start,
      doc: leaseContract(lf)
    });
    await make({
      type: 'DEPOSIT_RECEIPT',
      status: 'FINAL',
      number: nextNumber('DEP', l.start.getFullYear()),
      title: `Reçu de dépôt de garantie — ${l.renterName}`,
      lease: l,
      issuedAt: l.start,
      doc: depositReceipt(lf)
    });
  }

  // Quittances : une par échéance entièrement payée, un reçu pour l'échéance partielle.
  const installments = await prisma.rentalInstallment.findMany({
    where: { tenant_id: tenantId },
    orderBy: [{ period_year: 'asc' }, { period_month: 'asc' }, { due_date: 'asc' }],
    select: {
      id: true,
      lease_id: true,
      period_year: true,
      period_month: true,
      status: true,
      due_date: true,
      paid_at: true,
      amount_paid: true,
      amount_rent: true,
      amount_service: true,
      payments: {
        select: { payment: { select: { id: true, method: true, succeeded_at: true, mm_operator: true } } },
        take: 1
      }
    }
  });
  const methodLabel = (m: string | undefined, op: string | null | undefined): string =>
    m === 'MOBILE_MONEY'
      ? `Mobile Money${op ? ` (${op === 'ORANGE' ? 'Orange Money' : op === 'MTN' ? 'MTN MoMo' : op === 'WAVE' ? 'Wave' : op})` : ''}`
      : m === 'BANK_TRANSFER'
        ? 'virement bancaire'
        : m === 'CASH'
          ? 'espèces'
          : 'paiement enregistré';

  let firstQuittanceLease: string | null = null;
  let correctedDone = false;
  let voidDone = false;
  for (const inst of installments) {
    const l = leaseById.get(inst.lease_id);
    if (!l) continue;
    const month = new Date(inst.period_year, inst.period_month - 1, 1);
    const pay = inst.payments[0]?.payment;
    const paidAt = pay?.succeeded_at ?? inst.paid_at;
    const lf = leaseFacts(s, l);
    if (inst.status === 'PAID' && paidAt) {
      const number = nextNumber('QUI', paidAt.getFullYear());
      const amount = Number(inst.amount_paid);
      const label = methodLabel(pay?.method, pay?.mm_operator);
      const isRecent = paidAt.getTime() > monthsAgo(end, 4).getTime();
      if (isRecent && !correctedDone && (firstQuittanceLease === null || firstQuittanceLease === l.id)) {
        // Une quittance corrigée : la première version (mauvaise période) est remplacée par la seconde.
        firstQuittanceLease = l.id;
        correctedDone = true;
        const newId = randomUUID();
        const oldId = await make({
          type: 'RENT_QUITTANCE',
          status: 'SUPERSEDED',
          number: `${number}-R1`,
          title: `Quittance de loyer — ${monthFr(month)} (première édition)`,
          lease: l,
          installmentId: inst.id,
          paymentId: pay?.id,
          issuedAt: paidAt,
          doc: rentQuittance(lf, addDays(month, -31), paidAt, amount, label),
          supersededById: undefined
        });
        await make({
          id: newId,
          type: 'RENT_QUITTANCE',
          status: 'FINAL',
          number,
          title: `Quittance de loyer — ${monthFr(month)}`,
          description: 'Édition corrigée : la période avait été mal indiquée.',
          lease: l,
          installmentId: inst.id,
          paymentId: pay?.id,
          issuedAt: addDays(paidAt, 1),
          revision: 2,
          doc: rentQuittance(lf, month, paidAt, amount, label)
        });
        await prisma.rentalDocument.update({ where: { id: oldId }, data: { superseded_by_id: newId } });
        continue;
      }
      await make({
        type: 'RENT_QUITTANCE',
        status: 'FINAL',
        number,
        title: `Quittance de loyer — ${monthFr(month)}`,
        lease: l,
        installmentId: inst.id,
        paymentId: pay?.id,
        issuedAt: paidAt,
        doc: rentQuittance(lf, month, paidAt, amount, label)
      });
      if (
        !voidDone &&
        paidAt.getTime() < monthsAgo(end, 14).getTime() &&
        paidAt.getTime() > monthsAgo(end, 20).getTime()
      ) {
        voidDone = true;
        await make({
          type: 'RENT_QUITTANCE',
          status: 'VOID',
          number: nextNumber('QUI', paidAt.getFullYear()),
          title: `Quittance annulée — ${monthFr(month)}`,
          description: 'Émise en double par erreur : annulée, la quittance valable porte le numéro précédent.',
          lease: l,
          installmentId: inst.id,
          paymentId: pay?.id,
          issuedAt: addDays(paidAt, 1),
          doc: rentQuittance(lf, month, paidAt, amount, label)
        });
      }
    } else if (inst.status === 'PARTIAL' && paidAt) {
      await make({
        type: 'RENT_RECEIPT',
        status: 'FINAL',
        number: nextNumber('REC', paidAt.getFullYear()),
        title: `Reçu de paiement partiel — ${monthFr(month)}`,
        lease: l,
        installmentId: inst.id,
        paymentId: pay?.id,
        issuedAt: paidAt,
        doc: rentQuittance(lf, month, paidAt, Number(inst.amount_paid), methodLabel(pay?.method, pay?.mm_operator))
      });
    } else if (inst.status === 'OVERDUE' || inst.status === 'PARTIAL') {
      const balance = Number(inst.amount_rent) + Number(inst.amount_service) - Number(inst.amount_paid);
      await make({
        type: 'STATEMENT',
        status: 'DRAFT',
        number: nextNumber('REL', end.getFullYear()),
        title: `Relevé de compte locataire — ${l.renterName}`,
        description: 'Brouillon à envoyer au locataire avant relance.',
        lease: l,
        issuedAt: end,
        doc: rentStatement(lf, balance, end)
      });
    }
  }
  // Un relevé de compte définitif pour le locataire qui paie en retard.
  const late = installments.find(i => i.status === 'OVERDUE');
  if (late) {
    const l = leaseById.get(late.lease_id) as PatLease;
    await make({
      type: 'STATEMENT',
      status: 'FINAL',
      number: nextNumber('REL', end.getFullYear()),
      title: `Relevé de compte locataire — ${l.renterName}`,
      lease: l,
      issuedAt: addDays(end, -3),
      doc: rentStatement(leaseFacts(s, l), Number(late.amount_rent) + Number(late.amount_service), addDays(end, -3))
    });
  }

  // Avenants : un document par événement d'avenant.
  const amendments = await prisma.leaseEvent.findMany({ where: { tenantId, type: 'AMENDMENT' } });
  for (const ev of amendments) {
    const l = leaseById.get(ev.leaseId);
    if (!l) continue;
    await make({
      type: 'LEASE_ADDENDUM',
      status: 'FINAL',
      number: nextNumber('AVN', ev.effectiveDate.getFullYear()),
      title: `Avenant au bail ${l.number}`,
      description: ev.summary ?? undefined,
      lease: l,
      issuedAt: ev.effectiveDate,
      doc: leaseAddendum(
        leaseFacts(s, l),
        ev.effectiveDate,
        String((ev.details as { subject?: string } | null)?.subject ?? ev.summary ?? 'Avenant')
      )
    });
  }
  log(
    `patrimoine-extras : documents locatifs (Word) écrits — ${Object.entries(counts)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ')}.`
  );
}

// ------------------------------------------------------------------ pénalités

export async function seedPenalties(s: PatState): Promise<void> {
  const { prisma, tenantId, end, log, rng } = s.ctx;
  if ((await prisma.rentalPenaltyRule.count({ where: { tenant_id: tenantId } })) > 0) return;
  await prisma.rentalPenaltyRule.create({
    data: {
      tenant_id: tenantId,
      is_active: true,
      grace_days: 5,
      mode: 'PERCENT_OF_BALANCE',
      rate: 2,
      cap_amount: 50_000,
      min_balance_to_apply: 10_000
    }
  });
  const leaseById = new Map(s.leases.map(l => [l.id, l]));
  const insts = await prisma.rentalInstallment.findMany({
    where: { tenant_id: tenantId, OR: [{ status: 'OVERDUE' }, { status: 'PAID', paid_at: { not: null } }] },
    orderBy: { due_date: 'asc' },
    select: {
      id: true,
      lease_id: true,
      status: true,
      due_date: true,
      paid_at: true,
      amount_rent: true,
      amount_service: true
    }
  });
  let count = 0;
  let waived = 0;
  for (const inst of insts) {
    const total = Number(inst.amount_rent) + Number(inst.amount_service);
    const l = leaseById.get(inst.lease_id);
    if (!l) continue;
    if (inst.status === 'OVERDUE') {
      const daysLate = Math.max(6, Math.floor((end.getTime() - inst.due_date.getTime()) / 86_400_000));
      const amount = Math.min(50_000, Math.round(total * 0.02));
      await prisma.rentalPenalty.create({
        data: {
          tenant_id: tenantId,
          installment_id: inst.id,
          calculated_at: end,
          days_late: daysLate,
          mode: 'PERCENT_OF_BALANCE',
          rate: 2,
          amount,
          currency: 'FCFA',
          created_by_user_id: author(s),
          created_at: end
        }
      });
      await prisma.rentalInstallment.update({ where: { id: inst.id }, data: { penalty_amount: amount } });
      count += 1;
      continue;
    }
    if (!inst.paid_at) continue;
    const daysLate = Math.floor((inst.paid_at.getTime() - inst.due_date.getTime()) / 86_400_000);
    if (daysLate < 14 || waived >= 5 || rng() > 0.45) continue;
    // Retard exceptionnel : pénalité annulée par le bailleur, avec justificatif.
    const id = randomUUID();
    const file = await writeDemoPdf(
      ['rental', 'penalties', id],
      'justificatif.pdf',
      'Justificatif d’annulation de pénalité',
      [
        `Locataire : ${l.renterName} — bail ${l.number}`,
        `Échéance du ${dateFr(inst.due_date)}, payée le ${dateFr(inst.paid_at)} (${daysLate} jours de retard).`,
        'Motif : incident sur le service de paiement mobile, attesté par le locataire (capture de l’opérateur).',
        'Décision du bailleur : pénalité annulée à titre exceptionnel.'
      ]
    );
    await prisma.rentalPenalty.create({
      data: {
        id,
        tenant_id: tenantId,
        installment_id: inst.id,
        calculated_at: inst.paid_at,
        days_late: daysLate,
        mode: 'PERCENT_OF_BALANCE',
        rate: 2,
        amount: 0,
        currency: 'FCFA',
        is_manual_override: true,
        override_reason: JSON.stringify({
          reason: 'Pénalité annulée : incident Mobile Money attesté.',
          justification: { fileUrl: file.fileUrl, fileName: 'justificatif.pdf' }
        }),
        created_by_user_id: author(s),
        created_at: inst.paid_at
      }
    });
    waived += 1;
    count += 1;
  }
  log(`patrimoine-extras : règle de pénalité et ${count} pénalité(s) (dont ${waived} annulée(s) avec justificatif).`);
}

// ------------------------------------------------------------------ déclarations de paiement des locataires

export async function seedDeclarations(s: PatState): Promise<void> {
  const { prisma, tenantId, end, log, rng } = s.ctx;
  if ((await prisma.rentalPaymentDeclaration.count({ where: { tenant_id: tenantId } })) > 0) return;
  const leaseById = new Map(s.leases.map(l => [l.id, l]));
  const insts = await prisma.rentalInstallment.findMany({
    where: { tenant_id: tenantId },
    orderBy: { due_date: 'desc' },
    select: {
      id: true,
      lease_id: true,
      status: true,
      due_date: true,
      paid_at: true,
      amount_rent: true,
      amount_service: true,
      amount_paid: true,
      payments: { select: { payment: { select: { method: true, mm_operator: true, succeeded_at: true } } }, take: 1 }
    }
  });
  const proof = async (variant: number): Promise<string> => {
    const f = await writeUpload(
      ['portal', 'payments', tenantId],
      `preuve-${randomUUID()}.png`,
      sceneImage('screenshot', variant)
    );
    return f.fileUrl;
  };
  const ops = ['ORANGE', 'MTN', 'WAVE', 'MOOV'] as const;
  let n = 0;
  const base = (l: PatLease, inst: (typeof insts)[number], amount: number, when: Date) => ({
    tenant_id: tenantId,
    lease_id: l.id,
    installment_id: inst.id,
    declared_by: l.clientId,
    amount,
    payment_date: when,
    payment_method: 'MOBILE_MONEY' as const,
    mobile_operator: pick(rng, ops),
    transaction_phone: `07 ${between(rng, 10, 99)} ${between(rng, 10, 99)} ${between(rng, 10, 99)} ${between(rng, 10, 99)}`,
    reference: `MP${when.getFullYear() % 100}${String(when.getMonth() + 1).padStart(2, '0')}${between(rng, 100000, 999999)}`,
    created_at: when,
    updated_at: when
  });

  // En attente : le locataire en retard déclare avoir payé.
  const overdue = insts.find(i => i.status === 'OVERDUE');
  if (overdue) {
    const l = leaseById.get(overdue.lease_id);
    if (l) {
      const when = addDays(end, -2);
      await prisma.rentalPaymentDeclaration.create({
        data: {
          ...base(l, overdue, Number(overdue.amount_rent) + Number(overdue.amount_service), when),
          proof_file_url: await proof(0),
          status: 'PENDING',
          notes: 'Paiement effectué par Orange Money, en attente de vérification par le propriétaire.'
        }
      });
      n += 1;
    }
  }
  // Acceptées : trois paiements en retard régularisés après déclaration.
  const settled = insts.filter(
    i => i.status === 'PAID' && i.paid_at && i.paid_at.getTime() - i.due_date.getTime() > 8 * 86_400_000
  );
  for (const inst of settled.slice(0, 3)) {
    const l = leaseById.get(inst.lease_id);
    if (!l || !inst.paid_at) continue;
    const declared = addDays(inst.paid_at, -1);
    await prisma.rentalPaymentDeclaration.create({
      data: {
        ...base(l, inst, Number(inst.amount_paid), declared),
        proof_file_url: await proof(1),
        status: 'APPROVED',
        reviewed_by: author(s),
        reviewed_at: inst.paid_at,
        review_notes: 'Paiement retrouvé sur le relevé Mobile Money : déclaration validée.',
        updated_at: inst.paid_at
      }
    });
    n += 1;
  }
  // Refusée et annulée.
  const paid = insts.filter(i => i.status === 'PAID' && i.paid_at);
  const rej = paid[7];
  if (rej && rej.paid_at) {
    const l = leaseById.get(rej.lease_id);
    if (l) {
      await prisma.rentalPaymentDeclaration.create({
        data: {
          ...base(l, rej, Number(rej.amount_paid), addDays(rej.paid_at, -4)),
          proof_file_url: await proof(2),
          status: 'REJECTED',
          reviewed_by: author(s),
          reviewed_at: addDays(rej.paid_at, -3),
          review_notes: 'Capture illisible et référence introuvable : merci de renvoyer une preuve lisible.'
        }
      });
      n += 1;
    }
  }
  const can = paid[11];
  if (can && can.paid_at) {
    const l = leaseById.get(can.lease_id);
    if (l) {
      await prisma.rentalPaymentDeclaration.create({
        data: {
          ...base(l, can, Number(can.amount_paid), addDays(can.paid_at, -6)),
          status: 'CANCELED',
          notes: 'Déclaration annulée par le locataire : paiement effectué finalement par virement.'
        }
      });
      n += 1;
    }
  }
  log(`patrimoine-extras : ${n} déclaration(s) de paiement des locataires.`);
}

// ------------------------------------------------------------------ tickets de maintenance (portail locataire)

interface TicketDef {
  title: string;
  category: 'PLUMBING' | 'ELECTRICITY' | 'AC' | 'OTHER';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  ago: number;
  agoDays?: number;
  status: 'DECLARED' | 'IN_PROGRESS' | 'ASSIGNED' | 'RESOLVED' | 'CANCELED';
  text: string;
  resolution?: string;
}

const TICKETS: readonly TicketDef[] = [
  {
    title: 'Fuite sous l’évier de la cuisine',
    category: 'PLUMBING',
    priority: 'MEDIUM',
    ago: 30,
    status: 'RESOLVED',
    text: 'L’eau goutte en continu sous l’évier, le placard est humide.',
    resolution: 'Siphon et joints remplacés par le plombier.'
  },
  {
    title: 'Disjoncteur qui saute à chaque orage',
    category: 'ELECTRICITY',
    priority: 'HIGH',
    ago: 26,
    status: 'RESOLVED',
    text: 'Le disjoncteur général saute dès que le climatiseur démarre.',
    resolution: 'Disjoncteur remplacé et câblage de la prise du climatiseur repris.'
  },
  {
    title: 'Climatiseur du salon qui ne refroidit plus',
    category: 'AC',
    priority: 'MEDIUM',
    ago: 22,
    status: 'RESOLVED',
    text: 'Le climatiseur souffle de l’air tiède depuis deux jours.',
    resolution: 'Recharge en gaz et nettoyage des filtres.'
  },
  {
    title: 'Porte d’entrée qui ferme mal',
    category: 'OTHER',
    priority: 'LOW',
    ago: 20,
    status: 'RESOLVED',
    text: 'La serrure force et la porte frotte au sol.',
    resolution: 'Gonds réglés et serrure graissée.'
  },
  {
    title: 'Chauffe-eau en panne',
    category: 'PLUMBING',
    priority: 'MEDIUM',
    ago: 17,
    status: 'RESOLVED',
    text: 'Plus d’eau chaude dans la salle de bain.',
    resolution: 'Résistance du chauffe-eau remplacée.'
  },
  {
    title: 'Fuite d’eau sur le palier',
    category: 'PLUMBING',
    priority: 'URGENT',
    ago: 15,
    status: 'RESOLVED',
    text: 'Une canalisation fuit dans la gaine technique, de l’eau coule sur le palier.',
    resolution: 'Tuyau remplacé le jour même, gaine séchée.'
  },
  {
    title: 'Demande de remplacement d’une prise murale',
    category: 'ELECTRICITY',
    priority: 'LOW',
    ago: 13,
    status: 'CANCELED',
    text: 'La prise du couloir est desserrée.',
    resolution: 'Demande annulée : le locataire a réglé le problème lui-même.'
  },
  {
    title: 'Climatiseur de la chambre bruyant',
    category: 'AC',
    priority: 'LOW',
    ago: 11,
    status: 'RESOLVED',
    text: 'Bruit de ventilateur très fort la nuit.',
    resolution: 'Ventilateur de l’unité intérieure remplacé.'
  },
  {
    title: 'Infiltration au plafond après la pluie',
    category: 'OTHER',
    priority: 'HIGH',
    ago: 8,
    status: 'RESOLVED',
    text: 'Une tache d’humidité grandit au plafond de la chambre.',
    resolution: 'Étanchéité de la terrasse reprise par l’entreprise.'
  },
  {
    title: 'Robinet de la salle de bain qui goutte',
    category: 'PLUMBING',
    priority: 'LOW',
    ago: 5,
    status: 'RESOLVED',
    text: 'Le mitigeur goutte malgré la fermeture.',
    resolution: 'Cartouche du mitigeur remplacée.'
  },
  {
    title: 'Panne de courant dans la cuisine',
    category: 'ELECTRICITY',
    priority: 'HIGH',
    ago: 3,
    status: 'ASSIGNED',
    text: 'Plus aucune prise ne fonctionne dans la cuisine.'
  },
  {
    title: 'Climatiseur du bureau en panne',
    category: 'AC',
    priority: 'MEDIUM',
    ago: 1,
    agoDays: 10,
    status: 'IN_PROGRESS',
    text: 'L’unité ne démarre plus, le voyant clignote.'
  },
  {
    title: 'Fuite de la chasse d’eau des WC',
    category: 'PLUMBING',
    priority: 'MEDIUM',
    ago: 0,
    agoDays: 6,
    status: 'DECLARED',
    text: 'La chasse d’eau coule en permanence.'
  },
  {
    title: 'Serrure du portail à changer',
    category: 'OTHER',
    priority: 'URGENT',
    ago: 0,
    agoDays: 2,
    status: 'DECLARED',
    text: 'La clé est cassée dans la serrure du portail, impossible de fermer.'
  }
];

const NEXT_STATUS: Record<string, string[]> = {
  DECLARED: ['DECLARED'],
  IN_PROGRESS: ['DECLARED', 'IN_PROGRESS'],
  ASSIGNED: ['DECLARED', 'IN_PROGRESS', 'ASSIGNED'],
  RESOLVED: ['DECLARED', 'IN_PROGRESS', 'ASSIGNED', 'RESOLVED'],
  CANCELED: ['DECLARED', 'CANCELED']
};

export async function seedTickets(s: PatState): Promise<void> {
  const { prisma, tenantId, end, log, rng } = s.ctx;
  if ((await prisma.maintenanceTicket.count({ where: { tenant_id: tenantId } })) > 0) return;
  let vendors = await prisma.maintenanceVendor.findMany({ where: { tenant_id: tenantId }, select: { id: true } });
  if (vendors.length === 0) {
    for (const name of ['Plomberie Moderne d’Abobo', 'Élec-Habitat Cocody', 'Froid Service CI']) {
      await prisma.maintenanceVendor.create({
        data: { tenant_id: tenantId, name, phone: '+225 07 08 09 10 11', address: 'Abidjan', specialties: ['general'] }
      });
    }
    vendors = await prisma.maintenanceVendor.findMany({ where: { tenant_id: tenantId }, select: { id: true } });
  }
  const active = s.leases.filter(l => l.status === 'ACTIVE');
  let comments = 0;
  let attachments = 0;
  for (const [i, def] of TICKETS.entries()) {
    const l =
      def.status === 'RESOLVED' || def.status === 'CANCELED'
        ? s.leases[i % s.leases.length]
        : active[i % active.length];
    const declared = def.agoDays ? addDays(end, -def.agoDays) : atDay(monthsAgo(end, def.ago), between(rng, 3, 24));
    if (
      declared.getTime() < l.start.getTime() ||
      (l.status === 'ENDED' && l.moveOut && declared.getTime() > l.moveOut.getTime())
    )
      continue;
    const path = NEXT_STATUS[def.status];
    const at = (n: number): Date => new Date(Math.min(end.getTime(), addDays(declared, n * 2).getTime()));
    const vendor = vendors[i % vendors.length];
    const assigned = path.includes('ASSIGNED');
    const id = randomUUID();
    await prisma.maintenanceTicket.create({
      data: {
        id,
        tenant_id: tenantId,
        property_id: l.propertyId,
        lease_id: l.id,
        created_by_user_id: l.userId,
        title: def.title,
        category: def.category,
        priority: def.priority,
        description: def.text,
        location_details: pick(rng, ['Cuisine', 'Salon', 'Salle de bain', 'Chambre principale', 'Entrée', 'Terrasse']),
        status: def.status,
        assigned_vendor_id: assigned ? vendor.id : null,
        assigned_to_user_id: path.length > 1 ? author(s) : null,
        resolution_notes: def.resolution ?? null,
        declared_at: declared,
        in_progress_at: path.includes('IN_PROGRESS') ? at(1) : null,
        assigned_at: assigned ? at(2) : null,
        resolved_at: def.status === 'RESOLVED' ? at(3) : null,
        canceled_at: def.status === 'CANCELED' ? at(1) : null,
        created_at: declared
      }
    });
    await prisma.maintenanceTicketStatusHistory.createMany({
      data: path.map((status, n) => ({
        tenant_id: tenantId,
        ticket_id: id,
        from_status: n === 0 ? null : (path[n - 1] as 'DECLARED'),
        to_status: status as 'DECLARED',
        note: n === 0 ? 'Ticket déclaré par le locataire depuis son portail.' : null,
        changed_by_user_id: n === 0 ? l.userId : author(s),
        changed_at: n === 0 ? declared : at(n)
      }))
    });
    const commentRows: Prisma.MaintenanceTicketCommentUncheckedCreateInput[] = [
      {
        tenant_id: tenantId,
        ticket_id: id,
        author_type: 'TENANT',
        content: def.text,
        author_user_id: l.userId,
        created_at: declared
      }
    ];
    if (path.length > 1) {
      commentRows.push({
        tenant_id: tenantId,
        ticket_id: id,
        author_type: 'MANAGER',
        content:
          def.status === 'CANCELED'
            ? 'Bien reçu, merci de nous prévenir si le problème revient.'
            : 'Demande prise en compte : nous organisons l’intervention dans les meilleurs délais.',
        author_user_id: author(s),
        created_at: at(1)
      });
      commentRows.push({
        tenant_id: tenantId,
        ticket_id: id,
        author_type: 'SYSTEM',
        content: `Statut passé à « ${path[path.length - 1]} ».`,
        created_at: at(path.length - 1)
      });
    }
    if (def.status === 'RESOLVED') {
      commentRows.push({
        tenant_id: tenantId,
        ticket_id: id,
        author_type: 'TENANT',
        content: 'Merci, tout fonctionne de nouveau.',
        author_user_id: l.userId,
        created_at: at(4)
      });
    }
    await prisma.maintenanceTicketComment.createMany({ data: commentRows });
    comments += commentRows.length;
    if (i % 3 !== 2) {
      const scene: SceneKind =
        def.category === 'PLUMBING'
          ? 'bathroom'
          : def.category === 'AC'
            ? 'room'
            : def.title.includes('Infiltration')
              ? 'stain'
              : 'kitchen';
      const png = sceneImage(scene, i);
      const f = await writeUpload(['maintenance', tenantId, id], `photo-${i + 1}.png`, png);
      await prisma.maintenanceTicketAttachment.create({
        data: {
          tenant_id: tenantId,
          ticket_id: id,
          file_url: f.fileUrl,
          file_name: `photo-${i + 1}.png`,
          mime_type: 'image/png',
          file_size: f.fileSize,
          uploaded_by_user_id: l.userId,
          created_at: declared
        }
      });
      attachments += 1;
    }
  }
  log(
    `patrimoine-extras : ${TICKETS.length} ticket(s) de maintenance, ${comments} commentaire(s), ${attachments} pièce(s) jointe(s).`
  );
}

// ------------------------------------------------------------------ liens de paiement des loyers

export async function seedPaymentLinks(s: PatState): Promise<void> {
  const { prisma, tenantId, end, log } = s.ctx;
  if ((await prisma.secureLink.count({ where: { tenantId, scope: 'INSTALLMENT_PAYMENT' } })) > 0) return;
  const open = await prisma.rentalInstallment.findMany({
    where: { tenant_id: tenantId, status: { in: ['DUE', 'OVERDUE', 'PARTIAL'] } },
    orderBy: { due_date: 'desc' },
    select: { id: true, due_date: true, status: true }
  });
  const rows: Prisma.SecureLinkUncheckedCreateInput[] = [];
  open.forEach((inst, i) => {
    const sent = addDays(inst.due_date, inst.status === 'DUE' ? 1 : 3);
    const created = sent.getTime() > end.getTime() ? addDays(end, -1) : sent;
    rows.push({
      tenantId,
      scope: 'INSTALLMENT_PAYMENT',
      objectType: 'RentalInstallment',
      objectId: inst.id,
      tokenHash: sha256(Buffer.from(`pack-history:${tenantId}:link:${inst.id}`)),
      expiresAt: addDays(created, 14),
      createdByUserId: author(s),
      viewCount: inst.status === 'OVERDUE' ? 3 : i % 2,
      lastViewedAt: inst.status === 'OVERDUE' ? addDays(end, -1) : null,
      createdAt: created
    });
  });
  // Un lien expiré, jamais utilisé : le locataire a payé autrement.
  const paid = await prisma.rentalInstallment.findFirst({
    where: { tenant_id: tenantId, status: 'PAID' },
    orderBy: { due_date: 'desc' },
    skip: 6,
    select: { id: true, due_date: true }
  });
  if (paid) {
    rows.push({
      tenantId,
      scope: 'INSTALLMENT_PAYMENT',
      objectType: 'RentalInstallment',
      objectId: paid.id,
      tokenHash: sha256(Buffer.from(`pack-history:${tenantId}:link:${paid.id}`)),
      expiresAt: addDays(paid.due_date, 14),
      createdByUserId: author(s),
      viewCount: 2,
      lastViewedAt: addDays(paid.due_date, 4),
      createdAt: addDays(paid.due_date, 2)
    });
  }
  await prisma.secureLink.createMany({ data: rows });
  log(`patrimoine-extras : ${rows.length} lien(s) de paiement de loyer.`);
}
