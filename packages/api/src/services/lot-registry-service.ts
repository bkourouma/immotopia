/**
 * Registre des lots comptes dans la reserve de l'abonnement (LotActivation).
 *
 * Definitions (docs/architecture/PLAN-ABONNEMENTS.md, D1, D2, D14) :
 * - LOGEMENT (RENTAL_UNIT) : un bien de l'agence — y compris un bien CLIENT
 *   (tenantId nul) rattache par un mandat actif ou un bail — qui est sorti du
 *   brouillon ET propose a la location (RENTAL, SHORT_TERM), ou qui porte un
 *   bail ACTIVE. Ne comptent pas : brouillons, biens seulement a vendre,
 *   vendus, archives, et l'IMMEUBLE decoupe en sous-biens (ses unites comptent).
 * - LOT DE COPROPRIETE (COPRO_LOT) : lot principal (APARTMENT, OFFICE,
 *   COMMERCIAL) d'une copropriete ACTIVE ou IN_DISPUTE.
 * - LOT DE PROGRAMME (PROGRAM_LOT) : SiteLot d'un chantier PLANNED,
 *   IN_PROGRESS ou SUSPENDED. A la bascule au patrimoine il devient un bien :
 *   `transferProgramLotTx` ferme PL:<id> et ouvre P:<propertyId> (solde nul).
 *
 * Une unite physique compte UNE fois par agence : sa cle est P:<propertyId>
 * des qu'un bien existe, sinon SL:<syndicateLotId> ou PL:<siteLotId>.
 *
 * Vague 1 : ce registre est rempli par la reprise et `reconcileLotActivations`.
 * Vague 2 : les services metier appellent `activateLotTx` / `deactivateLotTx`
 * / `transferProgramLotTx` au fil de l'eau (dans leur propre transaction).
 */

import { LotKind, Prisma, PropertyStatus } from '@prisma/client';
import { prisma, PrismaTransactionClient } from '../utils/database';
import { BadRequestError } from '../middleware/error-middleware';
import { checkQuota, QuotaEvaluation } from '../lib/subscription';

type Db = PrismaTransactionClient | typeof prisma;

export interface LotUnitRef {
  kind: LotKind;
  unitKey: string;
  propertyId?: string | null;
  syndicateLotId?: string | null;
  siteLotId?: string | null;
}

/** Statuts de copropriete qui comptent (D14). IN_LIQUIDATION ne compte plus. */
export const ACTIVE_SYNDICATE_STATUSES = ['ACTIVE', 'IN_DISPUTE'] as const;
/** Statuts de chantier qui comptent (D14). */
export const ACTIVE_SITE_STATUSES = ['PLANNED', 'IN_PROGRESS', 'SUSPENDED'] as const;
/** Types de lots de copropriete principaux (D2). Parkings, caves et autres ne comptent pas. */
export const MAIN_COPRO_LOT_TYPES = ['APARTMENT', 'OFFICE', 'COMMERCIAL'] as const;
/** Statuts d'un bien qui ne comptent jamais sans bail actif. */
const NON_COUNTING_PROPERTY_STATUSES: PropertyStatus[] = ['DRAFT', 'SOLD', 'ARCHIVED'];
const RENTAL_MODES = ['RENTAL', 'SHORT_TERM'] as const;

/** Cle d'unite : P:<propertyId> des qu'un bien existe, sinon SL:/PL:. */
export function unitKeyFor(ref: { propertyId?: string | null; syndicateLotId?: string | null; siteLotId?: string | null }): string {
  if (ref.propertyId) return `P:${ref.propertyId}`;
  if (ref.syndicateLotId) return `SL:${ref.syndicateLotId}`;
  if (ref.siteLotId) return `PL:${ref.siteLotId}`;
  throw new BadRequestError("Lot sans identifiant : impossible d'en déduire la clé d'unité.");
}

