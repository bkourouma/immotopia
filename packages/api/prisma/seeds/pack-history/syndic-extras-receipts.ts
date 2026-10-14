/**
 * Compléments SYNDIC — identité des documents (agences mandantes, logos,
 * cachets, signatures) et quittances / reçus de charges avec leurs vrais PDF.
 *
 * Les documents suivent les règles du lot S3 : une quittance par appel soldé,
 * un reçu pour un paiement qui laisse un reste dû, numérotation continue par
 * émetteur, type et année, snapshot figé, PDF rangé en privé sous
 * `syndics/<copropriété>/quittances/<id>.pdf`. Aucun e-mail ne part : l'historique
 * d'envoi est écrit tel quel.
 */
import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { neutralizeOutbound } from './types';
import { drawLogo, drawSignature, drawStamp } from './syndic-extras-images';
import { addDays, between, chunk, num, pickOne, type SyndicEnv } from './syndic-extras-common';

// ─────────────────────────────────────────────────────────── mandants et images

const MANDANTS = [
  {
    name: 'Groupe Immobilier Plateau Invest',
    legalName: 'Plateau Invest Holding SA',
    address: 'Plateau, immeuble Alpha 2000, 11e étage, Abidjan',
    phone: '+225 27 20 21 45 67',
    email: 'gestion@plateau-invest.test',
    rccm: 'CI-ABJ-2009-B-04512',
    taxId: '0912345 B'
  },
  {
    name: 'SCI Marcory Résidences',
    legalName: 'Société Civile Immobilière Marcory Résidences',
    address: 'Marcory Zone 4C, rue Pierre et Marie Curie, Abidjan',
    phone: '+225 27 21 26 88 14',
    email: 'direction@marcory-residences.test',
    rccm: 'CI-ABJ-2014-B-11873',
    taxId: '1419876 D'
  },
  {
    name: 'Cabinet Foncier Riviera',
    legalName: 'Cabinet Foncier Riviera SARL',
    address: 'Cocody Riviera 3, carrefour Duncan, Abidjan',
    phone: '+225 27 22 49 31 05',
    email: 'mandats@foncier-riviera.test',
    rccm: 'CI-ABJ-2021-B-20988',
    taxId: '2120988 H'
  }
] as const;

export async function seedMandantsAndBranding(env: SyndicEnv): Promise<void> {
  const { prisma, tenantId } = env;
  const { saveBrandingImage } = await import('../../../src/lib/documents/branding-storage');

  // Agences mandantes : seulement si l'agence n'en a aucune.
  const existing = await prisma.syndicMandatingAgency.count({ where: { tenantId } });
  if (existing === 0) {
    const created: Array<{ id: string; index: number }> = [];
    for (let i = 0; i < MANDANTS.length; i++) {
      const m = MANDANTS[i];
      const row = await prisma.syndicMandatingAgency.create({
        data: { tenantId, ...m, createdAt: addDays(env.start, 20 + i * 140) },
        select: { id: true }
      });
      created.push({ id: row.id, index: i });
      const logo = await saveBrandingImage(tenantId, ['mandants', row.id], 'logo', drawLogo(i + 1, 3 + (i % 2)), 'png');
      const data: Prisma.SyndicMandatingAgencyUpdateInput = { logoPath: logo };
      if (i < 2) {
        data.signaturePath = await saveBrandingImage(
          tenantId,
          ['mandants', row.id],
          'signature',
          drawSignature(i + 1),
          'png'
        );
        data.stampPath = await saveBrandingImage(tenantId, ['mandants', row.id], 'cachet', drawStamp(i), 'png');
      }
      await prisma.syndicMandatingAgency.update({ where: { id: row.id }, data });
    }
    // les deux plus grandes copropriétés sont gérées pour le compte d'un mandant
    const bySize = [...env.syndicates].sort((a, b) => b.totalLots - a.totalLots);
    for (let k = 0; k < Math.min(2, bySize.length); k++) {
      const target = bySize[k];
      if (target.mandatingAgencyId) continue;
      await prisma.syndicate.update({ where: { id: target.id }, data: { mandatingAgencyId: created[k].id } });
      target.mandatingAgencyId = created[k].id;
    }
    env.log(`syndic-extras identité : ${created.length} agences mandantes (2 copropriétés rattachées)`);
  }

  // Logo de chaque copropriété (clé privée) ; identité de l'agence (signature, cachet).
  let logos = 0;
  for (let i = 0; i < env.syndicates.length; i++) {
    const s = env.syndicates[i];
    const row = await prisma.syndicate.findUnique({ where: { id: s.id }, select: { logoPath: true } });
    if (row?.logoPath) continue;
    const key = await saveBrandingImage(tenantId, ['syndics', s.id], 'logo', drawLogo(i + 3, 2 + (i % 3)), 'png');
    await prisma.syndicate.update({ where: { id: s.id }, data: { logoPath: key } });
    logos++;
  }
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { documentSignaturePath: true, documentStampPath: true }
  });
  const agency: Prisma.TenantUpdateInput = {};
  if (!tenant?.documentSignaturePath)
    agency.documentSignaturePath = await saveBrandingImage(tenantId, ['agence'], 'signature', drawSignature(4), 'png');
  if (!tenant?.documentStampPath)
    agency.documentStampPath = await saveBrandingImage(tenantId, ['agence'], 'cachet', drawStamp(2), 'png');
  if (Object.keys(agency).length > 0) await prisma.tenant.update({ where: { id: tenantId }, data: agency });
  if (logos > 0 || Object.keys(agency).length > 0)
    env.log(
      `syndic-extras identité : ${logos} logo(s) de copropriété, ${Object.keys(agency).length} image(s) d’agence`
    );
}

