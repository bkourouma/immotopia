/**
 * Documents locatifs de l'agence : contrats de bail, avenants, reçus de dépôt de
 * garantie, reçus et quittances de loyer, avis d'échéance, mises en demeure et
 * relevés. Chaque ligne `RentalDocument` pointe un vrai fichier Word écrit au
 * chemin attendu par le service de téléchargement (voir `agence-locatif-files.ts`).
 *
 * Numérotation : celle du produit (`RCU-AAAAMM-NNNN` pour les reçus, numéro du
 * bail pour le contrat) ; les compteurs `document_counters` sont alignés pour que
 * la prochaine génération réelle ne collisionne pas.
 */
import { DocumentType, LeaseEventType, Prisma, RentalDocumentStatus, RentalDocumentType } from '@prisma/client';
import { DOCX_MIME, saveRentalDocx } from './agence-locatif-files';
import { dateFr, fcfa, moisFr, noonUtc, pickOne, plusDays, ym } from './agence-locatif-base';
import type { LeaseRow, LocatifBase } from './agence-locatif-base';

const TYPE_DIR: Record<RentalDocumentType, string> = {
  LEASE_CONTRACT: 'LEASE_CONTRACT',
  LEASE_ADDENDUM: 'LEASE_ADDENDUM',
  RENT_RECEIPT: 'RENT_RECEIPT',
  RENT_QUITTANCE: 'RENT_QUITTANCE',
  DEPOSIT_RECEIPT: 'DEPOSIT_RECEIPT',
  STATEMENT: 'RENT_STATEMENT',
  OTHER: 'OTHER'
};

const COMMERCIAL = ['BUREAU', 'BOUTIQUE_COMMERCIAL', 'ENTREPOT_INDUSTRIEL'];

function partiesLines(lease: LeaseRow): string[] {
  return [
    '# Parties',
    `Le bailleur : ${lease.ownerName ?? 'Propriétaire du bien'}, représenté par l’agence gestionnaire (mandat de gestion).`,
    `Le preneur : ${lease.renterName}.`,
    '',
    '# Bien loué',
    `${lease.propertyTitle} — ${lease.propertyAddress}.`
  ];
}

function contractLines(lease: LeaseRow): string[] {
  const commercial = COMMERCIAL.includes(lease.propertyType);
  const period = lease.billing === 'QUARTERLY' ? 'par trimestre' : 'par mois';
  return [
    `Référence : ${lease.number}`,
    `Établi à Abidjan, le ${dateFr(plusDays(lease.start, -7))}.`,
    '',
    ...partiesLines(lease),
    '',
    '# Durée',
    `Le présent bail ${commercial ? 'commercial' : 'à usage d’habitation'} est conclu du ${dateFr(lease.start)} ${
      lease.end ? `au ${dateFr(lease.end)}` : 'pour une durée indéterminée'
    }.`,
    '',
    '# Conditions financières',
    `Loyer ${period} : ${fcfa(lease.rent)}.`,
    `Provision pour charges ${period} : ${fcfa(lease.charges)}.`,
    `Dépôt de garantie : ${fcfa(lease.deposit)}, restitué à la sortie sous déduction des dégradations constatées.`,
    `Échéance : le ${lease.dueDay} de chaque période. Pénalité de retard : 5 % du solde après 5 jours de grâce, plafonnée à 250 000 F CFA.`,
    '',
    '# Obligations',
    'Le preneur use paisiblement des lieux, les entretient et souscrit une assurance couvrant les risques locatifs.',
    'Le bailleur délivre un logement décent et assure les grosses réparations.',
    '',
    'Gestion assurée par l’agence gestionnaire. Signatures précédées de la mention « lu et approuvé ».'
  ];
}

function receiptLines(
  lease: LeaseRow,
  number: string,
  paidAt: Date,
  amount: number,
  method: string,
  period: string,
  reference: string | null
): string[] {
  return [
    `Reçu n° ${number}`,
    `Date de règlement : ${dateFr(paidAt)}`,
    '',
    `Reçu de ${lease.renterName} la somme de ${fcfa(amount)} au titre de ${period}.`,
    `Bail ${lease.number} — ${lease.propertyTitle}.`,
    `Mode de règlement : ${method}${reference ? ` (réf. ${reference})` : ''}.`,
    '',
    'Ce reçu ne vaut quittance que pour les sommes effectivement encaissées.'
  ];
}

