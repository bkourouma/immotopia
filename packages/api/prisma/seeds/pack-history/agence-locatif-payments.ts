/**
 * Encaissements et facturation locative : lignes de détail des échéances,
 * campagnes de facturation mensuelle, passerelle de paiement en ligne (simulateur
 * seulement), paiements en ligne, remboursements, pénalités levées, déclarations
 * de paiement des locataires et liens sécurisés.
 *
 * Aucun appel sortant : les paiements en ligne sont des lignes d'historique du
 * simulateur, jamais un échange avec un opérateur.
 */
import { Prisma } from '@prisma/client';
import { generateToken, hashToken } from '../../../src/lib/secure-links/token';
import { env } from '../../../src/config/env';
import { between } from './types';
import { ivorianPhone } from './agence-data';
import { writeDemoPdf } from './seed-files';
import { dateFr, fcfa, moisFr, noonUtc, pickOne, plusDays } from './agence-locatif-base';
import type { LocatifBase } from './agence-locatif-base';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function randomCode(rng: () => number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return out;
}
const phone10 = (rng: () => number) => ivorianPhone(rng).replace(/\D/g, '').slice(-10);

const OPERATORS = [
  { op: 'ORANGE', service: 'Orange Money', prefix: 'OM' },
  { op: 'MTN', service: 'MTN MoMo', prefix: 'MP' },
  { op: 'MOOV', service: 'Moov Money', prefix: 'MV' },
  { op: 'WAVE', service: 'Wave', prefix: 'WV' }
] as const;

// ───────────────────────────────────────────────── détail des échéances

export async function seedInstallmentItems(base: LocatifBase): Promise<void> {
  const { prisma, tenantId, log } = base.ctx;
  if ((await prisma.rentalInstallmentItem.count({ where: { tenant_id: tenantId } })) > 0) {
    log('lignes d’échéances : déjà présentes, bloc sauté.');
    return;
  }
  const installments = await prisma.rentalInstallment.findMany({
    where: { tenant_id: tenantId },
    select: { id: true, amount_rent: true, amount_service: true, amount_other_fees: true, created_at: true }
  });
  const rows: Prisma.RentalInstallmentItemCreateManyInput[] = [];
  for (const i of installments) {
    rows.push({
      tenant_id: tenantId,
      installment_id: i.id,
      charge_type: 'RENT',
      label: 'Loyer',
      amount: i.amount_rent,
      created_at: i.created_at
    });
    if (Number(i.amount_service) > 0) {
      rows.push({
        tenant_id: tenantId,
        installment_id: i.id,
        charge_type: 'SERVICE_CHARGE',
        label: 'Provision pour charges',
        amount: i.amount_service,
        created_at: i.created_at
      });
    }
    if (Number(i.amount_other_fees) > 0) {
      rows.push({
        tenant_id: tenantId,
        installment_id: i.id,
        charge_type: 'OTHER',
        label: 'Frais divers',
        amount: i.amount_other_fees,
        created_at: i.created_at
      });
    }
  }
  for (let i = 0; i < rows.length; i += 1000) {
    await prisma.rentalInstallmentItem.createMany({ data: rows.slice(i, i + 1000) });
  }
  log(`lignes d’échéances : ${rows.length} lignes pour ${installments.length} échéances.`);
}

// ───────────────────────────────────────────────── campagnes de facturation

