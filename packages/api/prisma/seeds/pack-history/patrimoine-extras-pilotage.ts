/**
 * Pilotage du patrimoine : accès des tiers de confiance (notaire, comptable,
 * banquier) avec leur journal, actifs non immobiliers supplémentaires et leurs
 * valorisations, dettes, valorisations intermédiaires des biens, hypothèses de
 * rendement, profils fiscaux, charges récurrentes du plan de trésorerie,
 * scénarios de projection et réglages du portail propriétaire.
 *
 * Idempotent par bloc. Tout est écrit directement (aucun e-mail, aucun lien
 * envoyé : seules les lignes d'historique existent).
 */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { parseAssetDetails } from '../../../src/lib/patrimoine/assets/asset-classes';
import { scenarioBodySchema, type ScenarioBody } from '../../../src/lib/patrimoine/projection/schemas';
import { buildAuditRow } from '../../../src/services/audit-entry-builder';
import { AuditActionKey } from '../../../src/types/audit-types';
import { sha256 } from './patrimoine-extras-files';
import { author, byRef, type PatProperty, type PatState } from './patrimoine-extras-state';
import { addDays, between, monthsAgo, pick } from './types';

const roundTo = (value: number, step: number): number => Math.round(value / step) * step;
const DAY = 86_400_000;

// ------------------------------------------------------------------ accès des tiers de confiance

interface GrantDef {
  type: 'NOTARY' | 'ACCOUNTANT' | 'BANKER';
  name: string;
  email: string;
  sections: Array<'VALUATIONS' | 'YIELD_RATIOS' | 'LOANS' | 'EXPENSES' | 'RENTS' | 'DOCUMENTS' | 'TITLES_OWNERSHIP'>;
  createdDaysAgo: number;
  /** Jours avant (négatif) ou après (positif) maintenant ; null = permanent. */
  expiresInDays: number | null;
  revokedDaysAgo?: number;
  views: number;
  lastViewedDaysAgo?: number;
  linkSentDaysAgo?: number;
  scope: { props?: string[]; entities?: number[]; allProps?: boolean };
  docs?: boolean;
}

const GRANTS: readonly GrantDef[] = [
  {
    type: 'NOTARY',
    name: 'Étude de Maître Hortense Aka-Yao',
    email: 'etude.akayao@example.ci',
    sections: ['TITLES_OWNERSHIP', 'DOCUMENTS', 'VALUATIONS'],
    createdDaysAgo: 40,
    expiresInDays: 75,
    views: 4,
    lastViewedDaysAgo: 6,
    linkSentDaysAgo: 12,
    scope: { props: ['APP-ANGRE', 'VIL-RIVIERA', 'IMM-YOP'] },
    docs: true
  },
  {
    type: 'ACCOUNTANT',
    name: 'Cabinet Diomandé & Associés — expertise comptable',
    email: 'comptabilite.diomande@example.ci',
    sections: ['EXPENSES', 'RENTS', 'LOANS'],
    createdDaysAgo: 600,
    expiresInDays: null,
    views: 37,
    lastViewedDaysAgo: 3,
    linkSentDaysAgo: 5,
    scope: { entities: [0, 1], allProps: true }
  },
  {
    type: 'BANKER',
    name: 'Société Générale Côte d’Ivoire — M. Théodore Kouamé, chargé d’affaires',
    email: 'theodore.kouame@example.ci',
    sections: ['VALUATIONS', 'YIELD_RATIOS', 'LOANS'],
    createdDaysAgo: 21,
    expiresInDays: 4,
    views: 6,
    lastViewedDaysAgo: 1,
    linkSentDaysAgo: 18,
    scope: { props: ['VIL-RIVIERA', 'IMM-YOP', 'BUR-PLATEAU'] }
  },
  {
    type: 'BANKER',
    name: 'NSIA Banque — service des engagements',
    email: 'engagements@example.ci',
    sections: ['VALUATIONS', 'LOANS', 'RENTS'],
    createdDaysAgo: 150,
    expiresInDays: -60,
    views: 9,
    lastViewedDaysAgo: 70,
    linkSentDaysAgo: 140,
    scope: { props: ['IMM-YOP', 'ENT-VRIDI'] }
  },
  {
    type: 'NOTARY',
    name: 'Étude de Maître Brice Kouadio-Séka — dossier de succession',
    email: 'etude.kouadio@example.ci',
    sections: ['TITLES_OWNERSHIP', 'DOCUMENTS'],
    createdDaysAgo: 270,
    expiresInDays: -90,
    revokedDaysAgo: 150,
    views: 2,
    lastViewedDaysAgo: 200,
    linkSentDaysAgo: 265,
    scope: { props: ['DUP-BONOUMIN', 'APP-KOUMASSI', 'APP-ANGRE'] },
    docs: true
  },
  {
    type: 'ACCOUNTANT',
    name: 'Fiduciaire Bamba — clôture de l’exercice',
    email: 'fiduciaire.bamba@example.ci',
    sections: ['EXPENSES', 'RENTS'],
    createdDaysAgo: 330,
    expiresInDays: -240,
    views: 12,
    lastViewedDaysAgo: 245,
    linkSentDaysAgo: 320,
    scope: { entities: [1], props: ['BOU-TREICH', 'BUR-PLATEAU'] }
  },
  {
    type: 'BANKER',
    name: 'Ecobank Côte d’Ivoire — dossier de refinancement',
    email: 'refinancement@example.ci',
    sections: ['VALUATIONS', 'YIELD_RATIOS', 'LOANS', 'RENTS'],
    createdDaysAgo: 10,
    expiresInDays: 30,
    views: 0,
    linkSentDaysAgo: 9,
    scope: { entities: [0] }
  }
];