// ─────────────────────────────────────────────────────────── quittances et reçus

const METHOD_KEY: Record<string, string> = {
  BANK_TRANSFER: 'VIREMENT',
  CHECK: 'CHEQUE',
  MOBILE_MONEY: 'MOBILE_MONEY',
  CASH: 'ESPECES'
};
const LOT_TYPE: Record<string, string> = {
  APARTMENT: 'Appartement',
  PARKING: 'Parking',
  CELLAR: 'Cave',
  OFFICE: 'Bureau',
  COMMERCIAL: 'Local commercial',
  OTHER: 'Autre'
};

const cents = (n: number): number => Math.round(n * 100);
const money = (c: number): number => c / 100;
const isoDay = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);

interface PendingDoc {
  id: string;
  syndicateId: string;
  lotId: string;
  contactId: string | null;
  issuerKey: string;
  kind: 'QUITTANCE' | 'RECEIPT';
  issuedAt: Date;
  chargeCallId: string | null;
  chargePaymentId: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  periodLabel: string | null;
  amount: number;
  currency: string;
  build: (number: string) => Record<string, unknown>;
}

interface SyndicIdentity {
  issuer: Record<string, unknown> & { key: string };
  images: { logo: string | null; signature: string | null; stamp: string | null };
}

export async function seedChargeReceipts(env: SyndicEnv): Promise<void> {
  neutralizeOutbound();
  const { prisma, tenantId, rng } = env;
  const { issuerFromMandant, issuerFromTenant, MANDANT_IDENTITY_SELECT, TENANT_IDENTITY_SELECT } =
    await import('../../../src/lib/documents/document-branding');

  const tenantRow = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { ...TENANT_IDENTITY_SELECT, logoUrl: true, documentSignaturePath: true, documentStampPath: true }
  });

  const pending: PendingDoc[] = [];
  const contexts = new Map<string, SyndicIdentity>();
  for (const s of env.syndicates) {
    const syn = await prisma.syndicate.findUnique({
      where: { id: s.id },
      select: {
        name: true,
        address: true,
        registrationNo: true,
        cadastralReference: true,
        mandatingAgencyId: true,
        mandatingAgency: {
          select: { ...MANDANT_IDENTITY_SELECT, logoPath: true, signaturePath: true, stampPath: true }
        }
      }
    });
    if (!syn) continue;
    const mandant = syn.mandatingAgency;
    const identity: SyndicIdentity =
      syn.mandatingAgencyId && mandant
        ? {
            issuer: { ...issuerFromMandant(mandant), key: syn.mandatingAgencyId },
            images: { logo: mandant.logoPath, signature: mandant.signaturePath, stamp: mandant.stampPath }
          }
        : {
            issuer: { ...issuerFromTenant(tenantRow), key: 'AGENCY' },
            images: {
              logo: tenantRow?.logoUrl ?? null,
              signature: tenantRow?.documentSignaturePath ?? null,
              stamp: tenantRow?.documentStampPath ?? null
            }
          };
    contexts.set(s.id, identity);
    const syndicateSnap = {
      name: syn.name,
      address: syn.address?.trim() || null,
      registrationNo: syn.registrationNo?.trim() || null,
      cadastralReference: syn.cadastralReference?.trim() || null
    };

    const lots = await prisma.syndicateLot.findMany({
      where: { syndicateId: s.id },
      select: {
        id: true,
        lotNumber: true,
        lotType: true,
        owner: { select: { id: true, firstName: true, lastName: true, legalName: true, address: true } },
        coowner: { select: { id: true, firstName: true, lastName: true, legalName: true, address: true } }
      }
    });
    const lotById = new Map(lots.map(l => [l.id, l]));
    const calls = await prisma.chargeCall.findMany({
      where: { syndicateId: s.id, amount: { gt: 0 } },
      select: {
        id: true,
        lotId: true,
        period: true,
        periodStart: true,
        periodEnd: true,
        amount: true,
        currency: true,
        dueDate: true,
        status: true,
        receipts: { select: { kind: true } },
        allocations: {
          select: {
            amount: true,
            source: true,
            paymentId: true,
            payment: {
              select: { id: true, paidAt: true, method: true, reference: true, amount: true, unallocatedAmount: true }
            }
          }
        }
      }
    });
    const payments = await prisma.chargePayment.findMany({
      where: { lot: { syndicateId: s.id } },
      select: {
        id: true,
        lotId: true,
        amount: true,
        unallocatedAmount: true,
        paidAt: true,
        method: true,
        reference: true,
        receipts: { select: { kind: true } }
      }
    });

    const baseOf = (lotId: string) => {
      const lot = lotById.get(lotId)!;
      const contact = lot.owner ?? lot.coowner ?? null;
      const name = contact
        ? [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || contact.legalName?.trim() || null
        : null;
      return {
        contactId: contact?.id ?? null,
        parts: {
          issuer: identity.issuer,
          issuerImages: identity.images,
          syndicate: syndicateSnap,
          lot: { number: lot.lotNumber, type: LOT_TYPE[lot.lotType] ?? lot.lotType, label: null },
          coowner: contact ? { name: name ?? 'Copropriétaire', address: contact.address?.trim() || null } : null
        }
      };
    };
    const periodOf = (c: { period: string; periodStart: Date | null; periodEnd: Date | null }) => ({
      label: c.period || null,
      start: isoDay(c.periodStart),
      end: isoDay(c.periodEnd)
    });
    const callById = new Map(calls.map(c => [c.id, c]));

    // règlements de chaque appel, dans l'ordre
    const orderedAllocs = new Map<string, Array<(typeof calls)[number]['allocations'][number]>>();
    for (const c of calls) {
      orderedAllocs.set(
        c.id,
        [...c.allocations].sort((a, b) => a.payment.paidAt.getTime() - b.payment.paidAt.getTime())
      );
    }

    // quittances : appels soldés sans quittance
    for (const c of calls) {
      if (c.receipts.some(r => r.kind === 'QUITTANCE')) continue;
      const allocs = orderedAllocs.get(c.id) ?? [];
      const paid = allocs.reduce((t, a) => t + cents(num(a.amount)), 0);
      if (allocs.length === 0 || paid < cents(num(c.amount))) continue;
      const issuedAt = allocs[allocs.length - 1].payment.paidAt;
      const base = baseOf(c.lotId);
      const amount = num(c.amount);
      pending.push({
        id: randomUUID(),
        syndicateId: s.id,
        lotId: c.lotId,
        contactId: base.contactId,
        issuerKey: identity.issuer.key,
        kind: 'QUITTANCE',
        issuedAt,
        chargeCallId: c.id,
        chargePaymentId: null,
        periodStart: c.periodStart,
        periodEnd: c.periodEnd,
        periodLabel: c.period || null,
        amount,
        currency: c.currency,
        build: number => ({
          version: 1,
          kind: 'QUITTANCE',
          number,
          issuedAt: issuedAt.toISOString(),
          currency: c.currency,
          amount,
          ...base.parts,
          call: { id: c.id, period: periodOf(c), amount, dueDate: c.dueDate.toISOString() },
          settlements: allocs.map(a => ({
            paidAt: a.payment.paidAt.toISOString(),
            method: METHOD_KEY[a.payment.method ?? ''] ?? a.payment.method ?? null,
            reference: a.payment.reference ?? null,
            amount: num(a.amount),
            source: a.source === 'ADVANCE' ? 'ADVANCE' : 'PAYMENT'
          })),
          settledAt: issuedAt.toISOString(),
          payment: null,
          allocations: [],
          outstandingAfter: 0,
          advance: 0,
          lotAdvanceBalance: 0,
          backfilled: false
        })
      });
    }

    // reçus : paiements qui laissent un reste dû, ou qui restent en avance
    for (const p of payments) {
      if (p.receipts.some(r => r.kind === 'RECEIPT')) continue;
      const touched = calls.filter(c => c.allocations.some(a => a.paymentId === p.id));
      const lines = touched.map(c => {
        const allocs = orderedAllocs.get(c.id) ?? [];
        const index = allocs.findIndex(a => a.paymentId === p.id);
        const paidUpTo = allocs.slice(0, index + 1).reduce((t, a) => t + cents(num(a.amount)), 0);
        const mine = cents(num(allocs[index].amount));
        return {
          chargeCallId: c.id,
          period: periodOf(c),
          callAmount: num(c.amount),
          allocated: money(mine),
          source: 'PAYMENT' as const,
          outstandingAfter: money(Math.max(0, cents(num(c.amount)) - paidUpTo))
        };
      });
      const advance = num(p.unallocatedAmount);
      const outstanding = lines.reduce((t, l) => t + cents(l.outstandingAfter), 0);
      if (lines.length > 0 && outstanding <= 0 && advance <= 0) continue;
      const base = baseOf(p.lotId);
      const amount = num(p.amount);
      const first = callById.get(lines[0]?.chargeCallId ?? '');
      pending.push({
        id: randomUUID(),
        syndicateId: s.id,
        lotId: p.lotId,
        contactId: base.contactId,
        issuerKey: identity.issuer.key,
        kind: 'RECEIPT',
        issuedAt: p.paidAt,
        chargeCallId: null,
        chargePaymentId: p.id,
        periodStart: first?.periodStart ?? null,
        periodEnd: first?.periodEnd ?? null,
        periodLabel: first?.period ?? null,
        amount,
        currency: 'XOF',
        build: number => ({
          version: 1,
          kind: 'RECEIPT',
          number,
          issuedAt: p.paidAt.toISOString(),
          currency: 'XOF',
          amount,
          ...base.parts,
          call: null,
          settlements: [],
          settledAt: null,
          payment: {
            id: p.id,
            amount,
            paidAt: p.paidAt.toISOString(),
            method: METHOD_KEY[p.method ?? ''] ?? p.method ?? null,
            reference: p.reference ?? null
          },
          allocations: lines,
          outstandingAfter: money(outstanding),
          advance,
          lotAdvanceBalance: advance,
          backfilled: false
        })
      });
    }
  }

  if (pending.length > 0) {
    // numérotation continue par émetteur, type et année (UTC), dans l'ordre chronologique
    const sequences = await prisma.syndicReceiptSequence.findMany({ where: { tenantId } });
    const counters = new Map(sequences.map(q => [`${q.issuerKey}|${q.kind}|${q.year}`, q.lastValue]));
    const touchedKeys = new Set<string>();
    pending.sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime());
    const rows: Prisma.SyndicChargeReceiptCreateManyInput[] = [];
    for (const d of pending) {
      const year = d.issuedAt.getUTCFullYear();
      const key = `${d.issuerKey}|${d.kind}|${year}`;
      const value = (counters.get(key) ?? 0) + 1;
      counters.set(key, value);
      touchedKeys.add(key);
      const number = `${d.kind === 'QUITTANCE' ? 'Q' : 'R'}-${year}-${String(value).padStart(6, '0')}`;
      const failed = rng() < 0.02;
      const emailCode = failed ? pickOne(rng, ['SMTP_REJECTED', 'TIMEOUT', 'ERROR'] as const) : null;
      rows.push({
        id: d.id,
        tenantId,
        syndicateId: d.syndicateId,
        lotId: d.lotId,
        contactId: d.contactId,
        kind: d.kind,
        number,
        issuerKey: d.issuerKey,
        chargePaymentId: d.chargePaymentId,
        chargeCallId: d.chargeCallId,
        periodStart: d.periodStart,
        periodEnd: d.periodEnd,
        periodLabel: d.periodLabel,
        amount: d.amount,
        currency: d.currency,
        snapshot: d.build(number) as unknown as Prisma.InputJsonValue,
        filePath: null,
        issuedAt: d.issuedAt,
        emailedAt: failed || !d.contactId ? null : new Date(d.issuedAt.getTime() + between(rng, 2, 9) * 60_000),
        emailErrorCode: emailCode,
        emailError:
          emailCode === 'SMTP_REJECTED'
            ? "Le serveur de messagerie a refusé l'e-mail."
            : emailCode === 'TIMEOUT'
              ? "Le serveur de messagerie n'a pas répondu à temps."
              : emailCode
                ? "L'envoi de l'e-mail a échoué."
                : null,
        createdById: env.adminId,
        createdAt: d.issuedAt
      });
    }
    for (const part of chunk(rows, 400)) await prisma.syndicChargeReceipt.createMany({ data: part });
    for (const key of touchedKeys) {
      const [issuerKey, kind, year] = key.split('|');
      await prisma.syndicReceiptSequence.upsert({
        where: {
          tenantId_issuerKey_kind_year: {
            tenantId,
            issuerKey,
            kind: kind as 'QUITTANCE' | 'RECEIPT',
            year: Number(year)
          }
        },
        create: {
          tenantId,
          issuerKey,
          kind: kind as 'QUITTANCE' | 'RECEIPT',
          year: Number(year),
          lastValue: counters.get(key)!
        },
        update: { lastValue: counters.get(key)! }
      });
    }
    env.log(
      `syndic-extras quittances : ${pending.filter(d => d.kind === 'QUITTANCE').length} quittances, ` +
        `${pending.filter(d => d.kind === 'RECEIPT').length} reçus numérotés`
    );
  }

  await renderMissingReceiptPdfs(env);
}