const MOIS_SANS_ACCENT = [
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

export async function seedBillingRuns(base: LocatifBase): Promise<void> {
  const { prisma, tenantId, rng, end, log } = base.ctx;
  if ((await prisma.rentBillingRun.count({ where: { tenantId } })) > 0) {
    log('campagnes de facturation : déjà présentes, bloc sauté.');
    return;
  }
  const installments = await prisma.rentalInstallment.findMany({
    where: { tenant_id: tenantId, status: { not: 'CANCELED' } },
    select: {
      id: true,
      lease_id: true,
      period_year: true,
      period_month: true,
      amount_rent: true,
      amount_service: true,
      amount_other_fees: true
    }
  });
  if (installments.length === 0) return;
  const byPeriod = new Map<string, typeof installments>();
  for (const i of installments) {
    const key = `${i.period_year}-${i.period_month}`;
    const list = byPeriod.get(key) ?? [];
    list.push(i);
    byPeriod.set(key, list);
  }
  const first = installments.reduce(
    (min, i) => Math.min(min, i.period_year * 12 + i.period_month - 1),
    Number.MAX_SAFE_INTEGER
  );
  const last = end.getUTCFullYear() * 12 + end.getUTCMonth();
  let created = 0;
  for (let idx = first; idx <= last; idx++) {
    const year = Math.floor(idx / 12);
    const month = (idx % 12) + 1;
    const list = byPeriod.get(`${year}-${month}`) ?? [];
    if (list.length === 0) continue;
    const billedByLease = new Map(list.map(i => [i.lease_id, i]));
    const billed = list.map(i => {
      const lease = base.leaseById.get(i.lease_id);
      return {
        leaseId: i.lease_id,
        leaseLabel: lease ? `${lease.renterName} — ${lease.propertyTitle}` : `Bail ${i.lease_id.slice(0, 8)}`,
        installmentId: i.id,
        amount: Number(i.amount_rent) + Number(i.amount_service) + Number(i.amount_other_fees)
      };
    });
    const excluded: Array<{ leaseId: string; leaseLabel: string; reason: string }> = [];
    for (const lease of base.leases) {
      if (billedByLease.has(lease.id)) continue;
      const label = `${lease.renterName} — ${lease.propertyTitle}`;
      const startIdx = lease.start.getUTCFullYear() * 12 + lease.start.getUTCMonth();
      const endIdx = lease.end ? lease.end.getUTCFullYear() * 12 + lease.end.getUTCMonth() : null;
      let reason: string | null = null;
      if (idx < startIdx) reason = 'PERIOD_BEFORE_LEASE_START';
      else if (endIdx !== null && idx > endIdx) reason = 'PERIOD_AFTER_LEASE_END';
      else if (lease.billing === 'QUARTERLY') reason = 'PERIOD_OFF_BILLING_CYCLE';
      if (reason) excluded.push({ leaseId: lease.id, leaseLabel: label, reason });
    }
    const connector = ['avril', 'aout', 'octobre'].includes(MOIS_SANS_ACCENT[month - 1])
      ? `d'${MOIS_SANS_ACCENT[month - 1]}`
      : `de ${MOIS_SANS_ACCENT[month - 1]}`;
    const startedAt = new Date(Date.UTC(year, month - 1, 1, 7, between(rng, 5, 50), between(rng, 0, 59)));
    await prisma.rentBillingRun.create({
      data: {
        tenantId,
        periodYear: year,
        periodMonth: month,
        label: `Loyer ${connector} ${year}`,
        status: 'DONE',
        startedAt,
        finishedAt: new Date(startedAt.getTime() + between(rng, 8, 55) * 1000),
        createdByUserId: pickOne(rng, base.signers).id,
        summary: { billed, excluded, advancesApplied: [] } as unknown as Prisma.InputJsonValue
      }
    });
    created += 1;
  }
  log(`campagnes de facturation : ${created} mois facturés.`);
}

// ───────────────────────────────────────────────── passerelle et paiements en ligne

export async function seedGatewayAndCheckouts(base: LocatifBase): Promise<void> {
  const { prisma, tenantId, rng, end, log } = base.ctx;

  // ── Configuration de la passerelle : simulateur, jamais de clé réelle.
  const hasConfig = await prisma.paymentGatewayConfig.findUnique({ where: { tenantId }, select: { id: true } });
  if (!hasConfig) {
    const { prisma: appPrisma } = await import('../../../src/utils/database');
    const { ensureCollectionAccountTx } = await import('../../../src/lib/payment-gateway/config');
    const treasuryId = await appPrisma.$transaction(tx => ensureCollectionAccountTx(tx, tenantId));
    await prisma.paymentGatewayConfig.create({
      data: {
        tenantId,
        provider: 'PAYSECUREHUB',
        mode: 'SIMULATOR',
        isActive: true,
        merchantId: null,
        apiKeyEncrypted: null,
        apiKeyLast4: null,
        treasuryAccountId: treasuryId,
        feesPaidBy: 'CLIENT',
        lastTestAt: plusDays(end, -3),
        lastTestOk: true,
        lastTestMessage: 'Simulateur de paiement opérationnel.',
        createdAt: plusDays(end, -420)
      }
    });
    log('passerelle de paiement : configuration enregistrée (simulateur).');
  }

  // ── Paiements en ligne.
  if ((await prisma.onlinePaymentCheckout.count({ where: { tenantId } })) > 0) {
    log('paiements en ligne : déjà présents, bloc sauté.');
    return;
  }
  const since = plusDays(end, -420);
  const mobile = await prisma.rentalPayment.findMany({
    where: {
      tenant_id: tenantId,
      status: 'SUCCESS',
      method: 'MOBILE_MONEY',
      lease_id: { not: null },
      initiated_at: { gte: since },
      allocations: { some: {} },
      onlineCheckout: null
    },
    orderBy: { initiated_at: 'asc' },
    select: {
      id: true,
      lease_id: true,
      renter_client_id: true,
      amount: true,
      mm_operator: true,
      succeeded_at: true,
      initiated_at: true,
      allocations: { select: { installment_id: true } }
    }
  });

  const used = new Set<string>();
  let n = 0;
  const makeLink = async (installmentId: string, at: Date, views: number): Promise<string> => {
    const link = await prisma.secureLink.create({
      data: {
        tenantId,
        scope: 'INSTALLMENT_PAYMENT',
        objectType: 'RentalInstallment',
        objectId: installmentId,
        tokenHash: hashToken(generateToken()),
        expiresAt: plusDays(at, 7),
        createdByUserId: pickOne(rng, base.signers).id,
        viewCount: views,
        lastViewedAt: views > 0 ? plusDays(at, 0) : null,
        createdAt: at,
        updatedAt: at
      },
      select: { id: true }
    });
    return link.id;
  };

  // SUCCESS : on rattache des règlements Mobile Money existants à la passerelle.
  const successCount = Math.min(24, Math.floor(mobile.length / 3));
  const stride = Math.max(1, Math.floor(mobile.length / Math.max(1, successCount)));
  for (let i = 0; i < mobile.length && n < successCount; i += stride) {
    const p = mobile[i];
    const op = OPERATORS.find(o => o.op === p.mm_operator) ?? pickOne(rng, OPERATORS);
    const code = `IMT-${randomCode(rng, 20)}`;
    const done = p.succeeded_at ?? p.initiated_at;
    const viaLink = n % 3 === 0;
    const installmentId = p.allocations[0].installment_id;
    await prisma.rentalPayment.update({
      where: { id: p.id, tenant_id: tenantId },
      data: { psp_name: 'PaySecureHub', psp_reference: code, mm_operator: op.op }
    });
    await prisma.onlinePaymentCheckout.create({
      data: {
        tenantId,
        paymentId: p.id,
        leaseId: p.lease_id as string,
        renterClientId: p.renter_client_id ?? base.leaseById.get(p.lease_id as string)?.renterId ?? '',
        provider: 'PAYSECUREHUB',
        mode: 'SIMULATOR',
        codePaiement: code,
        amount: p.amount,
        installmentIds: p.allocations.map(a => a.installment_id),
        checkoutUrl: `${env.BACKEND_URL.replace(/\/$/, '')}/api/payment-gateway/simulator/${code}`,
        providerTransactionId: `${op.prefix}${between(rng, 100000000, 999999999)}`,
        providerServiceName: op.service,
        providerFees: new Prisma.Decimal(Math.round(Number(p.amount) * 0.015)),
        status: 'SUCCESS',
        lastProviderState: 'SUCCESSFUL',
        lastCheckedAt: done,
        checkAttempts: between(rng, 1, 3),
        simulatedOutcome: 'SUCCESS',
        secureLinkId: viaLink ? await makeLink(installmentId, plusDays(done, -1), between(rng, 1, 3)) : null,
        completedAt: done,
        createdAt: plusDays(done, 0),
        updatedAt: done
      }
    });
    used.add(p.id);
    n += 1;
  }

  // Échecs, abandons, expirations, attentes et vérifications : nouveaux règlements non affectés.
  const activeLeases = base.leases.filter(l => l.status === 'ACTIVE' && l.billing === 'MONTHLY');
  const installmentsByLease = new Map<string, { id: string; amount: number; due: Date }>();
  const recentInstallments = await prisma.rentalInstallment.findMany({
    where: { tenant_id: tenantId, lease_id: { in: activeLeases.map(l => l.id) }, due_date: { lte: end } },
    orderBy: { due_date: 'desc' },
    select: { id: true, lease_id: true, amount_rent: true, amount_service: true, due_date: true }
  });
  for (const i of recentInstallments) {
    if (!installmentsByLease.has(i.lease_id)) {
      installmentsByLease.set(i.lease_id, {
        id: i.id,
        amount: Number(i.amount_rent) + Number(i.amount_service),
        due: i.due_date
      });
    }
  }
  const plan: Array<{
    status: 'FAILED' | 'CANCELED' | 'EXPIRED' | 'PENDING' | 'REVIEW';
    daysAgo: number;
    message?: string;
    review?: string;
  }> = [
    { status: 'FAILED', daysAgo: 160, message: 'Solde insuffisant sur le compte Mobile Money du payeur.' },
    { status: 'FAILED', daysAgo: 96, message: 'Transaction refusée par l’opérateur.' },
    { status: 'FAILED', daysAgo: 41, message: 'Code de confirmation erroné saisi trois fois.' },
    { status: 'FAILED', daysAgo: 12, message: 'Délai de confirmation dépassé côté opérateur.' },
    { status: 'CANCELED', daysAgo: 210, message: 'Paiement abandonné par le payeur avant confirmation.' },
    { status: 'CANCELED', daysAgo: 74, message: 'Paiement abandonné par le payeur avant confirmation.' },
    { status: 'CANCELED', daysAgo: 19, message: 'Paiement annulé par le payeur.' },
    { status: 'EXPIRED', daysAgo: 133, message: 'Lien de paiement expiré sans règlement.' },
    { status: 'EXPIRED', daysAgo: 58, message: 'Lien de paiement expiré sans règlement.' },
    { status: 'EXPIRED', daysAgo: 23, message: 'Lien de paiement expiré sans règlement.' },
    { status: 'PENDING', daysAgo: 0 },
    { status: 'PENDING', daysAgo: 1 },
    { status: 'PENDING', daysAgo: 2 },
    {
      status: 'REVIEW',
      daysAgo: 6,
      review: 'Montant reçu inférieur au montant attendu : vérification manuelle requise.'
    },
    { status: 'REVIEW', daysAgo: 14, review: 'Référence opérateur introuvable lors de la dernière vérification.' }
  ];
  let k = 0;
  for (const item of plan) {
    const lease = activeLeases[(k * 3 + 1) % activeLeases.length];
    k += 1;
    const inst = installmentsByLease.get(lease.id);
    if (!inst) continue;
    const op = pickOne(rng, OPERATORS);
    const code = `IMT-${randomCode(rng, 20)}`;
    const at = new Date(plusDays(end, -item.daysAgo).getTime() - between(rng, 1, 7) * 3_600_000);
    const paymentStatus =
      item.status === 'FAILED'
        ? 'FAILED'
        : item.status === 'CANCELED' || item.status === 'EXPIRED'
          ? 'CANCELED'
          : 'PENDING';
    const payment = await prisma.rentalPayment.create({
      data: {
        tenant_id: tenantId,
        lease_id: lease.id,
        renter_client_id: lease.renterId,
        method: 'MOBILE_MONEY',
        status: paymentStatus,
        amount: new Prisma.Decimal(inst.amount),
        mm_operator: op.op,
        mm_phone: phone10(rng),
        idempotency_key: `ligne-${code}`,
        psp_name: 'PaySecureHub',
        psp_reference: code,
        initiated_at: at,
        failed_at: item.status === 'FAILED' ? new Date(at.getTime() + 180_000) : null,
        canceled_at:
          paymentStatus === 'CANCELED'
            ? new Date(at.getTime() + (item.status === 'EXPIRED' ? 7 * 86_400_000 : 240_000))
            : null,
        created_by_user_id: null,
        created_at: at,
        updated_at: at
      },
      select: { id: true }
    });
    const checkAttempts = item.status === 'PENDING' ? between(rng, 0, 1) : between(rng, 1, 4);
    await prisma.onlinePaymentCheckout.create({
      data: {
        tenantId,
        paymentId: payment.id,
        leaseId: lease.id,
        renterClientId: lease.renterId,
        provider: 'PAYSECUREHUB',
        mode: 'SIMULATOR',
        codePaiement: code,
        amount: new Prisma.Decimal(inst.amount),
        installmentIds: [inst.id],
        checkoutUrl: `${env.BACKEND_URL.replace(/\/$/, '')}/api/payment-gateway/simulator/${code}`,
        providerServiceName: item.status === 'PENDING' || item.status === 'EXPIRED' ? null : op.service,
        providerTransactionId: item.status === 'REVIEW' ? `${op.prefix}${between(rng, 100000000, 999999999)}` : null,
        status: item.status,
        lastProviderState:
          item.status === 'FAILED'
            ? 'FAILED'
            : item.status === 'CANCELED'
              ? 'CANCELED'
              : item.status === 'REVIEW'
                ? 'SUCCESSFUL'
                : 'PENDING',
        lastCheckedAt: item.daysAgo === 0 ? at : new Date(at.getTime() + 600_000),
        checkAttempts,
        failureMessage: item.message ?? null,
        reviewReason: item.review ?? null,
        simulatedOutcome: item.status === 'FAILED' ? 'FAILED' : item.status === 'CANCELED' ? 'CANCELED' : null,
        secureLinkId: k % 2 === 0 ? await makeLink(inst.id, at, between(rng, 1, 2)) : null,
        completedAt: item.status === 'PENDING' || item.status === 'REVIEW' ? null : new Date(at.getTime() + 300_000),
        createdAt: at,
        updatedAt: at
      }
    });
    n += 1;
  }
  log(`paiements en ligne : ${n} règlements via la passerelle (simulateur).`);
}

// ───────────────────────────────────────────────── remboursements

export async function seedRefunds(base: LocatifBase): Promise<void> {
  const { prisma, tenantId, rng, end, log } = base.ctx;
  if ((await prisma.rentalRefund.count({ where: { tenant_id: tenantId } })) > 0) {
    log('remboursements : déjà présents, bloc sauté.');
    return;
  }
  const activeLeases = base.leases.filter(l => l.status === 'ACTIVE');
  const stories: Array<{
    daysAgo: number;
    paymentStatus: 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'SUCCESS';
    refundStatus: 'SUCCESS' | 'PENDING' | 'FAILED';
    share: number;
    reason: string;
    method: 'MOBILE_MONEY' | 'BANK_TRANSFER';
  }> = [
    {
      daysAgo: 330,
      paymentStatus: 'REFUNDED',
      refundStatus: 'SUCCESS',
      share: 1,
      reason: 'Double paiement du loyer : trop-perçu intégralement remboursé.',
      method: 'MOBILE_MONEY'
    },
    {
      daysAgo: 270,
      paymentStatus: 'PARTIALLY_REFUNDED',
      refundStatus: 'SUCCESS',
      share: 0.4,
      reason: 'Trop-perçu sur le loyer après révision des charges.',
      method: 'BANK_TRANSFER'
    },
    {
      daysAgo: 205,
      paymentStatus: 'REFUNDED',
      refundStatus: 'SUCCESS',
      share: 1,
      reason: 'Règlement envoyé par erreur sur le mauvais bail, remboursé au payeur.',
      method: 'MOBILE_MONEY'
    },
    {
      daysAgo: 150,
      paymentStatus: 'PARTIALLY_REFUNDED',
      refundStatus: 'SUCCESS',
      share: 0.5,
      reason: 'Avoir accordé après intervention technique tardive.',
      method: 'BANK_TRANSFER'
    },
    {
      daysAgo: 88,
      paymentStatus: 'REFUNDED',
      refundStatus: 'SUCCESS',
      share: 1,
      reason: 'Paiement en ligne débité deux fois : un débit remboursé.',
      method: 'MOBILE_MONEY'
    },
    {
      daysAgo: 47,
      paymentStatus: 'PARTIALLY_REFUNDED',
      refundStatus: 'SUCCESS',
      share: 0.3,
      reason: 'Trop-perçu de charges de copropriété.',
      method: 'BANK_TRANSFER'
    },
    {
      daysAgo: 9,
      paymentStatus: 'SUCCESS',
      refundStatus: 'PENDING',
      share: 1,
      reason: 'Remboursement partiel du trop-perçu en cours : virement en préparation.',
      method: 'MOBILE_MONEY'
    },
    {
      daysAgo: 21,
      paymentStatus: 'SUCCESS',
      refundStatus: 'FAILED',
      share: 1,
      reason: 'Remboursement partiel échoué : numéro Mobile Money du bénéficiaire invalide, à relancer.',
      method: 'MOBILE_MONEY'
    }
  ];
  // Remboursements en cours ou en échec : portés par de vrais règlements récents (aucun encaissement fictif de plus).
  const recent = await prisma.rentalPayment.findMany({
    where: {
      tenant_id: tenantId,
      status: 'SUCCESS',
      method: 'MOBILE_MONEY',
      lease_id: { not: null },
      initiated_at: { gte: plusDays(end, -60) },
      allocations: { some: {} }
    },
    orderBy: { initiated_at: 'desc' },
    select: { id: true, lease_id: true, amount: true, initiated_at: true, succeeded_at: true }
  });
  let recentIndex = 0;
  let n = 0;
  for (const s of stories) {
    let paymentId: string;
    let at: Date;
    let amount: number;
    let renterName: string;
    if (s.paymentStatus === 'SUCCESS') {
      const existing = recent[recentIndex * 2];
      recentIndex += 1;
      const lease = existing ? base.leaseById.get(existing.lease_id as string) : undefined;
      if (!existing || !lease) continue;
      paymentId = existing.id;
      at = noonUtc(existing.succeeded_at ?? existing.initiated_at);
      amount = Number(existing.amount);
      renterName = lease.renterName;
      s.share = 0.25;
    } else {
      const lease = activeLeases[(n * 4 + 2) % activeLeases.length];
      at = noonUtc(plusDays(end, -s.daysAgo));
      amount = Math.round(lease.rent + lease.charges);
      renterName = lease.renterName;
      const payment = await prisma.rentalPayment.create({
        data: {
          tenant_id: tenantId,
          lease_id: lease.id,
          renter_client_id: lease.renterId,
          method: s.method,
          status: s.paymentStatus,
          amount: new Prisma.Decimal(amount),
          mm_operator: s.method === 'MOBILE_MONEY' ? pickOne(rng, OPERATORS).op : null,
          mm_phone: s.method === 'MOBILE_MONEY' ? phone10(rng) : null,
          idempotency_key: `remb-${lease.id.slice(0, 8)}-${n}`,
          psp_name: s.method === 'MOBILE_MONEY' ? 'PaySecureHub' : null,
          psp_reference: `RB-${randomCode(rng, 10)}`,
          initiated_at: at,
          succeeded_at: at,
          created_by_user_id: pickOne(rng, base.signers).id,
          created_at: at,
          updated_at: at
        },
        select: { id: true }
      });
      paymentId = payment.id;
    }
    const refunded =
      s.paymentStatus === 'SUCCESS' ? Math.round((amount * s.share) / 5000) * 5000 : Math.round(amount * s.share);
    await prisma.rentalRefund.create({
      data: {
        tenant_id: tenantId,
        payment_id: paymentId,
        status: s.refundStatus,
        amount: new Prisma.Decimal(refunded),
        psp_refund_id: s.refundStatus === 'SUCCESS' ? `RF-${randomCode(rng, 12)}` : null,
        raw_event_payload: { reason: s.reason, requestedBy: renterName } as Prisma.InputJsonValue,
        created_by_user_id: pickOne(rng, base.signers).id,
        created_at: plusDays(at, 1),
        updated_at: plusDays(at, s.refundStatus === 'PENDING' ? 1 : 2)
      }
    });
    n += 1;
  }
  log(`remboursements : ${n} remboursements de règlements.`);
}

// ───────────────────────────────────────────────── pénalités levées

export async function seedWaivedPenalties(base: LocatifBase): Promise<void> {
  const { prisma, tenantId, rng, log } = base.ctx;
  if ((await prisma.rentalPenalty.count({ where: { tenant_id: tenantId, is_manual_override: true } })) > 0) {
    log('pénalités levées : déjà présentes, bloc sauté.');
    return;
  }
  const lateAllocations = await prisma.rentalPaymentAllocation.findMany({
    where: {
      tenant_id: tenantId,
      payment: { status: 'SUCCESS' },
      installment: { status: 'PAID', penalty_amount: 0, penalties: { none: {} } }
    },
    select: {
      amount: true,
      payment: { select: { succeeded_at: true, initiated_at: true } },
      installment: {
        select: {
          id: true,
          lease_id: true,
          due_date: true,
          period_year: true,
          period_month: true,
          amount_rent: true,
          amount_service: true
        }
      }
    }
  });
  const late = lateAllocations
    .map(a => {
      const paidAt = a.payment.succeeded_at ?? a.payment.initiated_at;
      const days = Math.floor((paidAt.getTime() - a.installment.due_date.getTime()) / 86_400_000);
      return { a, paidAt, days };
    })
    .filter(x => x.days >= 9 && x.days <= 60)
    .sort((x, y) => x.paidAt.getTime() - y.paidAt.getTime());
  const seenInstallment = new Set<string>();
  const unique = late.filter(x =>
    seenInstallment.has(x.a.installment.id) ? false : (seenInstallment.add(x.a.installment.id), true)
  );
  const stride = Math.max(1, Math.floor(unique.length / 14));
  const reasons = [
    'Geste commercial : locataire de longue date, retard dû à un incident bancaire.',
    'Pénalité levée : le retard résulte d’un virement bloqué par la banque, justificatif joint.',
    'Pénalité levée après accord avec le propriétaire (retard exceptionnel, premier incident en deux ans).',
    'Pénalité annulée : attestation de l’employeur sur un retard de paie.'
  ];
  let n = 0;
  for (let i = 0; i < unique.length && n < 14; i += stride) {
    const { a, paidAt, days } = unique[i];
    const lease = base.leaseById.get(a.installment.lease_id);
    if (!lease) continue;
    const balance = Number(a.installment.amount_rent) + Number(a.installment.amount_service);
    const calculated = Math.round((balance * 5) / 100);
    const penalty = await prisma.rentalPenalty.create({
      data: {
        tenant_id: tenantId,
        installment_id: a.installment.id,
        calculated_at: noonUtc(paidAt),
        days_late: days,
        mode: 'PERCENT_OF_BALANCE',
        rate: new Prisma.Decimal(5),
        amount: new Prisma.Decimal(0),
        is_manual_override: true,
        created_by_user_id: pickOne(rng, base.signers).id,
        created_at: noonUtc(paidAt)
      },
      select: { id: true }
    });
    const reason = pickOne(rng, reasons);
    const period = `${moisFr(a.installment.period_month)} ${a.installment.period_year}`;
    const stored = await writeDemoPdf(
      ['rental', 'penalties', penalty.id],
      'justificatif.pdf',
      `Justificatif — pénalité de retard levée (${period})`,
      [
        `Bail ${lease.number} — ${lease.propertyTitle}.`,
        `Locataire : ${lease.renterName}.`,
        '',
        `Loyer de ${period} échu le ${dateFr(a.installment.due_date)}, réglé le ${dateFr(paidAt)} (${days} jours de retard).`,
        `Pénalité calculée : ${fcfa(calculated)} (5 % du solde) — ramenée à 0 F CFA.`,
        '',
        `Motif : ${reason}`,
        'Décision prise par la gestionnaire du dossier, avec trace au compte du locataire.'
      ]
    );
    await prisma.rentalPenalty.update({
      where: { id: penalty.id, tenant_id: tenantId },
      data: {
        override_reason: JSON.stringify({
          reason: `${reason} (pénalité calculée : ${fcfa(calculated)})`,
          justification: { fileUrl: stored.fileUrl, fileName: stored.fileName }
        })
      }
    });
    n += 1;
  }
  log(`pénalités levées : ${n} pénalités ramenées à zéro avec justificatif.`);
}

// ───────────────────────────────────────────────── déclarations de paiement

export async function seedPaymentDeclarations(base: LocatifBase): Promise<void> {
  const { prisma, tenantId, rng, log } = base.ctx;

  const proofFor = async (
    leaseNumber: string,
    renter: string,
    operator: (typeof OPERATORS)[number],
    amount: number,
    ref: string,
    paidAt: Date,
    phone: string
  ) =>
    writeDemoPdf(['portal', 'payments', tenantId], `preuve-${ref}.pdf`, `Reçu de transfert ${operator.service}`, [
      `Opération : transfert d’argent — ${operator.service}`,
      `Référence : ${ref}`,
      `Date : ${dateFr(paidAt)}`,
      `Montant : ${fcfa(amount)}`,
      `Compte émetteur : ${phone} (${renter})`,
      'Bénéficiaire : agence gestionnaire',
      `Motif : loyer — bail ${leaseNumber}`,
      'Statut : transaction réussie'
    ]);

  // Les déclarations déjà présentes annoncent une capture jointe : on la fournit.
  const bare = await prisma.rentalPaymentDeclaration.findMany({
    where: { tenant_id: tenantId, proof_file_url: null },
    select: {
      id: true,
      lease_id: true,
      amount: true,
      payment_date: true,
      reference: true,
      mobile_operator: true,
      transaction_phone: true
    }
  });
  for (const d of bare) {
    const lease = base.leaseById.get(d.lease_id);
    const op = OPERATORS.find(o => o.op === d.mobile_operator) ?? OPERATORS[0];
    const ref = d.reference ?? `OM${between(rng, 100000000, 999999999)}`;
    const stored = await proofFor(
      lease?.number ?? 'bail',
      lease?.renterName ?? 'Locataire',
      op,
      Number(d.amount),
      ref,
      d.payment_date,
      d.transaction_phone ?? phone10(rng)
    );
    await prisma.rentalPaymentDeclaration.update({
      where: { id: d.id },
      data: { proof_file_url: stored.fileUrl }
    });
  }

  const total = await prisma.rentalPaymentDeclaration.count({ where: { tenant_id: tenantId } });
  if (total >= 10) {
    log(`déclarations de paiement : ${total} déjà présentes (preuves complétées : ${bare.length}).`);
    return;
  }

  const mobile = await prisma.rentalPayment.findMany({
    where: {
      tenant_id: tenantId,
      status: 'SUCCESS',
      method: 'MOBILE_MONEY',
      lease_id: { not: null },
      renter_client_id: { not: null },
      allocations: { some: {} }
    },
    orderBy: { initiated_at: 'asc' },
    select: {
      lease_id: true,
      renter_client_id: true,
      amount: true,
      initiated_at: true,
      succeeded_at: true,
      allocations: { select: { installment_id: true }, take: 1 }
    }
  });
  const rows: Array<{
    status: 'APPROVED' | 'REJECTED' | 'CANCELED' | 'PENDING';
    p: (typeof mobile)[number];
    note: string;
    review: string | null;
    delta: number;
  }> = [];
  const stride = Math.max(1, Math.floor(mobile.length / 16));
  const approvedNotes = [
    'Transfert effectué depuis mon compte, capture jointe.',
    'Paiement fait ce matin, voici la preuve.',
    'Règlement du loyer par Mobile Money, reçu en pièce jointe.'
  ];
  const rejections = [
    'Montant déclaré différent de celui reçu sur le compte de l’agence.',
    'Capture illisible : merci de renvoyer la preuve du transfert.',
    'Aucune transaction correspondante sur le relevé Mobile Money.',
    'Référence déjà utilisée pour un autre règlement.'
  ];
  for (let i = 0, count = 0; i < mobile.length && count < 14; i += stride, count++) {
    const p = mobile[i];
    const kind = count < 8 ? 'APPROVED' : count < 12 ? 'REJECTED' : count < 14 ? 'CANCELED' : 'PENDING';
    rows.push({
      status: kind,
      p,
      note: pickOne(rng, approvedNotes),
      review:
        kind === 'APPROVED'
          ? 'Paiement retrouvé sur le relevé Mobile Money, déclaration validée et règlement enregistré.'
          : kind === 'REJECTED'
            ? rejections[count - 8]
            : null,
      delta: kind === 'REJECTED' && count === 8 ? -5000 : 0
    });
  }
  let n = 0;
  for (const r of rows) {
    const lease = base.leaseById.get(r.p.lease_id as string);
    if (!lease) continue;
    const op = pickOne(rng, OPERATORS);
    const ref = `${op.prefix}${between(rng, 100000000, 999999999)}`;
    const paidAt = noonUtc(r.p.succeeded_at ?? r.p.initiated_at);
    const amount = Number(r.p.amount) + r.delta;
    const phone = phone10(rng);
    const stored = await proofFor(lease.number, lease.renterName, op, amount, ref, paidAt, phone);
    const reviewedAt = r.status === 'APPROVED' || r.status === 'REJECTED' ? plusDays(paidAt, 1) : null;
    await prisma.rentalPaymentDeclaration.create({
      data: {
        tenant_id: tenantId,
        lease_id: lease.id,
        installment_id: r.p.allocations[0].installment_id,
        declared_by: r.p.renter_client_id as string,
        amount: new Prisma.Decimal(amount),
        payment_date: paidAt,
        payment_method: 'MOBILE_MONEY',
        mobile_operator: op.op,
        transaction_phone: phone,
        reference: ref,
        proof_file_url: stored.fileUrl,
        status: r.status,
        reviewed_by: reviewedAt ? pickOne(rng, base.signers).id : null,
        reviewed_at: reviewedAt,
        review_notes: r.review,
        notes: r.status === 'CANCELED' ? 'Déclaration en doublon, annulée par le locataire.' : r.note,
        created_at: paidAt,
        updated_at: reviewedAt ?? paidAt
      }
    });
    n += 1;
  }
  log(`déclarations de paiement : ${n} déclarations ajoutées (preuves complétées : ${bare.length}).`);
}

// ───────────────────────────────────────────────── liens sécurisés des relevés

export async function seedStatementLinks(base: LocatifBase): Promise<void> {
  const { prisma, tenantId, rng, end, log } = base.ctx;
  const existing = await prisma.secureLink.count({ where: { tenantId, scope: 'OWNER_MONTHLY_REPORT' } });
  if (existing > 0) {
    log('liens de relevés propriétaires : déjà présents, bloc sauté.');
    return;
  }
  const statements = await prisma.ownerStatement.findMany({
    where: { tenantId, status: { in: ['SENT', 'PAID'] }, sentAt: { not: null } },
    orderBy: { sentAt: 'desc' },
    take: 36,
    select: { id: true, sentAt: true, status: true }
  });
  let n = 0;
  for (const st of statements) {
    const sentAt = st.sentAt as Date;
    const expiresAt = plusDays(sentAt, 30);
    const expired = expiresAt.getTime() < end.getTime();
    const revoked = !expired && n % 9 === 4;
    await prisma.secureLink.create({
      data: {
        tenantId,
        scope: 'OWNER_MONTHLY_REPORT',
        objectType: 'OwnerStatement',
        objectId: st.id,
        tokenHash: hashToken(generateToken()),
        expiresAt,
        revokedAt: revoked ? plusDays(sentAt, 6) : null,
        createdByUserId: pickOne(rng, base.signers).id,
        viewCount: st.status === 'PAID' ? between(rng, 1, 5) : between(rng, 0, 2),
        lastViewedAt: st.status === 'PAID' ? plusDays(sentAt, between(rng, 0, 5)) : null,
        createdAt: sentAt,
        updatedAt: sentAt
      }
    });
    n += 1;
  }
  log(`liens de relevés propriétaires : ${n} liens sécurisés.`);
}