export async function seedExternalAccess(s: PatState): Promise<void> {
  const { prisma, tenantId, end, log, rng } = s.ctx;
  if ((await prisma.externalAccessGrant.count({ where: { tenantId } })) > 0) return;
  const entities = await prisma.holdingEntity.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
    select: { id: true }
  });
  const docs = await prisma.propertyDocument.findMany({
    where: { tenantId, documentType: { in: ['TITLE_DEED', 'LAND_CONCESSION', 'NOTARIAL_DEED'] } },
    select: { id: true, propertyId: true }
  });
  const users = await prisma.user.findMany({ where: { id: { in: s.staff } }, select: { id: true, fullName: true } });
  const nameOf = (id: string): string | null => users.find(u => u.id === id)?.fullName ?? null;
  const ago = (days: number): Date => new Date(end.getTime() - days * DAY);

  const audit: Prisma.AuditLogUncheckedCreateInput[] = [];
  let grantCount = 0;
  let linkCount = 0;
  const entry = (
    actionKey: string,
    grantId: string,
    when: Date,
    actor: string | null,
    payload: Record<string, unknown>,
    extra: { ip?: string; ua?: string } = {}
  ): void => {
    audit.push(
      buildAuditRow(
        {
          actorUserId: actor,
          actorLabel: actor ? nameOf(actor) : null,
          tenantId,
          actionKey,
          entityType: 'ExternalAccessGrant',
          entityId: grantId,
          ipAddress: extra.ip ?? null,
          userAgent: extra.ua ?? null,
          payload,
          createdAt: when,
          source: 'seed'
        },
        undefined
      )
    );
  };

  for (const def of GRANTS) {
    const propIds = new Set<string>();
    for (const ref of def.scope.props ?? []) {
      const p = byRef(s, ref);
      if (p) propIds.add(p.id);
    }
    const entityIds = (def.scope.entities ?? []).map(i => entities[i]?.id).filter((x): x is string => Boolean(x));
    if (def.scope.allProps || (def.scope.entities && entityIds.length === 0 && propIds.size === 0)) {
      s.properties.slice(0, def.scope.allProps && entityIds.length > 0 ? 0 : 10).forEach(p => propIds.add(p.id));
    }
    if (propIds.size === 0 && entityIds.length === 0) continue;

    const id = randomUUID();
    const createdAt = ago(def.createdDaysAgo);
    const creator = author(s);
    const expiresAt = def.expiresInDays === null ? null : new Date(end.getTime() + def.expiresInDays * DAY);
    const revokedAt = def.revokedDaysAgo ? ago(def.revokedDaysAgo) : null;
    const lastViewedAt = def.lastViewedDaysAgo !== undefined ? ago(def.lastViewedDaysAgo) : null;
    const linkSent = def.linkSentDaysAgo !== undefined ? ago(def.linkSentDaysAgo) : null;
    await prisma.externalAccessGrant.create({
      data: {
        id,
        tenantId,
        type: def.type,
        recipientName: def.name,
        recipientEmail: def.email,
        sections: def.sections,
        expiresAt,
        revokedAt,
        createdByUserId: creator,
        viewCount: def.views,
        lastViewedAt,
        lastLinkSentAt: linkSent,
        createdAt
      }
    });
    grantCount += 1;
    if (propIds.size > 0) {
      await prisma.externalAccessGrantProperty.createMany({
        data: [...propIds].map(propertyId => ({ tenantId, grantId: id, propertyId, createdAt }))
      });
    }
    if (entityIds.length > 0) {
      await prisma.externalAccessGrantEntity.createMany({
        data: entityIds.map(entityId => ({ tenantId, grantId: id, entityId, createdAt }))
      });
    }
    if (def.docs) {
      const scoped = docs.filter(d => propIds.has(d.propertyId));
      if (scoped.length > 0) {
        await prisma.externalAccessGrantDocument.createMany({
          data: scoped.map(d => ({ tenantId, grantId: id, propertyId: d.propertyId, documentId: d.id, createdAt }))
        });
      }
    }

    // Liens sécurisés : jamais de jeton en clair, seulement l'empreinte.
    const links: Array<{
      n: number;
      createdAt: Date;
      expiresAt: Date;
      revokedAt: Date | null;
      views: number;
      last: Date | null;
    }> = [];
    if (linkSent) {
      const linkExp = new Date(Math.min(expiresAt ? expiresAt.getTime() : Infinity, linkSent.getTime() + 30 * DAY));
      links.push({
        n: 1,
        createdAt: linkSent,
        expiresAt: linkExp,
        revokedAt: revokedAt && revokedAt.getTime() < linkExp.getTime() ? revokedAt : null,
        views: def.views,
        last: lastViewedAt
      });
    }
    if (def.createdDaysAgo > 100 && def.expiresInDays === null) {
      links.unshift({ n: 0, createdAt: ago(200), expiresAt: ago(170), revokedAt: null, views: 20, last: ago(175) });
    }
    for (const l of links) {
      const row = await prisma.secureLink.create({
        data: {
          tenantId,
          scope: 'EXTERNAL_ACCESS_GRANT',
          objectType: 'ExternalAccessGrant',
          objectId: id,
          tokenHash: sha256(Buffer.from(`pack-history:${id}:link:${l.n}`)),
          expiresAt: l.expiresAt,
          revokedAt: l.revokedAt,
          createdByUserId: creator,
          viewCount: l.views,
          lastViewedAt: l.last,
          createdAt: l.createdAt
        },
        select: { id: true }
      });
      linkCount += 1;
      entry(AuditActionKey.SECURE_LINK_CREATED, id, l.createdAt, creator, {
        linkId: row.id,
        scope: 'EXTERNAL_ACCESS_GRANT'
      });
      entry(AuditActionKey.EXTERNAL_ACCESS_GRANT_LINK_SENT, id, l.createdAt, creator, { grantId: id, linkId: row.id });
      // Consultations réparties entre l'envoi du lien et la dernière lecture.
      const from = l.createdAt.getTime() + 3_600_000;
      const to = (l.last ?? l.createdAt).getTime();
      for (let v = 0; v < l.views; v++) {
        const when = new Date(from + ((to - from) * (v + 1)) / Math.max(1, l.views));
        entry(
          AuditActionKey.EXTERNAL_ACCESS_GRANT_VIEWED,
          id,
          when,
          null,
          { grantId: id, linkId: row.id, sections: def.sections },
          {
            ip: `41.207.${between(rng, 1, 254)}.${between(rng, 1, 254)}`,
            ua: pick(rng, [
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
              'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
            ])
          }
        );
      }
    }
    entry(AuditActionKey.EXTERNAL_ACCESS_GRANT_CREATED, id, createdAt, creator, {
      grantId: id,
      type: def.type,
      sections: def.sections
    });
    if (def.docs && def.views > 0) {
      for (let k = 0; k < Math.min(3, def.views); k++) {
        entry(
          AuditActionKey.EXTERNAL_ACCESS_GRANT_DOCUMENT_DOWNLOADED,
          id,
          addDays(lastViewedAt ?? createdAt, -k),
          null,
          { grantId: id },
          { ip: `41.207.${between(rng, 1, 254)}.${between(rng, 1, 254)}` }
        );
      }
    }
    if (revokedAt) entry(AuditActionKey.EXTERNAL_ACCESS_GRANT_REVOKED, id, revokedAt, creator, { grantId: id });
  }
  if (audit.length > 0) await prisma.auditLog.createMany({ data: audit });
  log(
    `patrimoine-extras : ${grantCount} accès tiers, ${linkCount} lien(s) sécurisé(s), ${audit.length} ligne(s) de journal.`
  );
}