/** Priorite quand une meme unite qualifie a plusieurs titres : logement, puis copropriete, puis programme. */
const KIND_PRIORITY: Record<LotKind, number> = { RENTAL_UNIT: 0, COPRO_LOT: 1, PROGRAM_LOT: 2 };

/**
 * Unites qui DEVRAIENT compter aujourd'hui pour l'agence, calculees depuis les
 * tables metier (D1, D2, D14), dedoublonnees par cle d'unite.
 */
export async function computeQualifyingUnits(db: Db, tenantId: string, scope?: ResolvedLotScope): Promise<LotUnitRef[]> {
  // Perimetre (appel au fil de l'eau) : seulement les unites touchees, mais
  // TOUS les titres de chacune (un bien peut etre logement ET lot de copropriete).
  const propertyScope = scope ? { id: { in: scope.propertyIds } } : {};
  const coproScope = scope ? { OR: [{ id: { in: scope.syndicateLotIds } }, { propertyId: { in: scope.propertyIds } }] } : {};
  const programScope = scope ? { OR: [{ id: { in: scope.siteLotIds } }, { propertyId: { in: scope.propertyIds } }] } : {};
  const [properties, coproLots, programLots] = await Promise.all([
    db.property.findMany({
      where: {
        ...propertyScope,
        OR: [
          { tenantId },
          // Bien CLIENT (tenantId nul) gere par l'agence : mandat actif ou bail de l'agence.
          { tenantId: null, mandates: { some: { tenantId, isActive: true } } },
          { tenantId: null, rentalLeases: { some: { tenant_id: tenantId, status: 'ACTIVE' } } }
        ]
      },
      select: {
        id: true,
        status: true,
        transactionModes: true,
        _count: { select: { containerChildren: true } },
        rentalLeases: { where: { tenant_id: tenantId, status: 'ACTIVE' }, select: { id: true }, take: 1 },
        siteLot: { select: { id: true, site: { select: { status: true, tenantId: true } } } }
      }
    }),
    db.syndicateLot.findMany({
      where: {
        ...coproScope,
        syndicate: { tenantId, status: { in: [...ACTIVE_SYNDICATE_STATUSES] } },
        lotType: { in: [...MAIN_COPRO_LOT_TYPES] }
      },
      select: { id: true, propertyId: true }
    }),
    db.siteLot.findMany({
      where: { ...programScope, tenantId, site: { tenantId, status: { in: [...ACTIVE_SITE_STATUSES] } } },
      select: { id: true, propertyId: true }
    })
  ]);

  const units = new Map<string, LotUnitRef>();
  const offer = (ref: LotUnitRef) => {
    const existing = units.get(ref.unitKey);
    if (!existing) {
      units.set(ref.unitKey, ref);
      return;
    }
    // Meme unite a plusieurs titres : garder la nature prioritaire, fusionner les ids.
    const keep = KIND_PRIORITY[ref.kind] < KIND_PRIORITY[existing.kind] ? ref : existing;
    units.set(ref.unitKey, {
      ...keep,
      propertyId: existing.propertyId ?? ref.propertyId ?? null,
      syndicateLotId: existing.syndicateLotId ?? ref.syndicateLotId ?? null,
      siteLotId: existing.siteLotId ?? ref.siteLotId ?? null
    });
  };

  for (const p of properties) {
    if (p._count.containerChildren > 0) continue; // Immeuble decoupe : ses unites comptent, pas lui.
    const hasActiveLease = p.rentalLeases.length > 0;
    const offeredForRent =
      !NON_COUNTING_PROPERTY_STATUSES.includes(p.status) &&
      p.transactionModes.some(mode => (RENTAL_MODES as readonly string[]).includes(mode));
    // Lot de programme deja bascule en bien, chantier encore ouvert : il reste compte (solde nul).
    const fromOpenSite =
      !!p.siteLot &&
      p.siteLot.site.tenantId === tenantId &&
      (ACTIVE_SITE_STATUSES as readonly string[]).includes(p.siteLot.site.status);
    if (hasActiveLease || offeredForRent) {
      offer({ kind: 'RENTAL_UNIT', unitKey: `P:${p.id}`, propertyId: p.id, siteLotId: p.siteLot?.id ?? null });
    } else if (fromOpenSite && p.siteLot) {
      offer({ kind: 'PROGRAM_LOT', unitKey: `P:${p.id}`, propertyId: p.id, siteLotId: p.siteLot.id });
    }
  }
  for (const lot of coproLots) {
    offer({
      kind: 'COPRO_LOT',
      unitKey: unitKeyFor({ propertyId: lot.propertyId, syndicateLotId: lot.id }),
      propertyId: lot.propertyId,
      syndicateLotId: lot.id
    });
  }
  for (const lot of programLots) {
    offer({
      kind: 'PROGRAM_LOT',
      unitKey: unitKeyFor({ propertyId: lot.propertyId, siteLotId: lot.id }),
      propertyId: lot.propertyId,
      siteLotId: lot.id
    });
  }

  return [...units.values()];
}