/** PDF réel de chaque document dont le fichier n'est pas encore rangé (reprise après interruption comprise). */
async function renderMissingReceiptPdfs(env: SyndicEnv): Promise<void> {
  const { prisma, tenantId } = env;
  const { runWithTenantContext } = await import('../../../src/utils/tenant-context');
  const delivery = await import('../../../src/lib/syndics/charge-receipt-delivery');
  const missing = await prisma.syndicChargeReceipt.findMany({
    where: { tenantId, filePath: null },
    select: delivery.STORED_RECEIPT_SELECT,
    orderBy: { issuedAt: 'asc' }
  });
  if (missing.length === 0) return;
  const started = Date.now();
  await runWithTenantContext({ tenantId, userId: env.adminId }, async () => {
    const contexts = new Map<string, Awaited<ReturnType<typeof delivery.loadSyndicateRenderContext>>>();
    for (const receipt of missing as unknown as Array<
      import('../../../src/lib/syndics/charge-receipt-delivery').StoredReceipt
    >) {
      let context = contexts.get(receipt.syndicateId);
      if (!context) {
        context = await delivery.loadSyndicateRenderContext(tenantId, receipt.syndicateId);
        contexts.set(receipt.syndicateId, context);
      }
      await delivery.ensureReceiptPdf(receipt, context);
    }
  });
  env.log(`syndic-extras quittances : ${missing.length} PDF écrits en ${Math.round((Date.now() - started) / 1000)} s`);
}