// ------------------------------------------------------------------ actifs supplémentaires (Pro)

interface ExtraAsset {
  name: string;
  assetClass: Prisma.AssetCreateManyInput['assetClass'];
  details: Record<string, unknown>;
  cost: number | null;
  acqAgo: number;
  status?: 'ACTIVE' | 'DISPOSED';
  disposedAgo?: number;
  entity?: number;
  /** Absent : les deux packs ; sinon réservé à Essentiel (ESS) ou à Pro (PRO). */
  only?: 'ESS' | 'PRO';
  method: Prisma.AssetValuationCreateManyInput['method'];
  source: string;
  step: number;
  /** Valeur à `m` mois avant maintenant. */
  value: (m: number, acqAgo: number) => number;
}

const cagr = (base: number, rate: number, yearsElapsed: number): number => base * Math.pow(1 + rate, yearsElapsed);

export async function seedExtraAssets(s: PatState): Promise<void> {
  const { prisma, tenantId, end, log, rng } = s.ctx;
  const existing = new Set(
    (await prisma.asset.findMany({ where: { tenantId }, select: { name: true } })).map(a => a.name)
  );
  if (!s.isPro) await seedEssentialEntities(s);
  const entities = await prisma.holdingEntity.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
    select: { id: true }
  });
  const year = end.getFullYear();
  const stockQty = [2000, 1800, 1500, 1700, 1400, 1200];
  const extras: ExtraAsset[] = [
    {
      name: 'Compte courant Bank of Africa',
      only: 'ESS',
      assetClass: 'CASH',
      details: { institution: 'Bank of Africa Côte d’Ivoire', cashKind: 'BANK', accountLast4: '5530' },
      cost: null,
      acqAgo: 48,
      method: 'BALANCE',
      source: 'Relevé bancaire',
      step: 3,
      value: m => roundTo(4_200_000 * (1.1 - m * 0.003) * (0.8 + rng() * 0.4), 10_000)
    },
    {
      name: 'Orange Money — compte personnel',
      only: 'ESS',
      assetClass: 'CASH',
      details: { institution: 'Orange Money', cashKind: 'MOBILE_MONEY', accountLast4: '0764' },
      cost: null,
      acqAgo: 40,
      method: 'BALANCE',
      source: 'Solde saisi',
      step: 3,
      value: () => roundTo(between(rng, 200, 1_400) * 1000, 10_000)
    },
    {
      name: 'Assurance-vie NSIA Vie',
      only: 'ESS',
      assetClass: 'SAVINGS_INVESTMENT',
      details: {
        savingsKind: 'LIFE_INSURANCE',
        organization: 'NSIA Vie Assurances',
        expectedRatePercent: 5,
        principal: 12_000_000
      },
      cost: 12_000_000,
      acqAgo: 36,
      method: 'ACCRUED_SAVINGS',
      source: 'Relevé annuel NSIA Vie',
      step: 12,
      value: (m, a) => roundTo(12_000_000 * Math.pow(1.05, (a - m) / 12), 1_000)
    },
    {
      name: 'Toyota RAV4 2022',
      only: 'ESS',
      assetClass: 'VEHICLE_EQUIPMENT',
      details: {
        kind: 'Véhicule de tourisme',
        brand: 'Toyota',
        model: 'RAV4',
        year: year - 4,
        registration: '7712 HB 01',
        usefulLifeYears: 8,
        residualValuePercent: 10,
        depreciationMethod: 'LINEAR'
      },
      cost: 21_000_000,
      acqAgo: 30,
      method: 'DEPRECIATION_LINEAR',
      source: 'Facture concessionnaire',
      step: 6,
      value: (m, a) => Math.round(Math.max(2_100_000, 21_000_000 - ((21_000_000 - 2_100_000) / 8) * ((a - m) / 12)))
    },
    {
      name: 'Wave — compte marchand',
      assetClass: 'CASH',
      details: { institution: 'Wave Côte d’Ivoire', cashKind: 'MOBILE_MONEY', accountLast4: '3377' },
      cost: null,
      acqAgo: 34,
      method: 'BALANCE',
      source: 'Solde saisi',
      step: 3,
      value: m => roundTo(900_000 * (1.2 - m * 0.005) * (0.85 + rng() * 0.35), 10_000)
    },
    {
      name: 'Caisse de l’immeuble — espèces',
      only: 'PRO',
      assetClass: 'CASH',
      details: { institution: 'Caisse du propriétaire', cashKind: 'CASH_ON_HAND' },
      cost: null,
      acqAgo: 30,
      method: 'BALANCE',
      source: 'Comptage de caisse',
      step: 6,
      value: () => roundTo(between(rng, 150, 900) * 1000, 10_000)
    },
    {
      name: 'Bons du Trésor assimilables 3 ans',
      assetClass: 'SAVINGS_INVESTMENT',
      details: {
        savingsKind: 'PLACEMENT',
        organization: 'Trésor public — Atlantique Finance (SGI)',
        expectedRatePercent: 6.2,
        principal: 15_000_000
      },
      cost: 15_000_000,
      acqAgo: 30,
      method: 'ACCRUED_SAVINGS',
      source: 'Relevé de la société de gestion',
      step: 6,
      value: (m, a) => roundTo(15_000_000 * Math.pow(1.062, (a - m) / 12), 1_000)
    },
    {
      name: 'Tontine des commerçants du Plateau',
      assetClass: 'SAVINGS_INVESTMENT',
      details: {
        savingsKind: 'TONTINE',
        organization: 'Association des commerçants du Plateau',
        expectedRatePercent: 0
      },
      cost: null,
      acqAgo: 28,
      method: 'MANUAL',
      source: 'Carnet de la tontine',
      step: 4,
      value: (m, a) => 250_000 * Math.max(1, Math.round(a - m))
    },
    {
      name: 'Stock de matériaux de construction',
      only: 'PRO',
      assetClass: 'INVENTORY',
      details: {
        designation: 'Ciment CPJ 35 (sacs de 50 kg)',
        quantity: 1200,
        unit: 'sac',
        unitCost: 5_800,
        writeDownPercent: 5
      },
      cost: 1200 * 5_800,
      acqAgo: 20,
      entity: 1,
      method: 'UNIT_COST',
      source: 'Inventaire du magasin',
      step: 4,
      value: m => Math.round((m <= 1 ? stockQty[5] : stockQty[Math.min(4, Math.floor((20 - m) / 4))]) * 5_800 * 0.95)
    },
    {
      name: 'Collection d’œuvres d’art ivoiriennes',
      assetClass: 'MOVABLE',
      details: { designation: 'Sculptures baoulé et toiles contemporaines', category: 'Art' },
      cost: 9_000_000,
      acqAgo: 40,
      method: 'EXPERT_APPRAISAL',
      source: 'Expertise de la galerie d’art du Plateau',
      step: 12,
      value: (m, a) => roundTo(cagr(9_000_000, 0.06, (a - m) / 12), 100_000)
    },
    {
      name: 'Matériel informatique et mobilier de bureau',
      only: 'PRO',
      assetClass: 'MOVABLE',
      details: { designation: 'Postes de travail, serveur et mobilier', category: 'Équipement de bureau' },
      cost: 4_200_000,
      acqAgo: 26,
      entity: 1,
      method: 'MANUAL',
      source: 'Inventaire des immobilisations',
      step: 12,
      value: (m, a) => roundTo(4_200_000 * (1 - 0.18 * ((a - m) / 12)), 50_000)
    },
    {
      name: 'Droit au bail et fonds de commerce — pharmacie du Plateau',
      only: 'PRO',
      assetClass: 'OTHER',
      details: { label: 'Droit au bail commercial et clientèle' },
      cost: 12_000_000,
      acqAgo: 36,
      method: 'MANUAL',
      source: 'Évaluation par l’expert-comptable',
      step: 12,
      value: (m, a) => roundTo(cagr(12_000_000, 0.04, (a - m) / 12), 100_000)
    },
    {
      name: 'Groupe électrogène 60 kVA',
      only: 'PRO',
      assetClass: 'VEHICLE_EQUIPMENT',
      details: {
        kind: 'Équipement',
        brand: 'Perkins',
        model: '60 kVA',
        year: year - 2,
        usefulLifeYears: 10,
        residualValuePercent: 10,
        depreciationMethod: 'LINEAR'
      },
      cost: 11_500_000,
      acqAgo: 24,
      entity: 1,
      method: 'DEPRECIATION_LINEAR',
      source: 'Facture du fournisseur',
      step: 6,
      value: (m, a) => Math.round(Math.max(1_150_000, 11_500_000 - ((11_500_000 - 1_150_000) / 10) * ((a - m) / 12)))
    },
    {
      name: 'Renault Duster 2018 (vendu)',
      only: 'PRO',
      assetClass: 'VEHICLE_EQUIPMENT',
      details: {
        kind: 'Véhicule utilitaire',
        brand: 'Renault',
        model: 'Duster',
        year: 2018,
        registration: '2290 FD 01',
        usefulLifeYears: 8,
        residualValuePercent: 10,
        depreciationMethod: 'LINEAR'
      },
      cost: 12_000_000,
      acqAgo: 36,
      status: 'DISPOSED',
      disposedAgo: 7,
      method: 'DEPRECIATION_LINEAR',
      source: 'Facture concessionnaire',
      step: 6,
      value: (m, a) => Math.round(Math.max(1_200_000, 12_000_000 - ((12_000_000 - 1_200_000) / 8) * ((a - m) / 12)))
    },
    {
      name: 'Élevage de poulets de chair de Bingerville',
      only: 'PRO',
      assetClass: 'AGRICULTURE',
      details: { agricultureKind: 'LIVESTOCK', headcount: 4000, unitValue: 3_500 },
      cost: 9_000_000,
      acqAgo: 22,
      method: 'UNIT_VALUE',
      source: 'Comptage du vétérinaire',
      step: 3,
      value: m => (m % 6 === 1 ? 4000 : 3000 + ((m * 137) % 8) * 100) * 3_500
    }
  ];

  let assets = 0;
  let valuations = 0;
  for (const e of extras) {
    if (e.only === (s.isPro ? 'ESS' : 'PRO')) continue;
    if (existing.has(e.name)) continue;
    const checked = parseAssetDetails(e.assetClass as string, e.details);
    if (!checked.success)
      throw new Error(`patrimoine-extras : détails invalides pour « ${e.name} » : ${JSON.stringify(checked.issues)}`);
    const id = randomUUID();
    const acqAgo = Math.min(e.acqAgo, 60);
    const acqDate = monthsAgo(end, acqAgo);
    await prisma.asset.create({
      data: {
        id,
        tenantId,
        name: e.name,
        assetClass: e.assetClass,
        status: e.status ?? 'ACTIVE',
        currency: 'XOF',
        acquisitionCost: e.cost,
        acquisitionDate: e.cost === null ? null : acqDate,
        disposedAt: e.disposedAgo ? monthsAgo(end, e.disposedAgo) : null,
        holdingEntityId: e.entity !== undefined ? (entities[e.entity]?.id ?? null) : null,
        details: e.details as Prisma.InputJsonValue,
        detailsVersion: 2,
        createdByUserId: author(s),
        createdAt: acqDate
      }
    });
    assets += 1;
    // Relevés : de l'acquisition (ou du début de l'histoire) jusqu'au dernier mois (ou à la cession).
    const first = Math.min(acqAgo, 36);
    const last = e.disposedAgo ?? 1;
    const points: number[] = [];
    for (let m = first; m >= last; m -= e.step) points.push(m);
    if (points[points.length - 1] !== last) points.push(last);
    const rows: Prisma.AssetValuationCreateManyInput[] = points.map((m, k) => ({
      tenantId,
      assetId: id,
      valuatedAt: m === acqAgo && e.cost !== null ? acqDate : monthsAgo(end, m),
      estimatedValue: Math.max(100_000, e.value(m, acqAgo)),
      currency: 'XOF',
      acquisitionCost: k === 0 ? e.cost : null,
      acquisitionDate: k === 0 && e.cost !== null ? acqDate : null,
      method: e.method,
      source: e.source,
      reliability: e.method === 'BALANCE' || e.method === 'EXPERT_APPRAISAL' ? 'HIGH' : 'MEDIUM',
      reliabilityReasons: []
    }));
    await prisma.assetValuation.createMany({ data: rows });
    valuations += rows.length;
  }
  log(`patrimoine-extras : ${assets} actif(s) non immobilier(s) ajouté(s), ${valuations} valorisation(s).`);
}

