/**
 * Documents locatifs et incidents des baux des biens PROPRES de l'agence.
 *
 * Le complément locatif n'a écrit les documents (contrat, reçu de dépôt, reçus et
 * quittances, mises en demeure, avis d'échéance, relevé, avenant) que pour les baux
 * qui existaient alors : les baux ajoutés ensuite sur les biens propres n'avaient aucun
 * document, donc des portails locataires vides. Ce bloc réutilise ses gabarits et son
 * écriture de fichiers Word réels (`assets/generated_documents/...`), numérote à la suite
 * des compteurs existants et reste idempotent par bail (un bail qui porte déjà un contrat
 * est sauté). Il ajoute aussi des incidents de maintenance aux locataires de démonstration
 * dont le portail n'en montrait aucun.
 */
import { DocumentType, LeaseEventType, Prisma, RentalDocumentStatus, RentalDocumentType } from '@prisma/client';
import { runWithTenantContext } from '../../../src/utils/tenant-context';
import { between, pick } from './types';
import { TICKET_TEMPLATES } from './agence-data';
import { contractLines, partiesLines, receiptLines, TYPE_DIR } from './agence-locatif-documents';
import { DOCX_MIME, saveRentalDocx } from './agence-locatif-files';
import { dateFr, fcfa, loadBase, moisFr, noonUtc, pickOne, plusDays, ym } from './agence-locatif-base';
import type { LeaseRow } from './agence-locatif-base';
import type { OwnState } from './agence-patrimoine-state';

const METHOD_LABEL: Record<string, string> = {
  CASH: 'espèces',
  BANK_TRANSFER: 'virement bancaire',
  CHECK: 'chèque',
  MOBILE_MONEY: 'Mobile Money',
  CARD: 'carte bancaire',
  OTHER: 'autre moyen'
};

