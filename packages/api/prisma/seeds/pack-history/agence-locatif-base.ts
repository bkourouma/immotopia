/**
 * Socle commun des compléments locatifs de l'agence : lecture des baux, de
 * l'équipe et petits utilitaires de date et de texte.
 */
import { MembershipStatus } from '@prisma/client';
import type { HistoryContext } from './types';

export interface StaffRef {
  id: string;
  name: string;
}

export interface LeaseRow {
  id: string;
  number: string;
  status: string;
  start: Date;
  end: Date | null;
  moveOut: Date | null;
  moveIn: Date | null;
  rent: number;
  charges: number;
  deposit: number;
  billing: string;
  dueDay: number;
  createdAt: Date;
  propertyId: string;
  propertyTitle: string;
  propertyType: string;
  propertyAddress: string;
  renterId: string;
  renterName: string;
  ownerId: string | null;
  ownerName: string | null;
}

export interface LocatifBase {
  ctx: HistoryContext;
  /** Administrateur en tête, puis les membres actifs (seedEquipe). */
  staff: StaffRef[];
  /** Collaborateurs qui signent les états des lieux : hors compte technique « Admin Test … » dès qu'une équipe existe. */
  signers: StaffRef[];
  leases: LeaseRow[];
  leaseById: Map<string, LeaseRow>;
}

export const DAY_MS = 86_400_000;

/** Midi UTC du jour de `d` : la date ne glisse pas selon le fuseau du serveur. */
export function noonUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12));
}

export function plusDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Premier jour (midi UTC) du mois de `d` décalé de `months` mois. */
export function monthStartUtc(d: Date, months = 0): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 12));
}

/** Même jour décalé de `months` mois (midi UTC), plafonné à la fin du mois visé. */
export function plusMonths(d: Date, months: number): Date {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 12));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return target;
}

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ym(d: Date): string {
  return d.toISOString().slice(0, 7);
}

const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre'
];

export function moisFr(month: number): string {
  return MOIS[(month - 1 + 12) % 12];
}

/** « 5 octobre 2026 ». */
export function dateFr(d: Date): string {
  return `${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** « 1 250 000 F CFA ». */
export function fcfa(amount: number): string {
  return `${Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F CFA`;
}

export function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Tire un élément selon des poids. */
export function pickWeighted<T>(rng: () => number, entries: ReadonlyArray<readonly [T, number]>): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [item, w] of entries) {
    r -= w;
    if (r < 0) return item;
  }
  return entries[entries.length - 1][0];
}

export function pickOne<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

export async function loadBase(ctx: HistoryContext): Promise<LocatifBase> {
  const { prisma, tenantId } = ctx;

  const admin = await prisma.user.findUnique({
    where: { id: ctx.adminUserId },
    select: { id: true, fullName: true, email: true }
  });
  const members = await prisma.membership.findMany({
    where: { tenantId, status: MembershipStatus.ACTIVE },
    select: { user: { select: { id: true, fullName: true, email: true } } },
    orderBy: { createdAt: 'asc' }
  });
  const staff: StaffRef[] = [];
  const seen = new Set<string>();
  for (const u of [admin, ...members.map(m => m.user)]) {
    if (!u || seen.has(u.id)) continue;
    seen.add(u.id);
    staff.push({ id: u.id, name: u.fullName || u.email });
  }
  if (staff.length === 0) staff.push({ id: ctx.adminUserId, name: 'Gestionnaire' });

  const rows = await prisma.rentalLease.findMany({
    where: { tenant_id: tenantId },
    orderBy: [{ start_date: 'asc' }, { lease_number: 'asc' }],
    select: {
      id: true,
      lease_number: true,
      status: true,
      start_date: true,
      end_date: true,
      move_in_date: true,
      move_out_date: true,
      rent_amount: true,
      service_charge_amount: true,
      security_deposit_amount: true,
      billing_frequency: true,
      due_day_of_month: true,
      created_at: true,
      property_id: true,
      property: { select: { title: true, propertyType: true, address: true } },
      primary_renter_client_id: true,
      primaryRenter: { select: { user: { select: { fullName: true, email: true } } } },
      owner_client_id: true,
      ownerClient: { select: { user: { select: { fullName: true, email: true } } } }
    }
  });

  const leases: LeaseRow[] = rows.map(r => ({
    id: r.id,
    number: r.lease_number,
    status: r.status,
    start: r.start_date,
    end: r.end_date,
    moveOut: r.move_out_date,
    moveIn: r.move_in_date,
    rent: Number(r.rent_amount),
    charges: Number(r.service_charge_amount),
    deposit: Number(r.security_deposit_amount),
    billing: r.billing_frequency,
    dueDay: r.due_day_of_month,
    createdAt: r.created_at,
    propertyId: r.property_id,
    propertyTitle: r.property?.title ?? 'Bien',
    propertyType: String(r.property?.propertyType ?? 'APPARTEMENT'),
    propertyAddress: r.property?.address ?? '',
    renterId: r.primary_renter_client_id,
    renterName: r.primaryRenter?.user?.fullName || r.primaryRenter?.user?.email || 'Locataire',
    ownerId: r.owner_client_id,
    ownerName: r.ownerClient?.user?.fullName || r.ownerClient?.user?.email || null
  }));

  const named = staff.filter(
    s =>
      !s.name
        .toLowerCase()
        .split(/[^a-z]+/)
        .includes('test')
  );
  const signers = named.length > 0 ? named : staff;

  return { ctx, staff, signers, leases, leaseById: new Map(leases.map(l => [l.id, l])) };
}