/** Essentiel : le titulaire (personne physique) et sa SCI familiale détiennent les biens, comme un particulier structuré. */
async function seedEssentialEntities(s: PatState): Promise<void> {
  const { prisma, tenantId, end, log } = s.ctx;
  if ((await prisma.holdingEntity.count({ where: { tenantId } })) > 0) return;
  const personId = randomUUID();
  const sciId = randomUUID();
  const created = monthsAgo(end, 84);
  await prisma.holdingEntity.createMany({
    data: [
      {
        id: personId,
        tenantId,
        name: `${s.ownerName} (personne physique)`,
        legalForm: 'INDIVIDUAL',
        country: 'CI',
        createdByUserId: s.ctx.adminUserId,
        createdAt: created
      },
      {
        id: sciId,
        tenantId,
        name: 'SCI Famille Kouassi',
        legalForm: 'SCI',
        country: 'CI',
        rccm: 'CI-ABJ-2020-B-30512',
        taxId: '2012345 C',
        createdByUserId: s.ctx.adminUserId,
        createdAt: created
      }
    ]
  });
  await prisma.propertyHolding.createMany({
    data: s.properties.map(p => ({
      tenantId,
      propertyId: p.id,
      entityId: ['PAT-APP-ANGRE', 'PAT-VIL-BINGER'].includes(p.ref) ? sciId : personId,
      sharePercent: 100,
      effectiveFrom: p.createdAt,
      updatedByUserId: s.ctx.adminUserId
    }))
  });
  log('patrimoine-extras : 2 entité(s) de détention (personne physique, SCI familiale) et leurs parts.');
}