// ------------------------------------------------------------------ compteurs

/** Lots actuellement comptes (activations ouvertes). */
export async function countActiveLots(db: Db, tenantId: string): Promise<number> {
  return db.lotActivation.count({ where: { tenantId, deactivatedAt: null } });
}

/** Coproprietes actives (D14). */
export async function countActiveCopros(db: Db, tenantId: string): Promise<number> {
  return db.syndicate.count({ where: { tenantId, status: { in: [...ACTIVE_SYNDICATE_STATUSES] } } });
}

/** Chantiers actifs (D14). */
export async function countActiveSites(db: Db, tenantId: string): Promise<number> {
  return db.constructionSite.count({ where: { tenantId, status: { in: [...ACTIVE_SITE_STATUSES] } } });
}

// ------------------------------------------------------------------ ecriture

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Ouvre l'activation d'une unite, ou renvoie celle deja ouverte (idempotent).
 * L'index unique partiel `lot_activations_open_unit_key` garantit qu'une
 * unite n'est jamais comptee deux fois, meme sous concurrence.
 */
export async function activateLotTx(
  tx: Db,
  tenantId: string,
  ref: Omit<LotUnitRef, 'unitKey'> & { unitKey?: string },
  actorUserId?: string | null
): Promise<{ activationId: string; created: boolean }> {
  const unitKey = ref.unitKey ?? unitKeyFor(ref);
  const open = await tx.lotActivation.findFirst({
    where: { tenantId, unitKey, deactivatedAt: null },
    select: { id: true }
  });
  if (open) return { activationId: open.id, created: false };
  try {
    const created = await tx.lotActivation.create({
      data: {
        tenantId,
        kind: ref.kind,
        unitKey,
        propertyId: ref.propertyId ?? null,
        syndicateLotId: ref.syndicateLotId ?? null,
        siteLotId: ref.siteLotId ?? null,
        activatedByUserId: actorUserId ?? null
      },
      select: { id: true }
    });
    return { activationId: created.id, created: true };
  } catch (error) {
    // Course perdue contre une autre transaction : l'unite est deja comptee.
    // (Dans une transaction interactive Postgres, l'echec annule la
    // transaction : l'appelant doit alors rejouer, comme pour tout P2002.)
    if (isUniqueViolation(error)) {
      const again = await tx.lotActivation.findFirst({ where: { tenantId, unitKey, deactivatedAt: null }, select: { id: true } });
      if (again) return { activationId: again.id, created: false };
    }
    throw error;
  }
}

/** Ferme l'activation ouverte d'une unite (sans effet si aucune). */
export async function deactivateLotTx(
  tx: Db,
  tenantId: string,
  unitKey: string,
  reason: string,
  at: Date = new Date()
): Promise<{ closed: number }> {
  const result = await tx.lotActivation.updateMany({
    where: { tenantId, unitKey, deactivatedAt: null },
    data: { deactivatedAt: at, deactivationReason: reason }
  });
  return { closed: result.count };
}