export async function seedOwnLeaseDocuments(o: OwnState): Promise<void> {
  const { ctx } = o;
  const { prisma, tenantId, rng, end, log } = ctx;
  const base = await loadBase(ctx);
  const ownIds = new Set(o.own.map(p => p.id));
  const done = new Set(
    (
      await prisma.rentalDocument.findMany({
        where: { tenant_id: tenantId, type: 'LEASE_CONTRACT' },
        select: { lease_id: true }
      })
    ).map(d => d.lease_id)
  );
  const leases: LeaseRow[] = base.leases
    .filter(l => ownIds.has(l.propertyId) && !done.has(l.id))
    .map(l => ({ ...l, ownerName: 'L’agence, propriétaire du bien' }));
  if (leases.length === 0) {
    log('documents des baux propres : tous les baux ont déjà leurs documents, bloc sauté.');
    return;
  }
  const leaseById = new Map(leases.map(l => [l.id, l]));
  const leaseIds = leases.map(l => l.id);

  // Numérotation : à la suite de ce qui existe (compteurs du produit).
  const counters = new Map<string, number>();
  const nextSeq = async (prefix: string, at: Date): Promise<string> => {
    const key = `${prefix}-${ym(at).replace('-', '')}`;
    if (!counters.has(key)) {
      const last = await prisma.rentalDocument.findMany({
        where: { tenant_id: tenantId, document_number: { startsWith: `${key}-` } },
        select: { document_number: true }
      });
      counters.set(
        key,
        last.reduce((m, d) => Math.max(m, Number.parseInt(d.document_number.slice(key.length + 1), 10) || 0), 0)
      );
    }
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    return `${key}-${String(n).padStart(4, '0')}`;
  };
  const counts: Record<string, number> = {};

  async function put(p: {
    type: RentalDocumentType;
    status?: RentalDocumentStatus;
    number: string;
    issuedAt: Date;
    title: string;
    description?: string;
    lines: string[];
    leaseId: string;
    installmentId?: string | null;
    paymentId?: string | null;
    metadata?: Record<string, unknown>;
    revision?: number;
    supersededById?: string | null;
  }): Promise<string> {
    const staff = pickOne(rng, base.signers);
    const file = await saveRentalDocx({
      tenantId,
      typeDir: TYPE_DIR[p.type],
      issuedAt: p.issuedAt,
      number: p.number,
      keyPart: p.leaseId ?? p.paymentId ?? p.installmentId ?? 'doc',
      title: p.title,
      lines: p.lines
    });
    const row = await prisma.rentalDocument.create({
      data: {
        tenant_id: tenantId,
        type: p.type,
        status: p.status ?? RentalDocumentStatus.FINAL,
        lease_id: p.leaseId,
        installment_id: p.installmentId ?? null,
        payment_id: p.paymentId ?? null,
        document_number: p.number,
        file_path: file.filePath,
        file_hash: file.fileHash,
        content_hash: file.fileHash,
        mime_type: DOCX_MIME,
        issued_at: p.issuedAt,
        title: p.title,
        description: p.description ?? null,
        metadata: (p.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        revision: p.revision ?? 1,
        superseded_by_id: p.supersededById ?? null,
        created_by_user_id: staff.id,
        created_at: p.issuedAt,
        updated_at: p.issuedAt
      },
      select: { id: true }
    });
    const k = p.type + (p.status && p.status !== 'FINAL' ? `/${p.status}` : '');
    counts[k] = (counts[k] ?? 0) + 1;
    return row.id;
  }

  // Contrats : un par bail ; un bail en brouillon porte un contrat en brouillon.
  for (const lease of leases) {
    await put({
      type: RentalDocumentType.LEASE_CONTRACT,
      status: lease.status === 'DRAFT' ? RentalDocumentStatus.DRAFT : RentalDocumentStatus.FINAL,
      number: lease.number,
      issuedAt: noonUtc(lease.status === 'DRAFT' ? plusDays(end, -6) : plusDays(lease.start, -7)),
      title: `Contrat de bail — ${lease.number}`,
      description: `Contrat de location de ${lease.propertyTitle}.`,
      lines: contractLines(lease),
      leaseId: lease.id,
      metadata: { leaseNumber: lease.number }
    });
  }

  // Reçus de dépôt de garantie.
  const deposits = await prisma.rentalDepositMovement.findMany({
    where: { tenant_id: tenantId, type: 'COLLECT', deposit: { lease_id: { in: leaseIds } } },
    select: { payment_id: true, amount: true, created_at: true, deposit: { select: { lease_id: true } } }
  });
  const depositPaymentIds = new Set<string>();
  for (const d of deposits) {
    const lease = leaseById.get(d.deposit.lease_id);
    if (!lease) continue;
    if (d.payment_id) depositPaymentIds.add(d.payment_id);
    const at = noonUtc(d.created_at);
    const number = await nextSeq('DEP', at);
    await put({
      type: RentalDocumentType.DEPOSIT_RECEIPT,
      number,
      issuedAt: at,
      title: `Reçu de dépôt de garantie — ${lease.number}`,
      lines: [
        `Reçu n° ${number}`,
        '',
        `Reçu de ${lease.renterName} la somme de ${fcfa(Number(d.amount))} à titre de dépôt de garantie.`,
        `Bail ${lease.number} — ${lease.propertyTitle}.`,
        'Cette somme sera restituée à la sortie des lieux, déduction faite des éventuelles dégradations constatées.'
      ],
      leaseId: lease.id,
      paymentId: d.payment_id,
      metadata: { amount: Number(d.amount) }
    });
  }

  // Avenants de renouvellement (bail renouvelé avec le même locataire : le bail précédent est terminé).
  const byProperty = new Map<string, LeaseRow[]>();
  for (const l of base.leases.filter(x => ownIds.has(x.propertyId))) {
    byProperty.set(l.propertyId, [...(byProperty.get(l.propertyId) ?? []), l]);
  }
  for (const group of byProperty.values()) {
    const sorted = [...group].sort((a, b) => a.start.getTime() - b.start.getTime());
    for (let i = 1; i < sorted.length; i++) {
      const cur = sorted[i];
      const prev = sorted[i - 1];
      if (!leaseById.has(cur.id) || prev.renterId !== cur.renterId || cur.status === 'DRAFT') continue;
      await put({
        type: RentalDocumentType.LEASE_ADDENDUM,
        number: `${cur.number}-AV1`,
        issuedAt: noonUtc(plusDays(cur.start, -5)),
        title: `Avenant de renouvellement — ${cur.number}`,
        lines: [
          `Avenant au bail ${prev.number}`,
          `Prenant effet le ${dateFr(cur.start)}.`,
          '',
          ...partiesLines(cur),
          '',
          '# Objet',
          'Renouvellement du bail avec revalorisation du loyer.',
          cur.end ? `Nouvelle date de fin de bail : ${dateFr(cur.end)}.` : '',
          `Loyer applicable : ${fcfa(cur.rent)}.`,
          '',
          'Les autres clauses du bail initial demeurent inchangées.'
        ].filter(Boolean),
        leaseId: cur.id,
        metadata: { eventType: LeaseEventType.RENEWAL }
      });
    }
  }

  // Reçus de loyer (12 derniers mois) : un reçu corrigé (révision remplacée) et un reçu annulé sur l'ensemble.
  const payments = await prisma.rentalPayment.findMany({
    where: { tenant_id: tenantId, status: 'SUCCESS', lease_id: { in: leaseIds } },
    orderBy: { initiated_at: 'asc' },
    select: {
      id: true,
      lease_id: true,
      amount: true,
      method: true,
      succeeded_at: true,
      initiated_at: true,
      psp_reference: true,
      allocations: {
        select: { installment_id: true, installment: { select: { period_year: true, period_month: true } } },
        take: 1
      }
    }
  });
  const since = plusDays(end, -365);
  const candidates = payments.filter(
    p => !depositPaymentIds.has(p.id) && p.allocations.length > 0 && (p.succeeded_at ?? p.initiated_at) >= since
  );
  let pairs = 0;
  let voids = 0;
  for (const [idx, p] of candidates.entries()) {
    const lease = leaseById.get(p.lease_id as string);
    if (!lease) continue;
    const paidAt = noonUtc(p.succeeded_at ?? p.initiated_at);
    const alloc = p.allocations[0];
    const period = `${moisFr(alloc.installment.period_month)} ${alloc.installment.period_year}`;
    const number = await nextSeq('RCU', paidAt);
    const common = {
      type: RentalDocumentType.RENT_RECEIPT,
      issuedAt: paidAt,
      leaseId: lease.id,
      installmentId: alloc.installment_id,
      paymentId: p.id
    };
    const lines = receiptLines(
      lease,
      number,
      paidAt,
      Number(p.amount),
      METHOD_LABEL[p.method] ?? 'autre moyen',
      `loyer de ${period}`,
      p.psp_reference
    );
    const meta = { period, amount: Number(p.amount) };
    if (pairs < 1 && idx === 20 % Math.max(1, candidates.length)) {
      const replacement = await put({
        ...common,
        number: `${number}-R2`,
        title: `Reçu de loyer — ${period} (révision 2)`,
        lines: [...lines, 'Reçu corrigé : remplace la révision 1 (référence du règlement rectifiée).'],
        revision: 2,
        metadata: meta
      });
      await put({
        ...common,
        status: RentalDocumentStatus.SUPERSEDED,
        number,
        title: `Reçu de loyer — ${period}`,
        lines,
        supersededById: replacement,
        metadata: meta
      });
      pairs += 1;
      continue;
    }
    if (voids < 1 && idx === 11 % Math.max(1, candidates.length)) {
      await put({
        ...common,
        status: RentalDocumentStatus.VOID,
        number,
        title: `Reçu de loyer — ${period} (annulé)`,
        description: 'Reçu annulé : émis en double sur le même règlement.',
        lines: [...lines, 'ANNULÉ : émis en double.'],
        metadata: meta
      });
      voids += 1;
      continue;
    }
    await put({ ...common, number, title: `Reçu de loyer — ${period}`, lines, metadata: meta });
  }

  // Quittances des quatre derniers mois.
  const recentPaid = await prisma.rentalInstallment.findMany({
    where: { tenant_id: tenantId, lease_id: { in: leaseIds }, status: 'PAID', paid_at: { gte: plusDays(end, -120) } },
    orderBy: { paid_at: 'asc' },
    select: { id: true, lease_id: true, period_year: true, period_month: true, paid_at: true, amount_paid: true }
  });
  for (const inst of recentPaid) {
    const lease = leaseById.get(inst.lease_id);
    if (!lease || !inst.paid_at) continue;
    const at = noonUtc(inst.paid_at);
    const number = await nextSeq('QUI', at);
    const period = `${moisFr(inst.period_month)} ${inst.period_year}`;
    await put({
      type: RentalDocumentType.RENT_QUITTANCE,
      number,
      issuedAt: at,
      title: `Quittance de loyer — ${period}`,
      lines: [
        `Quittance n° ${number}`,
        '',
        `Je soussigné, gestionnaire du bien ${lease.propertyTitle}, reconnais avoir reçu de ${lease.renterName} la somme de ${fcfa(
          Number(inst.amount_paid)
        )} au titre du loyer et des charges de ${period}, et lui en donne quittance, sous réserve de tous mes droits.`,
        `Bail ${lease.number}.`,
        `Fait à Abidjan, le ${dateFr(at)}.`
      ],
      leaseId: lease.id,
      installmentId: inst.id,
      metadata: { period, amount: Number(inst.amount_paid) }
    });
  }

  // Impayés : mises en demeure.
  const unpaid = await prisma.rentalInstallment.findMany({
    where: { tenant_id: tenantId, lease_id: { in: leaseIds }, status: { in: ['OVERDUE', 'PARTIAL'] } },
    orderBy: { due_date: 'asc' },
    select: {
      id: true,
      lease_id: true,
      period_year: true,
      period_month: true,
      due_date: true,
      amount_rent: true,
      amount_service: true,
      penalty_amount: true,
      amount_paid: true
    }
  });
  for (const inst of unpaid) {
    const lease = leaseById.get(inst.lease_id);
    if (!lease) continue;
    const at = noonUtc(new Date(Math.min(end.getTime(), plusDays(inst.due_date, 20).getTime())));
    if (at.getTime() <= inst.due_date.getTime()) continue;
    const due =
      Number(inst.amount_rent) + Number(inst.amount_service) + Number(inst.penalty_amount) - Number(inst.amount_paid);
    const number = await nextSeq('MED', at);
    const period = `${moisFr(inst.period_month)} ${inst.period_year}`;
    await put({
      type: RentalDocumentType.OTHER,
      number,
      issuedAt: at,
      title: `Mise en demeure de payer — loyer de ${period}`,
      lines: [
        `Mise en demeure n° ${number}`,
        `Abidjan, le ${dateFr(at)}`,
        '',
        `À l’attention de ${lease.renterName}, locataire de ${lease.propertyTitle} (bail ${lease.number}).`,
        '',
        `Le loyer de ${period}, échu le ${dateFr(inst.due_date)}, reste impayé à hauteur de ${fcfa(Math.max(0, due))}.`,
        'Nous vous mettons en demeure de régler cette somme sous huit jours à compter de la réception du présent courrier, faute de quoi nous engagerons les poursuites prévues au bail.',
        '',
        'Nous restons à votre disposition pour convenir d’un échéancier si votre situation le justifie.'
      ],
      leaseId: lease.id,
      installmentId: inst.id,
      metadata: { kind: 'MISE_EN_DEMEURE', amountDue: Math.max(0, due) }
    });
  }

  // Échéances à venir : avis d'échéance.
  const upcoming = await prisma.rentalInstallment.findMany({
    where: {
      tenant_id: tenantId,
      lease_id: { in: leaseIds },
      status: { in: ['DRAFT', 'DUE'] },
      due_date: { gt: end, lte: plusDays(end, 40) },
      lease: { status: 'ACTIVE' }
    },
    orderBy: { due_date: 'asc' },
    select: {
      id: true,
      lease_id: true,
      period_year: true,
      period_month: true,
      due_date: true,
      amount_rent: true,
      amount_service: true
    }
  });
  for (const inst of upcoming) {
    const lease = leaseById.get(inst.lease_id);
    if (!lease) continue;
    const at = noonUtc(new Date(Math.min(end.getTime(), plusDays(inst.due_date, -10).getTime())));
    const total = Number(inst.amount_rent) + Number(inst.amount_service);
    const number = await nextSeq('AVE', at);
    const period = `${moisFr(inst.period_month)} ${inst.period_year}`;
    await put({
      type: RentalDocumentType.OTHER,
      number,
      issuedAt: at,
      title: `Avis d’échéance — ${period}`,
      lines: [
        `Avis d’échéance n° ${number}`,
        '',
        `${lease.renterName}, nous vous rappelons que votre loyer de ${period} sera exigible le ${dateFr(inst.due_date)}.`,
        `Loyer : ${fcfa(Number(inst.amount_rent))} — Charges : ${fcfa(Number(inst.amount_service))} — Total : ${fcfa(total)}.`,
        `Bail ${lease.number} — ${lease.propertyTitle}.`
      ],
      leaseId: lease.id,
      installmentId: inst.id,
      metadata: { kind: 'AVIS_ECHEANCE', amount: total }
    });
  }

  // Relevé de loyers (baux en cours ou suspendus).
  for (const lease of leases.filter(l => l.status === 'ACTIVE' || l.status === 'SUSPENDED')) {
    const recent = await prisma.rentalInstallment.findMany({
      where: { tenant_id: tenantId, lease_id: lease.id, due_date: { lte: end } },
      orderBy: { due_date: 'desc' },
      take: 4,
      select: {
        period_month: true,
        period_year: true,
        status: true,
        amount_rent: true,
        amount_service: true,
        penalty_amount: true,
        amount_paid: true
      }
    });
    if (recent.length === 0) continue;
    const at = noonUtc(plusDays(end, -2));
    const number = await nextSeq('RLV', at);
    await put({
      type: RentalDocumentType.STATEMENT,
      number,
      issuedAt: at,
      title: `Relevé de loyers — ${lease.number}`,
      lines: [
        `Relevé n° ${number} — situation au ${dateFr(at)}`,
        `Locataire : ${lease.renterName} — ${lease.propertyTitle}.`,
        '',
        '# Dernières échéances',
        ...recent.map(r => {
          const total = Number(r.amount_rent) + Number(r.amount_service) + Number(r.penalty_amount);
          return `${moisFr(r.period_month)} ${r.period_year} : ${fcfa(total)} dû, ${fcfa(Number(r.amount_paid))} réglé (${r.status === 'PAID' ? 'soldé' : r.status === 'PARTIAL' ? 'partiel' : r.status === 'OVERDUE' ? 'en retard' : 'à venir'}).`;
        })
      ],
      leaseId: lease.id,
      metadata: { kind: 'RELEVE_LOYERS' }
    });
  }

  // Compteurs de numérotation alignés (jamais en arrière).
  for (const [key, last] of counters) {
    const [prefix, yyyymm] = key.split('-');
    const docType =
      prefix === 'RCU' ? DocumentType.RENT_RECEIPT : prefix === 'RLV' ? DocumentType.RENT_STATEMENT : null;
    if (!docType) continue;
    const periodKey = `${yyyymm.slice(0, 4)}-${yyyymm.slice(4)}`;
    const where = { tenant_id_doc_type_period_key: { tenant_id: tenantId, doc_type: docType, period_key: periodKey } };
    const current = await prisma.documentCounter.findUnique({ where });
    if (!current) {
      await prisma.documentCounter.create({
        data: { tenant_id: tenantId, doc_type: docType, period_key: periodKey, last_number: last }
      });
    } else if (current.last_number < last) {
      await prisma.documentCounter.update({ where, data: { last_number: last } });
    }
  }
  log(
    `documents des baux propres : ${leases.length} bail(s) documenté(s) — ${Object.entries(counts)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ')}.`
  );
}

// ------------------------------------------------------------------ incidents des locataires de démonstration

const CATEGORY_SPECIALTY: Record<string, readonly string[]> = {
  PLUMBING: ['plumbing', 'water_heater'],
  ELECTRICITY: ['electricity'],
  AC: ['ac', 'refrigeration'],
  OTHER: ['other', 'painting']
};

export const DEMO_NOTE = 'Signalé depuis le portail locataire (locataire de démonstration).';

export async function seedDemoRenterTickets(o: OwnState): Promise<void> {
  const { ctx } = o;
  const { prisma, tenantId, end, log } = ctx;
  if ((await prisma.maintenanceTicketStatusHistory.count({ where: { tenant_id: tenantId, note: DEMO_NOTE } })) > 0) {
    log('incidents de démonstration : déjà présents, bloc sauté.');
    return;
  }
  const clients = await prisma.tenantClient.findMany({
    where: { tenantId, clientType: 'RENTER', ownerPortalEnabled: true },
    select: { id: true, details: true },
    orderBy: { createdAt: 'asc' }
  });
  const vendors = await prisma.maintenanceVendor.findMany({ where: { tenant_id: tenantId, is_active: true } });
  const staff = o.staff;
  let created = 0;
  let renters = 0;
  await runWithTenantContext({ tenantId, userId: ctx.adminUserId }, async () => {
    for (const c of clients) {
      if (renters >= 4) break;
      const lease = await prisma.rentalLease.findFirst({
        where: { tenant_id: tenantId, primary_renter_client_id: c.id, status: 'ACTIVE' },
        orderBy: { start_date: 'asc' },
        select: { id: true, property_id: true, start_date: true }
      });
      const contactId = (c.details as { crmContactId?: string } | null)?.crmContactId;
      if (!lease || !contactId) continue;
      const has = await prisma.maintenanceTicket.count({
        where: { tenant_id: tenantId, OR: [{ lease_id: lease.id }, { tenant_contact_id: contactId }] }
      });
      if (has > 0) continue;
      renters += 1;
      const rng = ctx.rng;
      // Un incident résolu il y a quelques mois, un autre récent et encore ouvert.
      const plans: Array<{ ago: number; status: 'RESOLVED' | 'IN_PROGRESS' | 'ASSIGNED' | 'DECLARED' }> = [
        { ago: between(rng, 50, 110), status: 'RESOLVED' },
        { ago: between(rng, 2, 9), status: pick(rng, ['IN_PROGRESS', 'ASSIGNED', 'DECLARED'] as const) }
      ];
      for (const plan of plans) {
        const declared = new Date(end.getTime() - plan.ago * 86_400_000);
        if (declared.getTime() < lease.start_date.getTime() + 7 * 86_400_000) continue;
        const tpl = pick(rng, TICKET_TEMPLATES);
        const manager = pick(rng, staff);
        const wanted = CATEGORY_SPECIALTY[tpl.category] ?? [];
        const matching = vendors.filter(v => v.specialties.some(s => wanted.includes(s)));
        const vendor =
          plan.status === 'ASSIGNED' || plan.status === 'RESOLVED'
            ? pick(rng, matching.length > 0 ? matching : vendors)
            : null;
        const inProgressAt = plan.status !== 'DECLARED' ? new Date(declared.getTime() + 26 * 3_600_000) : null;
        const assignedAt = vendor ? new Date(declared.getTime() + 2 * 86_400_000) : null;
        const resolvedAt =
          plan.status === 'RESOLVED' ? new Date(declared.getTime() + between(rng, 3, 12) * 86_400_000) : null;
        const ticket = await prisma.maintenanceTicket.create({
          data: {
            tenant_id: tenantId,
            property_id: lease.property_id,
            lease_id: lease.id,
            tenant_contact_id: contactId,
            created_by_contact_id: contactId,
            title: tpl.title,
            category: tpl.category,
            priority: tpl.priority,
            description: tpl.description,
            location_details: tpl.location,
            status: plan.status,
            assigned_vendor_id: vendor?.id ?? null,
            assigned_to_user_id: plan.status === 'DECLARED' ? null : manager,
            resolution_notes: resolvedAt ? tpl.resolution : null,
            declared_at: declared,
            in_progress_at: inProgressAt,
            assigned_at: assignedAt,
            resolved_at: resolvedAt,
            created_at: declared
          },
          select: { id: true }
        });
        const steps: Array<{ from: string | null; to: string; at: Date; note: string }> = [
          { from: null, to: 'DECLARED', at: declared, note: DEMO_NOTE }
        ];
        if (inProgressAt)
          steps.push({ from: 'DECLARED', to: 'IN_PROGRESS', at: inProgressAt, note: 'Pris en charge par l’agence.' });
        if (assignedAt)
          steps.push({ from: 'IN_PROGRESS', to: 'ASSIGNED', at: assignedAt, note: 'Prestataire mandaté.' });
        if (resolvedAt) steps.push({ from: 'ASSIGNED', to: 'RESOLVED', at: resolvedAt, note: tpl.resolution });
        for (const s of steps) {
          await prisma.maintenanceTicketStatusHistory.create({
            data: {
              tenant_id: tenantId,
              ticket_id: ticket.id,
              from_status: s.from as never,
              to_status: s.to as never,
              note: s.note,
              changed_by_user_id: s.from === null ? null : manager,
              changed_at: s.at
            }
          });
        }
        const comments: Array<{ author: 'TENANT' | 'MANAGER'; text: string; at: Date }> = [
          { author: 'TENANT', text: tpl.description, at: declared }
        ];
        if (inProgressAt) comments.push({ author: 'MANAGER', text: tpl.managerReply, at: inProgressAt });
        if (resolvedAt) {
          comments.push({ author: 'MANAGER', text: `Intervention terminée : ${tpl.resolution}`, at: resolvedAt });
          comments.push({
            author: 'TENANT',
            text: 'Merci, tout est rentré dans l’ordre.',
            at: new Date(resolvedAt.getTime() + 4 * 3_600_000)
          });
        }
        for (const cm of comments) {
          await prisma.maintenanceTicketComment.create({
            data: {
              tenant_id: tenantId,
              ticket_id: ticket.id,
              author_type: cm.author,
              content: cm.text,
              author_user_id: cm.author === 'MANAGER' ? manager : null,
              author_contact_id: cm.author === 'TENANT' ? contactId : null,
              created_at: cm.at
            }
          });
        }
        created += 1;
      }
    }
  });
  log(`incidents de démonstration : ${created} ticket(s) pour ${renters} locataire(s) de portail sans incident.`);
}