// ------------------------------------------------------------------ dettes supplémentaires

function annuity(capital: number, ratePct: number, months: number): number {
  const r = ratePct / 1200;
  return r === 0 ? capital / months : (capital * r) / (1 - Math.pow(1 + r, -months));
}
function remaining(capital: number, ratePct: number, months: number, paid: number): number {
  const r = ratePct / 1200;
  if (paid >= months) return 0;
  if (r === 0) return capital * (1 - paid / months);
  const g = Math.pow(1 + r, months);
  return (capital * (g - Math.pow(1 + r, paid))) / (g - 1);
}

export async function seedExtraLoans(s: PatState): Promise<void> {
  const { prisma, tenantId, end, log } = s.ctx;
  const plateau = byRef(s, 'BUR-PLATEAU');
  const hilux = s.isPro
    ? await prisma.asset.findFirst({ where: { tenantId, name: 'Pick-up Toyota Hilux' }, select: { id: true } })
    : null;
  const defs: Array<{
    propertyId?: string;
    assetId?: string;
    lender: string;
    capital: number;
    rate: number;
    years: number;
    startAgo: number;
  }> = [];
  if (plateau)
    defs.push({
      propertyId: plateau.id,
      lender: 'Bank of Africa Côte d’Ivoire',
      capital: 40_000_000,
      rate: 9,
      years: 10,
      startAgo: 30
    });
  if (hilux)
    defs.push({
      assetId: hilux.id,
      lender: 'Société Générale Côte d’Ivoire',
      capital: 18_000_000,
      rate: 9.5,
      years: 5,
      startAgo: 34
    });
  if (s.isPro)
    defs.push({ lender: 'Prêt familial (sans intérêt)', capital: 8_000_000, rate: 0, years: 4, startAgo: 14 });
  let created = 0;
  for (const d of defs) {
    const known = await prisma.propertyLoan.findFirst({
      where: { tenantId, lender: d.lender, capitalAmount: d.capital },
      select: { id: true }
    });
    if (known) continue;
    const months = d.years * 12;
    await prisma.propertyLoan.create({
      data: {
        tenantId,
        propertyId: d.propertyId ?? null,
        assetId: d.assetId ?? null,
        lender: d.lender,
        capitalAmount: d.capital,
        remainingCapital: Math.round(remaining(d.capital, d.rate, months, d.startAgo)),
        interestRate: d.rate,
        monthlyPayment: Math.round(annuity(d.capital, d.rate, months)),
        currency: 'XOF',
        startDate: monthsAgo(end, d.startAgo),
        endDate: monthsAgo(end, d.startAgo - months),
        status: 'ACTIVE',
        createdAt: monthsAgo(end, d.startAgo)
      }
    });
    created += 1;
  }
  if (created > 0) log(`patrimoine-extras : ${created} dette(s) ajoutée(s) (bien, actif et dette personnelle).`);
}