/**
 * Bascule d'un lot de programme au patrimoine : PL:<siteLotId> ferme,
 * P:<propertyId> ouvert, dans la meme transaction (solde nul).
 */
export async function transferProgramLotTx(
  tx: Db,
  tenantId: string,
  siteLotId: string,
  propertyId: string,
  actorUserId?: string | null
): Promise<{ activationId: string }> {
  const at = new Date();
  await deactivateLotTx(tx, tenantId, `PL:${siteLotId}`, 'TRANSFERRED_TO_PROPERTY', at);
  const { activationId } = await activateLotTx(
    tx,
    tenantId,
    { kind: 'PROGRAM_LOT', unitKey: `P:${propertyId}`, propertyId, siteLotId },
    actorUserId
  );
  return { activationId };
}

export interface ReconcileResult {
  tenantId: string;
  qualifying: number;
  added: LotUnitRef[];
  removed: Array<{ unitKey: string; kind: LotKind }>;
  byKind: Record<LotKind, number>;
}

/**
 * Aligne le registre sur les tables metier : ouvre les unites qui qualifient
 * et n'y sont pas, ferme (raison RECONCILE) celles qui ne qualifient plus.
 * `dryRun` calcule sans ecrire. Utilise par la reprise ; utilisable par une
 * tache de controle (vague 2).
 */
export async function reconcileLotActivations(
  tenantId: string,
  options: { dryRun?: boolean; actorUserId?: string | null } = {}
): Promise<ReconcileResult> {
  const qualifying = await computeQualifyingUnits(prisma, tenantId);
  const open = await prisma.lotActivation.findMany({
    where: { tenantId, deactivatedAt: null },
    select: { unitKey: true, kind: true }
  });
  const openKeys = new Set(open.map(a => a.unitKey));
  const qualifyingKeys = new Set(qualifying.map(u => u.unitKey));

  const added = qualifying.filter(u => !openKeys.has(u.unitKey));
  const removed = open.filter(a => !qualifyingKeys.has(a.unitKey));

  if (!options.dryRun && (added.length > 0 || removed.length > 0)) {
    await prisma.$transaction(async tx => {
      for (const unit of added) {
        // eslint-disable-next-line no-await-in-loop -- sequentiel dans la meme transaction.
        await activateLotTx(tx, tenantId, unit, options.actorUserId ?? null);
      }
      for (const activation of removed) {
        // eslint-disable-next-line no-await-in-loop -- sequentiel dans la meme transaction.
        await deactivateLotTx(tx, tenantId, activation.unitKey, 'RECONCILE');
      }
    }, { timeout: 60_000 });
  }

  const byKind: Record<LotKind, number> = { RENTAL_UNIT: 0, COPRO_LOT: 0, PROGRAM_LOT: 0 };
  for (const unit of qualifying) byKind[unit.kind] += 1;

  return { tenantId, qualifying: qualifying.length, added, removed, byKind };
}

// ------------------------------------------------------------------ au fil de l'eau (vague 2)

/**
 * Unites touchees par une operation metier. Le registre recalcule ces seules
 * unites (tous leurs titres) et ouvre ou ferme leurs activations.
 */
export interface LotScope {
  propertyIds?: Array<string | null | undefined>;
  syndicateIds?: string[];
  syndicateLotIds?: string[];
  siteIds?: string[];
  siteLotIds?: string[];
}

export interface ResolvedLotScope {
  propertyIds: string[];
  syndicateLotIds: string[];
  siteLotIds: string[];
}

const compact = (values: Array<string | null | undefined> | undefined): string[] =>
  [...new Set((values ?? []).filter((v): v is string => typeof v === 'string' && v.length > 0))];

