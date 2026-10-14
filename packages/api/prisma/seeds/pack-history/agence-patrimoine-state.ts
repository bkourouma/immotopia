/**
 * Socle des compléments « patrimoine » de l'agence (AGENCE / INTEGRE) : biens
 * propres relus en base (ownershipType TENANT, hors fiches « bâtiment » de
 * copropriété et hors brouillons), équipe, petits utilitaires de date, de montant
 * et d'amortissement, état partagé avec les générateurs « Patrimoine ».
 */
import { MembershipStatus } from '@prisma/client';
import type { PatState } from './patrimoine-extras-state';
import { loadState } from './patrimoine-extras-state';
import type { HistoryContext } from './types';

export interface OwnProperty {
  id: string;
  ref: string;
  title: string;
  type: string;
  address: string;
  zone: string;
  surface: number | null;
  status: string;
  createdAt: Date;
  /** Loyer affiché au catalogue (F CFA / mois). */
  price: number;
  /** Charges affichées au catalogue (F CFA / mois). */
  fees: number;
  modes: string[];
  commercial: boolean;
}

export interface OwnState {
  ctx: HistoryContext;
  /** Administrateur en tête, puis les membres actifs. */
  staff: string[];
  own: OwnProperty[];
  /** État « Patrimoine » restreint aux biens propres (documents de bien avec fichier réel, auteurs). */
  pat: PatState;
}

export const COMMERCIAL_TYPES = ['BUREAU', 'BOUTIQUE_COMMERCIAL', 'ENTREPOT_INDUSTRIEL'];

export const DAY = 86_400_000;

export const roundTo = (value: number, step: number): number => Math.round(value / step) * step;

/** Midi (heure locale) du jour `day` du mois de `d`. */
export const atDay = (d: Date, day: number, hour = 10): Date =>
  new Date(d.getFullYear(), d.getMonth(), day, hour, 0, 0, 0);

/** Premier du mois situé `back` mois avant `end`, à 10 h. */
export function monthsBack(end: Date, back: number, day = 1): Date {
  return new Date(end.getFullYear(), end.getMonth() - back, day, 10, 0, 0, 0);
}

export function addDaysTo(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY);
}

export function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/** Mensualité d'un prêt amorti (taux annuel en %). */
export function annuity(capital: number, ratePct: number, months: number): number {
  const r = ratePct / 1200;
  return r === 0 ? capital / months : (capital * r) / (1 - Math.pow(1 + r, -months));
}

/** Capital restant dû après `paid` mensualités. */
export function remainingCapital(capital: number, ratePct: number, months: number, paid: number): number {
  const r = ratePct / 1200;
  if (paid >= months) return 0;
  if (r === 0) return capital * (1 - paid / months);
  const g = Math.pow(1 + r, months);
  return (capital * (g - Math.pow(1 + r, paid))) / (g - 1);
}

/** Les biens propres de l'agence qui comptent pour le patrimoine. */
export async function loadOwnState(ctx: HistoryContext): Promise<OwnState> {
  const { prisma, tenantId, adminUserId } = ctx;
  const rows = await prisma.property.findMany({
    where: {
      tenantId,
      ownershipType: 'TENANT',
      internalReference: { startsWith: 'BIEN-' },
      status: { notIn: ['DRAFT', 'ARCHIVED', 'SOLD'] }
    },
    orderBy: { internalReference: 'asc' },
    select: {
      id: true,
      internalReference: true,
      title: true,
      propertyType: true,
      address: true,
      locationZone: true,
      surfaceArea: true,
      status: true,
      createdAt: true,
      price: true,
      fees: true,
      transactionModes: true
    }
  });
  const members = await prisma.membership.findMany({
    where: { tenantId, status: MembershipStatus.ACTIVE },
    select: { userId: true },
    orderBy: { createdAt: 'asc' }
  });
  const staff = Array.from(new Set([adminUserId, ...members.map(m => m.userId)]));
  const own: OwnProperty[] = rows.map(p => ({
    id: p.id,
    ref: p.internalReference ?? p.id,
    title: p.title,
    type: String(p.propertyType),
    address: p.address ?? '',
    zone: p.locationZone ?? '',
    surface: p.surfaceArea === null ? null : Number(p.surfaceArea),
    status: String(p.status),
    createdAt: p.createdAt,
    price: p.price === null ? 0 : Number(p.price),
    fees: p.fees === null ? 0 : Number(p.fees),
    modes: (p.transactionModes ?? []).map(String),
    commercial: COMMERCIAL_TYPES.includes(String(p.propertyType))
  }));
  const pat = await loadState(ctx, 'PATRIMOINE_PRO');
  const ids = new Set(own.map(o => o.id));
  pat.properties = pat.properties.filter(p => ids.has(p.id));
  pat.leases = pat.leases.filter(l => ids.has(l.propertyId));
  pat.staff = staff;
  return { ctx, staff, own, pat };
}

/** Auteur d'une écriture : tiré parmi l'équipe, de façon déterministe. */
export function author(o: OwnState): string {
  return o.staff[Math.floor(o.ctx.rng() * o.staff.length) % o.staff.length];
}

/** Journal du bloc : durée en secondes, erreurs sans arrêt des blocs suivants. */
export async function runBlock(
  ctx: HistoryContext,
  only: string[] | undefined,
  name: string,
  fn: () => Promise<void>
): Promise<void> {
  if (only && !only.includes(name)) return;
  const t0 = Date.now();
  try {
    await fn();
  } catch (error) {
    ctx.log(`bloc « ${name} » en échec — ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  }
  ctx.log(`bloc « ${name} » : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