// ------------------------------------------------------------------ valorisations intermédiaires des biens

export async function seedIntermediateValuations(s: PatState): Promise<void> {
  const { prisma, tenantId, end, log } = s.ctx;
  let added = 0;
  const expertRefs = new Set(['PAT-IMM-YOP', 'PAT-VIL-RIVIERA', 'PAT-BUR-PLATEAU', 'PAT-APP-ANGRE']);
  for (const p of s.properties) {
    const vals = await prisma.assetValuation.findMany({
      where: { tenantId, propertyId: p.id },
      orderBy: { valuatedAt: 'asc' },
      select: { valuatedAt: true, estimatedValue: true }
    });
    if (vals.length < 2) continue;
    for (const m of [30, 18, 6]) {
      const when = monthsAgo(end, m);
      if (when.getTime() <= p.createdAt.getTime()) continue;
      if (vals.some(v => Math.abs(v.valuatedAt.getTime() - when.getTime()) < 20 * DAY)) continue;
      const before = [...vals].reverse().find(v => v.valuatedAt.getTime() < when.getTime());
      const after = vals.find(v => v.valuatedAt.getTime() > when.getTime());
      if (!before || !after) continue;
      const t =
        (when.getTime() - before.valuatedAt.getTime()) / (after.valuatedAt.getTime() - before.valuatedAt.getTime());
      const value = roundTo(
        Number(before.estimatedValue) * Math.pow(Number(after.estimatedValue) / Number(before.estimatedValue), t),
        100_000
      );
      const expert = s.isPro && m === 18 && expertRefs.has(p.ref);
      await prisma.assetValuation.create({
        data: {
          tenantId,
          propertyId: p.id,
          valuatedAt: when,
          estimatedValue: value,
          currency: 'XOF',
          method: expert ? 'EXPERT_APPRAISAL' : 'MARKET_ESTIMATE',
          source: expert
            ? 'Cabinet Expertim CI — rapport d’expertise'
            : 'Estimation de marché (comparables du quartier)',
          reliability: expert ? 'HIGH' : 'MEDIUM',
          reliabilityReasons: []
        }
      });
      added += 1;
    }
  }
  if (added > 0) log(`patrimoine-extras : ${added} valorisation(s) intermédiaire(s) de biens.`);
}

// ------------------------------------------------------------------ hypothèses de rendement et fiscalité

export async function seedYieldAndTax(s: PatState): Promise<void> {
  const { prisma, tenantId, end, log } = s.ctx;
  let yields = 0;
  let profiles = 0;
  let notes = 0;
  const assumed = new Set(
    (await prisma.propertyYieldAssumption.findMany({ where: { tenantId }, select: { propertyId: true } })).map(
      a => a.propertyId
    )
  );
  const profiled = new Map(
    (await prisma.propertyTaxProfile.findMany({ where: { tenantId } })).map(t => [t.propertyId, t])
  );

  for (const p of s.properties) {
    const vals = await prisma.assetValuation.findMany({
      where: { tenantId, propertyId: p.id },
      orderBy: { valuatedAt: 'asc' },
      select: { valuatedAt: true, estimatedValue: true }
    });
    if (!assumed.has(p.id)) {
      let growth = 4;
      if (vals.length >= 2) {
        const a = vals[0];
        const b = vals[vals.length - 1];
        const years = (b.valuatedAt.getTime() - a.valuatedAt.getTime()) / (365.25 * DAY);
        if (years > 0.5)
          growth = Math.max(
            0,
            Math.min(
              12,
              roundTo((Math.pow(Number(b.estimatedValue) / Number(a.estimatedValue), 1 / years) - 1) * 100, 0.5)
            )
          );
      }
      const land = p.type === 'TERRAIN';
      await prisma.propertyYieldAssumption.create({
        data: {
          tenantId,
          propertyId: p.id,
          years: 10,
          valueGrowthRate: growth,
          rentGrowthRate: land ? 0 : 3,
          expenseGrowthRate: land ? 2 : 4,
          vacancyRate: land ? 0 : ['BUREAU', 'ENTREPOT_INDUSTRIEL', 'BOUTIQUE_COMMERCIAL'].includes(p.type) ? 8 : 5,
          updatedByUserId: author(s)
        }
      });
      yields += 1;
    }

    const lease = s.leases.find(l => l.propertyId === p.id && l.status === 'ACTIVE');
    const built = p.type !== 'TERRAIN';
    const current = profiled.get(p.id);
    if (!current) {
      await prisma.propertyTaxProfile.create({
        data: {
          tenantId,
          propertyId: p.id,
          country: 'CI',
          builtStatus: built ? 'BUILT' : 'UNBUILT',
          occupancy: p.ref === 'PAT-DUP-BONOUMIN' ? 'MAIN_RESIDENCE' : lease ? 'RENTED' : 'VACANT',
          declaredRentalValue: lease ? lease.rent * 12 : null,
          updatedByUserId: author(s)
        }
      });
      profiles += 1;
    }
    const target = current ?? (await prisma.propertyTaxProfile.findUnique({ where: { propertyId: p.id } }));
    if (target && target.notes === null && target.exemptUntilYear === null) {
      let note: string;
      let exemptUntilYear: number | null = null;
      let exemptionReason: string | null = null;
      if (p.ref === 'PAT-VIL-BINGER') {
        exemptUntilYear = end.getFullYear() + 1;
        exemptionReason =
          'Exonération temporaire de taxe foncière pour construction neuve (cinq ans à compter de l’achèvement).';
        note = 'Exonération en cours : à renouveler auprès du centre des impôts avant son terme.';
      } else if (p.type === 'TERRAIN') {
        note = 'Terrain nu : taxe sur les terrains non bâtis, dossier de titre en cours.';
      } else if (lease) {
        note = 'Revenus fonciers déclarés chaque année auprès du guichet unique de la DGI (échéance fin avril).';
      } else {
        note = 'Bien occupé par la famille : taxe foncière seule, pas de revenus fonciers.';
      }
      await prisma.propertyTaxProfile.update({
        where: { id: target.id },
        data: { notes: note, exemptUntilYear, exemptionReason }
      });
      notes += 1;
    }
  }
  log(
    `patrimoine-extras : ${yields} hypothèse(s) de rendement, ${profiles} profil(s) fiscal(aux) créé(s), ${notes} profil(s) annoté(s).`
  );
}

