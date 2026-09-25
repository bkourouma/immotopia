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
export async function computeQualifyingUnits(db: Db, tenantId: string): Promise<LotUnitRef[]> {
  const [properties, coproLots, programLots] = await Promise.all([
    db.property.findMany({
      where: {
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
        syndicate: { tenantId, status: { in: [...ACTIVE_SYNDICATE_STATUSES] } },
        lotType: { in: [...MAIN_COPRO_LOT_TYPES] }
      },
      select: { id: true, propertyId: true }
    }),
    db.siteLot.findMany({
      where: { tenantId, site: { tenantId, status: { in: [...ACTIVE_SITE_STATUSES] } } },
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