/**
 * Deplie un perimetre : lots des coproprietes et chantiers cites, biens de
 * ces lots, lots rattaches aux biens, et immeuble parent (un immeuble cesse
 * de compter des qu'il est decoupe, et recompte quand il ne l'est plus).
 */
export async function resolveLotScope(db: Db, tenantId: string, scope: LotScope): Promise<ResolvedLotScope> {
  const propertyIds = new Set(compact(scope.propertyIds));
  const syndicateLotIds = new Set(compact(scope.syndicateLotIds));
  const siteLotIds = new Set(compact(scope.siteLotIds));
  const syndicateIds = compact(scope.syndicateIds);
  const siteIds = compact(scope.siteIds);

  const [coproLots, programLots] = await Promise.all([
    syndicateIds.length > 0 || syndicateLotIds.size > 0 || propertyIds.size > 0
      ? db.syndicateLot.findMany({
          where: {
            syndicate: { tenantId },
            OR: [
              { syndicateId: { in: syndicateIds } },
              { id: { in: [...syndicateLotIds] } },
              { propertyId: { in: [...propertyIds] } }
            ]
          },
          select: { id: true, propertyId: true }
        })
      : Promise.resolve([] as Array<{ id: string; propertyId: string | null }>),
    siteIds.length > 0 || siteLotIds.size > 0 || propertyIds.size > 0
      ? db.siteLot.findMany({
          where: {
            tenantId,
            OR: [{ siteId: { in: siteIds } }, { id: { in: [...siteLotIds] } }, { propertyId: { in: [...propertyIds] } }]
          },
          select: { id: true, propertyId: true }
        })
      : Promise.resolve([] as Array<{ id: string; propertyId: string | null }>)
  ]);
  for (const lot of coproLots) {
    syndicateLotIds.add(lot.id);
    if (lot.propertyId) propertyIds.add(lot.propertyId);
  }
  for (const lot of programLots) {
    siteLotIds.add(lot.id);
    if (lot.propertyId) propertyIds.add(lot.propertyId);
  }
  if (propertyIds.size > 0) {
    const parents = await db.property.findMany({
      where: { id: { in: [...propertyIds] }, containerParentId: { not: null } },
      select: { containerParentId: true }
    });
    for (const p of parents) if (p.containerParentId) propertyIds.add(p.containerParentId);
  }
  return { propertyIds: [...propertyIds], syndicateLotIds: [...syndicateLotIds], siteLotIds: [...siteLotIds] };
}

/**
 * Verrou transactionnel PAR AGENCE contre les activations simultanees : deux
 * operations qui ajoutent des lots en meme temps se serialisent, si bien que
 * le controle de quota voit toujours la consommation a jour. Cle distincte
 * du verrou de caisse (lib/finance/cash.ts), qui prend hashtext(tenantId).
 */