// ------------------------------------------------------------------ charges récurrentes (plan de trésorerie)

export async function seedRecurringExpenses(s: PatState): Promise<void> {
  const { prisma, tenantId, end, log } = s.ctx;
  if ((await prisma.propertyExpense.count({ where: { tenantId, label: { contains: 'Gardiennage' } } })) > 0) return;
  const defs: Array<{
    ref: string;
    label: string;
    amount: number;
    category: 'OTHER' | 'UTILITIES' | 'MANAGEMENT_FEES' | 'ROUTINE_MAINTENANCE';
    recurrence: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
    supplier: string;
    startAgo: number;
    endAgo?: number;
  }> = [
    {
      ref: 'IMM-YOP',
      label: 'Gardiennage et sécurité de l’immeuble',
      amount: 150_000,
      category: 'OTHER',
      recurrence: 'MONTHLY',
      supplier: 'Sécurité Ivoire Protection',
      startAgo: 30
    },
    {
      ref: 'BUR-PLATEAU',
      label: 'Nettoyage des parties communes',
      amount: 85_000,
      category: 'OTHER',
      recurrence: 'MONTHLY',
      supplier: 'Net Plus Abidjan',
      startAgo: 24
    },
    {
      ref: 'ENT-VRIDI',
      label: 'Gardiennage du site de Vridi',
      amount: 120_000,
      category: 'OTHER',
      recurrence: 'MONTHLY',
      supplier: 'Sécurité Ivoire Protection',
      startAgo: 14
    },
    {
      ref: 'VIL-RIVIERA',
      label: 'Entretien du jardin et de la piscine',
      amount: 180_000,
      category: 'ROUTINE_MAINTENANCE',
      recurrence: 'QUARTERLY',
      supplier: 'Jardins du Golfe',
      startAgo: 33
    },
    {
      ref: 'VIL-BINGER',
      label: 'Entretien du jardin (convention terminée)',
      amount: 60_000,
      category: 'ROUTINE_MAINTENANCE',
      recurrence: 'QUARTERLY',
      supplier: 'Jardins du Golfe',
      startAgo: 20,
      endAgo: 6
    },
    {
      ref: 'IMM-YOP',
      label: 'Contrôle annuel des extincteurs et du réseau électrique',
      amount: 240_000,
      category: 'ROUTINE_MAINTENANCE',
      recurrence: 'ANNUAL',
      supplier: 'Technibat CI',
      startAgo: 26
    },
    {
      ref: 'BOU-TREICH',
      label: 'Contrôle annuel de sécurité incendie',
      amount: 90_000,
      category: 'ROUTINE_MAINTENANCE',
      recurrence: 'ANNUAL',
      supplier: 'Technibat CI',
      startAgo: 28
    },
    {
      ref: 'DUP-BONOUMIN',
      label: 'Abonnement eau et électricité du duplex familial',
      amount: 65_000,
      category: 'UTILITIES',
      recurrence: 'MONTHLY',
      supplier: 'CIE / SODECI',
      startAgo: 25
    },
    {
      ref: 'APP-ANGRE',
      label: 'Honoraires de gestion de la plateforme de quittancement',
      amount: 15_000,
      category: 'MANAGEMENT_FEES',
      recurrence: 'MONTHLY',
      supplier: 'ImmoTopia',
      startAgo: 20
    }
  ];
  let n = 0;
  for (const d of defs) {
    const p: PatProperty | undefined = byRef(s, d.ref);
    if (!p) continue;
    const start = new Date(end.getFullYear(), end.getMonth() - d.startAgo, 8, 10);
    if (start.getTime() < p.createdAt.getTime()) continue;
    await prisma.propertyExpense.create({
      data: {
        tenantId,
        propertyId: p.id,
        category: d.category,
        label: d.label,
        amount: d.amount,
        currency: 'XOF',
        paidAt: start,
        paymentMethod: 'BANK_TRANSFER',
        supplierName: d.supplier,
        recurrence: d.recurrence,
        recurrenceEndDate: d.endAgo ? new Date(end.getFullYear(), end.getMonth() - d.endAgo, 8, 10) : null
      }
    });
    n += 1;
  }
  log(`patrimoine-extras : ${n} charge(s) récurrente(s) (mensuelles, trimestrielles, annuelles).`);
}