export async function seedRentalDocuments(base: LocatifBase): Promise<void> {
  const { ctx } = base;
  const { prisma, tenantId, rng, end, log } = ctx;

  if ((await prisma.rentalDocument.count({ where: { tenant_id: tenantId } })) > 0) {
    log('documents locatifs : déjà présents, bloc sauté.');
    return;
  }
  const counters = new Map<string, number>();
  const nextSeq = (prefix: string, at: Date): [number, string] => {
    const key = `${prefix}-${ym(at).replace('-', '')}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    return [n, `${key}-${String(n).padStart(4, '0')}`];
  };
  const counts: Record<string, number> = {};
  const bump = (type: string) => {
    counts[type] = (counts[type] ?? 0) + 1;
  };

  async function put(p: {
    type: RentalDocumentType;
    status?: RentalDocumentStatus;
    number: string;
    issuedAt: Date;
    title: string;
    description?: string;
    lines: string[];
    leaseId?: string | null;
    installmentId?: string | null;
    paymentId?: string | null;
    metadata?: Record<string, unknown>;
    revision?: number;
    supersededById?: string | null;
    voided?: boolean;
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
        lease_id: p.leaseId ?? null,
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
    bump(p.type + (p.status && p.status !== 'FINAL' ? `/${p.status}` : ''));
    return row.id;
  }

  // ── Contrats de bail : un par bail, au numéro du bail.
  for (const lease of base.leases) {
    await put({
      type: RentalDocumentType.LEASE_CONTRACT,
      number: lease.number,
      issuedAt: noonUtc(plusDays(lease.start, -7)),
      title: `Contrat de bail — ${lease.number}`,
      description: `Contrat de location de ${lease.propertyTitle}.`,
      lines: contractLines(lease),
      leaseId: lease.id,
      metadata: { leaseNumber: lease.number }
    });
  }

  // ── Reçus de dépôt de garantie.
  const deposits = await prisma.rentalDepositMovement.findMany({
    where: { tenant_id: tenantId, type: 'COLLECT' },
    select: { payment_id: true, amount: true, created_at: true, deposit: { select: { lease_id: true } } }
  });
  const depositPaymentIds = new Set<string>();
  for (const d of deposits) {
    const lease = base.leaseById.get(d.deposit.lease_id);
    if (!lease) continue;
    if (d.payment_id) depositPaymentIds.add(d.payment_id);
    const at = noonUtc(d.created_at);
    const [, number] = nextSeq('DEP', at);
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

  // ── Avenants (chronologie du bail) et renouvellements.
  const events = await prisma.leaseEvent.findMany({
    where: { tenantId, type: { in: [LeaseEventType.AMENDMENT, LeaseEventType.RENEWAL] } },
    orderBy: { effectiveDate: 'asc' }
  });
  const addendaPerLease = new Map<string, number>();
  let addendumDrafts = 0;
  for (const e of events) {
    const lease = base.leaseById.get(e.leaseId);
    if (!lease) continue;
    const n = (addendaPerLease.get(lease.id) ?? 0) + 1;
    addendaPerLease.set(lease.id, n);
    const planned = e.effectiveDate.getTime() > end.getTime();
    const draft = planned && addendumDrafts < 3;
    if (draft) addendumDrafts += 1;
    const issuedAt = noonUtc(planned ? plusDays(end, -3) : e.effectiveDate);
    await put({
      type: RentalDocumentType.LEASE_ADDENDUM,
      status: draft ? RentalDocumentStatus.DRAFT : RentalDocumentStatus.FINAL,
      number: `${lease.number}-AV${n}`,
      issuedAt,
      title: `${e.type === 'RENEWAL' ? 'Avenant de renouvellement' : 'Avenant n°' + n} — ${lease.number}`,
      lines: [
        `Avenant au bail ${lease.number}`,
        `Prenant effet le ${dateFr(e.effectiveDate)}.`,
        '',
        ...partiesLines(lease),
        '',
        '# Objet',
        e.summary ?? 'Modification des conditions du bail.',
        e.newEndDate ? `Nouvelle date de fin de bail : ${dateFr(e.newEndDate)}.` : '',
        e.newRent ? `Loyer applicable : ${fcfa(Number(e.newRent))}.` : '',
        '',
        'Les autres clauses du bail initial demeurent inchangées.'
      ],
      leaseId: lease.id,
      metadata: { eventId: e.id, eventType: e.type }
    });
  }

  // ── Reçus et quittances de loyer.
  const payments = await prisma.rentalPayment.findMany({
    where: { tenant_id: tenantId, status: 'SUCCESS', lease_id: { not: null } },
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
  const METHOD_LABEL: Record<string, string> = {
    CASH: 'espèces',
    BANK_TRANSFER: 'virement bancaire',
    CHECK: 'chèque',
    MOBILE_MONEY: 'Mobile Money',
    CARD: 'carte bancaire',
    OTHER: 'autre moyen'
  };
  const since = plusDays(end, -365);
  const receiptCandidates = payments.filter(
    p => !depositPaymentIds.has(p.id) && p.allocations.length > 0 && (p.succeeded_at ?? p.initiated_at) >= since
  );
  let pairs = 0;
  let voids = 0;
  for (const p of receiptCandidates) {
    const lease = base.leaseById.get(p.lease_id as string);
    if (!lease) continue;
    const paidAt = noonUtc(p.succeeded_at ?? p.initiated_at);
    const alloc = p.allocations[0];
    const period = `${moisFr(alloc.installment.period_month)} ${alloc.installment.period_year}`;
    const [, number] = nextSeq('RCU', paidAt);
    const common = {
      type: RentalDocumentType.RENT_RECEIPT,
      issuedAt: paidAt,
      leaseId: lease.id,
      installmentId: alloc.installment_id,
      paymentId: p.id
    };
    const methodLabel = METHOD_LABEL[p.method] ?? 'autre moyen';
    const lines = receiptLines(
      lease,
      number,
      paidAt,
      Number(p.amount),
      methodLabel,
      `loyer de ${period}`,
      p.psp_reference
    );
    if (pairs < 3 && receiptCandidates.indexOf(p) % 70 === 20) {
      // Reçu corrigé : l'ancienne révision est remplacée.
      const replacementId = await put({
        ...common,
        number: `${number}-R2`,
        title: `Reçu de loyer — ${period} (révision 2)`,
        lines: [...lines, 'Reçu corrigé : remplace la révision 1 (référence du règlement rectifiée).'],
        revision: 2,
        metadata: { period, amount: Number(p.amount) }
      });
      await put({
        ...common,
        status: RentalDocumentStatus.SUPERSEDED,
        number,
        title: `Reçu de loyer — ${period}`,
        lines,
        supersededById: replacementId,
        metadata: { period, amount: Number(p.amount) }
      });
      pairs += 1;
      continue;
    }
    if (voids < 2 && receiptCandidates.indexOf(p) % 97 === 11) {
      await put({
        ...common,
        status: RentalDocumentStatus.VOID,
        number,
        title: `Reçu de loyer — ${period} (annulé)`,
        description: 'Reçu annulé : émis en double sur le même règlement.',
        lines: [...lines, 'ANNULÉ : émis en double.'],
        metadata: { period, amount: Number(p.amount) }
      });
      voids += 1;
      continue;
    }
    await put({
      ...common,
      number,
      title: `Reçu de loyer — ${period}`,
      lines,
      metadata: { period, amount: Number(p.amount) }
    });
  }

  // Quittances des quatre derniers mois (échéances soldées).
  const recentPaid = await prisma.rentalInstallment.findMany({
    where: { tenant_id: tenantId, status: 'PAID', paid_at: { gte: plusDays(end, -120) } },
    orderBy: { paid_at: 'asc' },
    select: { id: true, lease_id: true, period_year: true, period_month: true, paid_at: true, amount_paid: true }
  });
  for (const inst of recentPaid) {
    const lease = base.leaseById.get(inst.lease_id);
    if (!lease || !inst.paid_at) continue;
    const at = noonUtc(inst.paid_at);
    const [, number] = nextSeq('QUI', at);
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

  // ── Impayés : mises en demeure ; échéances à venir : avis d'échéance.
  const unpaid = await prisma.rentalInstallment.findMany({
    where: { tenant_id: tenantId, status: { in: ['OVERDUE', 'PARTIAL'] } },
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
    const lease = base.leaseById.get(inst.lease_id);
    if (!lease) continue;
    const at = noonUtc(new Date(Math.min(end.getTime(), plusDays(inst.due_date, 20).getTime())));
    if (at.getTime() <= inst.due_date.getTime()) continue;
    const due =
      Number(inst.amount_rent) + Number(inst.amount_service) + Number(inst.penalty_amount) - Number(inst.amount_paid);
    const [, number] = nextSeq('MED', at);
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

  const upcoming = await prisma.rentalInstallment.findMany({
    where: {
      tenant_id: tenantId,
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
    const lease = base.leaseById.get(inst.lease_id);
    if (!lease) continue;
    const at = noonUtc(new Date(Math.min(end.getTime(), plusDays(inst.due_date, -10).getTime())));
    const total = Number(inst.amount_rent) + Number(inst.amount_service);
    const [, number] = nextSeq('AVE', at);
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

  // ── Relevés de loyers (dernier mois) des baux actifs.
  const activeLeases = base.leases.filter(l => l.status === 'ACTIVE').slice(0, 20);
  for (const lease of activeLeases) {
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
    const [, number] = nextSeq('RLV', at);
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

  // ── Compteurs de numérotation alignés sur ce qui vient d'être émis.
  for (const [key, last] of counters) {
    const [prefix, yyyymm] = key.split('-');
    const docType =
      prefix === 'RCU' ? DocumentType.RENT_RECEIPT : prefix === 'RLV' ? DocumentType.RENT_STATEMENT : null;
    if (!docType) continue;
    const periodKey = `${yyyymm.slice(0, 4)}-${yyyymm.slice(4)}`;
    await prisma.documentCounter.upsert({
      where: { tenant_id_doc_type_period_key: { tenant_id: tenantId, doc_type: docType, period_key: periodKey } },
      create: { tenant_id: tenantId, doc_type: docType, period_key: periodKey, last_number: last },
      update: { last_number: last }
    });
  }
  log(
    `documents locatifs : ${Object.entries(counts)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ')}.`
  );
}