export async function lockTenantLotsTx(tx: Db, tenantId: string): Promise<void> {
  const key = `lot-registry:${tenantId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

export interface LotSyncOptions {
  actorUserId?: string | null;
  /** Raison portee par les activations fermees (ex. PROPERTY_ARCHIVED). */
  reason?: string;
  /** Verrou deja pris par l'appelant (import par lots). */
  alreadyLocked?: boolean;
}

export interface LotSyncResult {
  activated: string[];
  deactivated: string[];
  /** Evaluation du quota LOTS (null quand rien n'est ajoute). */
  quota: QuotaEvaluation | null;
}

/**
 * Aligne le registre sur les tables metier pour les unites d'un perimetre,
 * DANS la transaction de l'operation. Ordre : verrou d'agence, calcul,
 * controle de quota sur l'ajout NET (une bascule PL: -> P: ne consomme rien),
 * fermetures puis ouvertures.
 *
 * Le registre est TOUJOURS tenu, quel que soit SUBSCRIPTION_ENFORCEMENT ;
 * seul le refus en depend (`checkQuota`) : en `enforce` avec la politique
 * BLOCK, un depassement leve QuotaExceededError (409) et annule l'operation ;
 * BILL_OVERAGE passe (le depassement sera facture), WARN_ONLY passe (alerte
 * par la tache subscription-usage-job).
 */
export async function syncLotActivationsTx(
  tx: Db,
  tenantId: string,
  scope: LotScope,
  options: LotSyncOptions = {}
): Promise<LotSyncResult> {
  if (!options.alreadyLocked) await lockTenantLotsTx(tx, tenantId);
  const resolved = await resolveLotScope(tx, tenantId, scope);
  if (resolved.propertyIds.length + resolved.syndicateLotIds.length + resolved.siteLotIds.length === 0) {
    return { activated: [], deactivated: [], quota: null };
  }

  const desired = await computeQualifyingUnits(tx, tenantId, resolved);
  const scopeKeys = [
    ...resolved.propertyIds.map(id => `P:${id}`),
    ...resolved.syndicateLotIds.map(id => `SL:${id}`),
    ...resolved.siteLotIds.map(id => `PL:${id}`)
  ];
  const open = await tx.lotActivation.findMany({
    where: {
      tenantId,
      deactivatedAt: null,
      OR: [
        { unitKey: { in: scopeKeys } },
        { propertyId: { in: resolved.propertyIds } },
        { syndicateLotId: { in: resolved.syndicateLotIds } },
        { siteLotId: { in: resolved.siteLotIds } }
      ]
    },
    select: { unitKey: true }
  });
  const openKeys = new Set(open.map(a => a.unitKey));
  const desiredKeys = new Set(desired.map(u => u.unitKey));
  const toAdd = desired.filter(u => !openKeys.has(u.unitKey));
  const toRemove = [...openKeys].filter(key => !desiredKeys.has(key));

  let quota: QuotaEvaluation | null = null;
  if (toAdd.length > 0) {
    const { getEntitlements } = await import('./subscription-v2-service');
    const entitlements = await getEntitlements(tenantId, { db: tx });
    quota = checkQuota(entitlements, 'LOTS', toAdd.length - toRemove.length);
  }

  const at = new Date();
  for (const unitKey of toRemove) {
    // eslint-disable-next-line no-await-in-loop -- sequentiel dans la meme transaction.
    await deactivateLotTx(tx, tenantId, unitKey, options.reason ?? 'NO_LONGER_QUALIFIES', at);
  }
  for (const unit of toAdd) {
    // eslint-disable-next-line no-await-in-loop -- sequentiel dans la meme transaction.
    await activateLotTx(tx, tenantId, unit, options.actorUserId ?? null);
  }
  if (toAdd.length > 0 || toRemove.length > 0) {
    const { invalidateEntitlements } = await import('./subscription-v2-service');
    invalidateEntitlements(tenantId);
  }
  return { activated: toAdd.map(u => u.unitKey), deactivated: toRemove, quota };
}

/**
 * Controle de quota d'une copropriete ou d'un chantier qui devient actif
 * (creation, reouverture, D14), sous le verrou d'agence. Memes politiques que
 * les lots : BLOCK (enforce) leve QuotaExceededError, sinon passe.
 */
export async function assertCapacityTx(
  tx: Db,
  tenantId: string,
  capacityKey: 'COPROPRIETES' | 'CHANTIERS',
  increment = 1
): Promise<QuotaEvaluation> {
  await lockTenantLotsTx(tx, tenantId);
  const { getEntitlements, invalidateEntitlements } = await import('./subscription-v2-service');
  const evaluation = checkQuota(await getEntitlements(tenantId, { db: tx }), capacityKey, increment);
  invalidateEntitlements(tenantId);
  return evaluation;
}

/** Raison d'une ligne d'import ecartee faute de place (cle de traduction). */
export const LOT_QUOTA_REACHED_REASON = 'Quota de lots atteint';