// ------------------------------------------------------------------ scénarios

export async function seedScenarios(s: PatState): Promise<void> {
  const { prisma, tenantId, log } = s.ctx;
  const loans = await prisma.propertyLoan.findMany({ where: { tenantId }, select: { id: true, propertyId: true } });
  const loanOf = (ref: string): string | null => {
    const p = byRef(s, ref);
    return p ? (loans.find(l => l.propertyId === p.id)?.id ?? null) : null;
  };
  const assetOf = (ref: string): string | null => byRef(s, ref)?.assetId ?? null;
  const defs: ScenarioBody[] = [];
  const vridi = assetOf('ENT-VRIDI');
  const marcory = assetOf('STU-MARCORY');
  const riviera = loanOf('VIL-RIVIERA');
  if (s.isPro) {
    if (vridi) {
      defs.push({
        name: 'Cession de l’entrepôt de Vridi en année 3',
        horizonYears: 10,
        baseScenario: 'CENTRAL',
        assumptions: {},
        operations: [
          { type: 'SELL_ASSET', year: 3, assetId: vridi, salePrice: 135_000_000, feesPercent: 6 },
          {
            type: 'BUY_ASSET',
            year: 3,
            assetClass: 'REAL_ESTATE',
            name: 'Immeuble de rapport à Cocody',
            price: 110_000_000
          }
        ]
      });
    }
    if (riviera) {
      defs.push({
        name: 'Refinancement du prêt de la villa de la Riviera',
        horizonYears: 12,
        baseScenario: 'PRUDENT',
        assumptions: { inflationPercent: 3 },
        operations: [
          { type: 'PREPAY_LOAN', year: 2, loanId: riviera, amount: 25_000_000 },
          { type: 'TAKE_LOAN', year: 2, amount: 65_000_000, annualRatePercent: 7, termYears: 12 }
        ]
      });
    }
    defs.push(
      {
        name: 'Surélévation de l’immeuble de Yopougon',
        horizonYears: 10,
        baseScenario: 'OPTIMISTIC',
        assumptions: { growthPercentByClass: { REAL_ESTATE: 6 } },
        operations: [
          {
            type: 'BUY_ASSET',
            year: 1,
            assetClass: 'REAL_ESTATE',
            name: 'Surélévation R+4 — travaux et lots créés',
            price: 45_000_000,
            growthPercent: 5
          },
          { type: 'TAKE_LOAN', year: 1, amount: 30_000_000, annualRatePercent: 8, termYears: 10 }
        ]
      },
      {
        name: 'Préparer la retraite : épargne et désendettement',
        horizonYears: 15,
        baseScenario: 'PRUDENT',
        assumptions: { inflationPercent: 4 },
        operations: [{ type: 'MONTHLY_SAVING', fromYear: 1, toYear: 15, amount: 750_000 }]
      }
    );
  } else {
    if (marcory) {
      defs.push({
        name: 'Cession du studio de Marcory en année 4',
        horizonYears: 10,
        baseScenario: 'CENTRAL',
        assumptions: {},
        operations: [{ type: 'SELL_ASSET', year: 4, assetId: marcory, salePrice: 26_000_000, feesPercent: 5 }]
      });
    }
    defs.push(
      {
        name: 'Achat d’un second appartement à crédit',
        horizonYears: 15,
        baseScenario: 'CENTRAL',
        assumptions: {},
        operations: [
          {
            type: 'BUY_ASSET',
            year: 2,
            assetClass: 'REAL_ESTATE',
            name: 'Appartement F3 à Cocody Angré',
            price: 55_000_000
          },
          { type: 'TAKE_LOAN', year: 2, amount: 35_000_000, annualRatePercent: 8.5, termYears: 15 }
        ]
      },
      {
        name: 'Scénario prudent sur 10 ans',
        horizonYears: 10,
        baseScenario: 'PRUDENT',
        assumptions: { inflationPercent: 3 },
        operations: []
      }
    );
  }
  let created = 0;
  for (const body of defs) {
    if (await prisma.patrimonyScenario.findFirst({ where: { tenantId, name: body.name }, select: { id: true } }))
      continue;
    const parsed = scenarioBodySchema.parse(body);
    await prisma.patrimonyScenario.create({
      data: {
        tenantId,
        name: parsed.name,
        horizonYears: parsed.horizonYears,
        baseScenario: parsed.baseScenario,
        assumptions: (parsed.assumptions ?? {}) as Prisma.InputJsonValue,
        operations: (parsed.operations ?? []) as unknown as Prisma.InputJsonValue,
        createdByUserId: author(s)
      }
    });
    created += 1;
  }
  if (created > 0) log(`patrimoine-extras : ${created} scénario(s) de projection ajouté(s).`);
}

// ------------------------------------------------------------------ portail propriétaire

export async function seedOwnerPortalSettings(s: PatState): Promise<void> {
  const { prisma, tenantId, log } = s.ctx;
  if (await prisma.ownerPortalSettings.findUnique({ where: { tenantId }, select: { id: true } })) return;
  await prisma.ownerPortalSettings.create({
    data: {
      tenantId,
      patrimonyEnabled: true,
      patrimonyShowValuation: true,
      patrimonyShowYield: true,
      patrimonyShowLoans: false,
      patrimonyShowWorks: true,
      patrimonyShowDocuments: true,
      updatedByUserId: author(s)
    }
  });
  log('patrimoine-extras : réglages du portail propriétaire (prêts masqués aux co-propriétaires).');
}
