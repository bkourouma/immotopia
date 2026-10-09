/**
 * Journal d'activité (audit) de l'agence « 3 ans », sur 36 mois.
 *
 * Les lignes reprennent le format RÉEL du journal (`buildAuditRow`, catalogue
 * `audit-catalog.ts`) : connexions et déconnexions des membres, créations et
 * modifications des objets déjà présents (biens, contacts, affaires, visites,
 * tickets, bons de stock…), changements de rôle, invitations, suspensions,
 * téléchargements et exports (`DOCUMENT_DOWNLOADED` / `DATA_EXPORTED`, comme les
 * pose `audit-access-middleware`), refus de droit sur les menus coupés, tours
 * de l'assistant. Chaque ligne est écrite avec son acteur au moment des faits
 * (membre actif à cette date), des adresses IP de documentation (RFC 5737) et
 * des navigateurs plausibles.
 *
 * Le journal est en ajout seul (déclencheurs de base) : le bloc est donc
 * IDEMPOTENT par sentinelle (déjà ≥ 50 connexions réussies sur l'agence → on ne
 * réécrit rien) et construit en mémoire avant une écriture unique, pour ne
 * jamais laisser un bloc à moitié écrit. Le scellement quotidien
 * (`audit_seals`) est l'affaire du job de maintenance, qui scelle les jours
 * révolus ; aucune ligne de scellé n'est insérée ici.
 *
 * Aucune ligne n'est écrite pour un couple (action, objet) déjà tracé par un
 * autre générateur (ex. `RENTAL_LEASE_CREATED`).
 */
import { MembershipStatus, Prisma } from '@prisma/client';

import { MARKER_KIND } from '../../../src/lib/notification-markers';
import { buildAuditRow } from '../../../src/services/audit-entry-builder';
import type { AuditRow } from '../../../src/services/audit-entry-builder';
import { AuditActionKey } from '../../../src/types/audit-types';
import type { AuditLogEntry } from '../../../src/types/audit-types';
import { between, pick } from './types';
import type { HistoryContext } from './types';
import { daysAfter } from './equipe-plateforme-data';
import type { TeamRoleKey } from './equipe-plateforme-data';

const DAY = 86_400_000;
const CHUNK = 1000;

// ───────────────────────────────────────────────────────────── personnes

export interface Person {
  id: string;
  label: string;
  roleKey: TeamRoleKey;
  joinedAt: Date;
  /** Fin d'activité : maintenant pour un actif, la suspension ou le retrait sinon. */
  endAt: Date;
  status: MembershipStatus;
  ip: string;
  ua: string;
  mobileIp: string;
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Edg/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-A346B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
];

const LOGINS_PER_MONTH: Record<TeamRoleKey, number> = {
  TENANT_ADMIN: 9,
  TENANT_MANAGER: 11,
  TENANT_AGENT: 9,
  TENANT_ACCOUNTANT: 8,
  TENANT_SITE_MANAGER: 7,
  TENANT_STOREKEEPER: 6
};

/** Membres de l'agence (hors invitations non acceptées) avec leur rôle d'origine. */
export async function loadPeople(ctx: HistoryContext): Promise<Person[]> {
  const { prisma, tenantId, adminUserId, end, rng } = ctx;
  const roles = await prisma.role.findMany({ where: { scope: 'TENANT' }, select: { id: true, key: true } });
  const keyById = new Map(roles.map(r => [r.id, r.key as TeamRoleKey]));
  const memberships = await prisma.membership.findMany({
    where: { tenantId, status: { not: MembershipStatus.PENDING_INVITE } },
    select: {
      status: true,
      acceptedAt: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, fullName: true, email: true } }
    },
    orderBy: { createdAt: 'asc' }
  });
  const invitations = await prisma.invitation.findMany({
    where: { tenantId, status: 'ACCEPTED' },
    select: { acceptedBy: true, roleIds: true }
  });
  const inviteRole = new Map(invitations.map(i => [i.acceptedBy ?? '', i.roleIds[0]]));
  const userRoles = await prisma.userRole.findMany({ where: { tenantId }, select: { userId: true, roleId: true } });
  const currentRole = new Map(userRoles.map(r => [r.userId, r.roleId]));

  return memberships.map((m, index) => {
    const roleId = currentRole.get(m.user.id) ?? inviteRole.get(m.user.id);
    const roleKey = m.user.id === adminUserId ? 'TENANT_ADMIN' : (roleId && keyById.get(roleId)) || 'TENANT_AGENT';
    const joinedAt = m.acceptedAt ?? m.createdAt;
    const octet = 20 + ((index * 7 + between(rng, 0, 5)) % 200);
    return {
      id: m.user.id,
      label: m.user.fullName || m.user.email,
      roleKey,
      joinedAt,
      endAt: m.status === MembershipStatus.ACTIVE ? end : m.updatedAt,
      status: m.status,
      ip: `203.0.113.${octet}`,
      ua: USER_AGENTS[index % 4],
      mobileIp: `198.51.100.${(octet * 3) % 250}`
    };
  });
}

// ───────────────────────────────────────────────────────────── générateur

function hex(rng: () => number, length: number): string {
  let out = '';
  while (out.length < length)
    out += Math.floor(rng() * 0xffffffff)
      .toString(16)
      .padStart(8, '0');
  return out.slice(0, length);
}

export function fakeUuid(rng: () => number): string {
  const h = hex(rng, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Instant ouvré : 7 h 00 à 18 h 30 (UTC = heure d'Abidjan) du jour donné. */
export function workInstant(day: Date, rng: () => number, fromHour = 7, toHour = 18): Date {
  return new Date(
    Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      between(rng, fromHour, toHour),
      between(rng, 0, 59),
      between(rng, 0, 59)
    )
  );
}

function sample<T>(rows: readonly T[], max: number): T[] {
  if (rows.length <= max) return [...rows];
  const step = rows.length / max;
  return Array.from({ length: max }, (_, i) => rows[Math.floor(i * step)]);
}

export interface EmitOptions {
  payload?: Record<string, unknown> | null;
  changes?: Record<string, unknown> | null;
  outcome?: 'SUCCESS' | 'FAILURE' | 'DENIED';
  requestId?: string | null;
  system?: boolean;
  superAdminId?: string | null;
  ip?: string | null;
  ua?: string | null;
  mobile?: boolean;
}

export class AuditBuilder {
  readonly rows: AuditRow[] = [];
  private readonly seen: Set<string>;

  constructor(
    readonly ctx: HistoryContext,
    readonly people: Person[],
    existing: Set<string>,
    readonly founded: Date
  ) {
    this.seen = existing;
  }

  /** Acteur actif à la date, parmi les rôles voulus ; à défaut un actif, à défaut l'administrateur. */
  actor(roles: readonly TeamRoleKey[] | null, at: Date): Person {
    const alive = this.people.filter(p => p.joinedAt.getTime() <= at.getTime() && p.endAt.getTime() >= at.getTime());
    const wanted = roles ? alive.filter(p => roles.includes(p.roleKey)) : alive;
    const pool = wanted.length > 0 ? wanted : alive.length > 0 ? alive : this.people.slice(0, 1);
    return pick(this.ctx.rng, pool);
  }

  clamp(at: Date): Date {
    const { end } = this.ctx;
    if (at.getTime() < this.founded.getTime())
      return new Date(this.founded.getTime() + between(this.ctx.rng, 3, 20) * 3_600_000);
    if (at.getTime() > end.getTime()) return new Date(end.getTime() - between(this.ctx.rng, 1, 90) * 60_000);
    return at;
  }

  emit(
    at: Date,
    actionKey: AuditActionKey | string,
    actor: Person | null,
    entityType: string,
    entityId: string,
    opts: EmitOptions = {},
    dedupe = true
  ): void {
    const key = `${actionKey}|${entityId}`;
    if (dedupe && this.seen.has(key)) return;
    if (dedupe) this.seen.add(key);
    const { rng, tenantId } = this.ctx;
    const when = this.clamp(at);
    const entry: AuditLogEntry = {
      createdAt: when,
      tenantId,
      actionKey,
      entityType,
      entityId,
      payload: opts.payload ?? null,
      changes: opts.changes ?? null,
      outcome: opts.outcome ?? 'SUCCESS',
      requestId: opts.requestId === undefined ? fakeUuid(rng) : opts.requestId
    };
    if (opts.system || !actor) {
      entry.actorUserId = null;
      entry.actorType = 'SYSTEM';
      entry.actorLabel = null;
      entry.source = 'job';
      entry.ipAddress = null;
      entry.userAgent = null;
    } else if (opts.superAdminId) {
      entry.actorUserId = opts.superAdminId;
      entry.actorType = 'SUPER_ADMIN';
      entry.actorLabel = 'Équipe ImmoTopia';
      entry.source = 'http';
      entry.ipAddress = '192.0.2.10';
      entry.userAgent = USER_AGENTS[0];
    } else {
      entry.actorUserId = actor.id;
      entry.actorType = 'USER';
      entry.actorLabel = actor.label;
      entry.source = 'http';
      entry.ipAddress = opts.ip ?? (opts.mobile ? actor.mobileIp : actor.ip);
      entry.userAgent = opts.ua ?? (opts.mobile ? USER_AGENTS[4 + (actor.label.length % 2)] : actor.ua);
    }
    this.rows.push(buildAuditRow(entry, undefined));
  }
}

/** Écrit les lignes (ajout seul) en une transaction, par paquets. */
export async function writeAuditRows(ctx: HistoryContext, rows: AuditRow[]): Promise<void> {
  if (rows.length === 0) return;
  rows.sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime());
  await ctx.prisma.$transaction(
    async tx => {
      for (let i = 0; i < rows.length; i += CHUNK) {
        // eslint-disable-next-line no-await-in-loop -- paquets séquentiels dans une même transaction.
        await tx.auditLog.createMany({ data: rows.slice(i, i + CHUNK) as Prisma.AuditLogCreateManyInput[] });
      }
    },
    { timeout: 180_000, maxWait: 30_000 }
  );
}

/** Couples (action|objet) déjà tracés sur l'agence. */
async function existingKeys(ctx: HistoryContext): Promise<Set<string>> {
  const rows = await ctx.prisma.auditLog.findMany({
    where: { tenantId: ctx.tenantId },
    select: { actionKey: true, entityId: true }
  });
  return new Set(rows.map(r => `${r.actionKey}|${r.entityId}`));
}

// ───────────────────────────────────────────────────────────── blocs d'événements

interface Gen {
  b: AuditBuilder;
  ctx: HistoryContext;
}

const COMMERCIAL: readonly TeamRoleKey[] = ['TENANT_AGENT', 'TENANT_MANAGER', 'TENANT_ADMIN'];
const MANAGERS: readonly TeamRoleKey[] = ['TENANT_MANAGER', 'TENANT_ADMIN'];
const FINANCE: readonly TeamRoleKey[] = ['TENANT_ACCOUNTANT', 'TENANT_MANAGER', 'TENANT_ADMIN'];
const STOCK: readonly TeamRoleKey[] = ['TENANT_STOREKEEPER', 'TENANT_SITE_MANAGER', 'TENANT_MANAGER'];

/** Jours ouvrés (95 %) tirés dans [from, to]. */
function workdays(from: Date, to: Date, count: number, rng: () => number): Date[] {
  const span = Math.max(1, Math.floor((to.getTime() - from.getTime()) / DAY));
  const out: Date[] = [];
  let guard = 0;
  while (out.length < count && guard < count * 6) {
    guard += 1;
    const d = new Date(from.getTime() + Math.floor(rng() * span) * DAY);
    const dow = d.getUTCDay();
    if ((dow === 0 || dow === 6) && rng() > 0.05) continue;
    out.push(d);
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

function monthStarts(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (cursor.getTime() <= to.getTime()) {
    out.push(cursor);
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return out;
}

/** Connexions, déconnexions, échecs, réinitialisations de mot de passe. */
function genSessions(g: Gen): void {
  const { b, ctx } = g;
  const { rng, end } = ctx;
  for (const person of b.people) {
    const perMonth = LOGINS_PER_MONTH[person.roleKey];
    for (const monthStart of monthStarts(person.joinedAt, person.endAt)) {
      const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0, 23, 59));
      const from = person.joinedAt.getTime() > monthStart.getTime() ? person.joinedAt : monthStart;
      const to = new Date(Math.min(monthEnd.getTime(), person.endAt.getTime(), end.getTime()));
      if (to.getTime() <= from.getTime()) continue;
      const coverage = Math.min(1, (to.getTime() - from.getTime()) / (28 * DAY));
      const recent = end.getTime() - to.getTime() < 35 * DAY ? 1.3 : 1;
      const count = Math.max(1, Math.round(perMonth * coverage * recent * (0.65 + rng() * 0.7)));
      for (const day of workdays(from, to, count, rng)) {
        const login = workInstant(day, rng, 7, 10);
        if (login.getTime() < person.joinedAt.getTime() || login.getTime() > person.endAt.getTime()) continue;
        const mobile = rng() < 0.12;
        if (rng() < 0.02) {
          b.emit(
            new Date(login.getTime() - between(rng, 1, 4) * 60_000),
            AuditActionKey.AUTH_LOGIN_FAILED,
            person,
            'User',
            person.id,
            {
              payload: { method: 'password', reason: 'invalid_credentials' },
              outcome: 'FAILURE',
              mobile
            },
            false
          );
        }
        const google = person.roleKey === 'TENANT_ADMIN' && rng() < 0.15;
        b.emit(
          login,
          google ? AuditActionKey.AUTH_GOOGLE_LOGIN : AuditActionKey.AUTH_LOGIN_SUCCEEDED,
          person,
          'User',
          person.id,
          {
            payload: { method: google ? 'google' : 'password' },
            mobile
          },
          false
        );
        if (rng() < 0.62) {
          const logout = new Date(Math.min(workInstant(day, rng, 16, 19).getTime(), end.getTime() - 60_000));
          if (logout.getTime() > login.getTime() && logout.getTime() <= person.endAt.getTime()) {
            b.emit(logout, AuditActionKey.AUTH_LOGOUT, person, 'User', person.id, { payload: null, mobile }, false);
          }
        }
      }
    }
    // Mot de passe oublié : deux à quatre fois en trois ans pour les membres de longue date.
    const years = (person.endAt.getTime() - person.joinedAt.getTime()) / (365 * DAY);
    const resets = years > 0.6 ? Math.min(4, Math.round(years * 1.2)) : 0;
    for (let i = 0; i < resets; i += 1) {
      const at = workInstant(
        new Date(
          person.joinedAt.getTime() +
            (0.15 + ((i + rng() * 0.6) / Math.max(resets, 1)) * 0.8) *
              (person.endAt.getTime() - person.joinedAt.getTime())
        ),
        rng,
        8,
        17
      );
      b.emit(
        at,
        AuditActionKey.AUTH_PASSWORD_RESET_REQUESTED,
        person,
        'User',
        person.id,
        { payload: { channel: 'email' } },
        false
      );
      b.emit(
        new Date(at.getTime() + between(rng, 4, 40) * 60_000),
        AuditActionKey.AUTH_PASSWORD_RESET_COMPLETED,
        person,
        'User',
        person.id,
        {
          payload: null
        },
        false
      );
    }
  }
}

/** Vie de l'équipe : invitations, arrivées, changements de rôle, suspension, retrait. */
async function genTeamEvents(g: Gen): Promise<void> {
  const { b, ctx } = g;
  const { prisma, tenantId, adminUserId, rng, end } = ctx;
  const admin = b.people.find(p => p.id === adminUserId) ?? b.people[0];

  const invitations = await prisma.invitation.findMany({
    where: { tenantId },
    select: {
      id: true,
      email: true,
      status: true,
      roleIds: true,
      createdAt: true,
      acceptedBy: true,
      acceptedAt: true,
      revokedAt: true
    }
  });
  for (const inv of invitations) {
    b.emit(inv.createdAt, AuditActionKey.USER_INVITED, admin, 'Invitation', inv.id, {
      payload: { email: inv.email, roleIds: inv.roleIds }
    });
    if (inv.status === 'ACCEPTED' && inv.acceptedBy && inv.acceptedAt) {
      const person = b.people.find(p => p.id === inv.acceptedBy);
      if (person) {
        b.emit(
          new Date(inv.acceptedAt.getTime() - 20 * 60_000),
          AuditActionKey.AUTH_EMAIL_VERIFIED,
          person,
          'User',
          person.id,
          {
            payload: null
          }
        );
        if (person.id !== adminUserId) {
          b.emit(inv.acceptedAt, AuditActionKey.ROLE_ASSIGNED, admin, 'UserRole', person.id, {
            payload: { roleIds: inv.roleIds }
          });
        }
      }
    }
    if (inv.status === 'REVOKED' && inv.revokedAt) {
      b.emit(
        inv.revokedAt,
        AuditActionKey.USER_UPDATED,
        admin,
        'Invitation',
        inv.id,
        {
          payload: { action: 'invitation_revoked', email: inv.email }
        },
        false
      );
    }
  }

  const memberships = await prisma.membership.findMany({
    where: { tenantId, status: MembershipStatus.DISABLED },
    select: { id: true, userId: true, updatedAt: true, user: { select: { isActive: true } } }
  });
  for (const m of memberships) {
    const person = b.people.find(p => p.id === m.userId);
    if (!person) continue;
    b.emit(m.updatedAt, AuditActionKey.USER_DISABLED, admin, 'Membership', m.id, { payload: { userId: m.userId } });
    b.emit(new Date(m.updatedAt.getTime() + 60_000), AuditActionKey.SESSIONS_REVOKED, admin, 'User', m.userId, {
      payload: { count: between(rng, 1, 3) }
    });
    if (!m.user.isActive) {
      // Ancien membre retiré : ses rôles sont retirés.
      b.emit(new Date(m.updatedAt.getTime() + 2 * 60_000), AuditActionKey.ROLE_REMOVED, admin, 'UserRole', m.userId, {
        payload: { roleIds: [] }
      });
    }
  }

  // Un agent suspendu trois semaines puis réintégré, en cours d'histoire (état final : actif).
  const candidate = b.people.find(
    p =>
      p.status === MembershipStatus.ACTIVE &&
      p.roleKey === 'TENANT_AGENT' &&
      end.getTime() - p.joinedAt.getTime() > 400 * DAY
  );
  if (candidate) {
    const off = new Date(candidate.joinedAt.getTime() + 0.55 * (end.getTime() - candidate.joinedAt.getTime()));
    b.emit(
      off,
      AuditActionKey.USER_DISABLED,
      admin,
      'Membership',
      `${candidate.id}-pause`,
      { payload: { userId: candidate.id, reason: 'Congé longue durée' } },
      false
    );
    b.emit(
      daysAfter(off, between(rng, 18, 28)),
      AuditActionKey.USER_ENABLED,
      admin,
      'Membership',
      `${candidate.id}-pause`,
      { payload: { userId: candidate.id } },
      false
    );
  }

  // Un changement de rôle (promotion) : un agent devient gestionnaire, un autre reçoit les droits de comptabilité.
  const promoted = b.people.find(
    p => p.roleKey === 'TENANT_MANAGER' && p.id !== adminUserId && end.getTime() - p.joinedAt.getTime() > 500 * DAY
  );
  if (promoted) {
    const at = new Date(promoted.joinedAt.getTime() + 0.35 * (end.getTime() - promoted.joinedAt.getTime()));
    b.emit(
      at,
      AuditActionKey.ROLE_ASSIGNED,
      admin,
      'UserRole',
      `${promoted.id}-promotion`,
      {
        payload: { roleIds: ['TENANT_MANAGER'], previous: ['TENANT_AGENT'], reason: 'Promotion' }
      },
      false
    );
    b.emit(
      new Date(at.getTime() + 30_000),
      AuditActionKey.ROLE_REMOVED,
      admin,
      'UserRole',
      `${promoted.id}-promotion`,
      {
        payload: { roleIds: ['TENANT_AGENT'] }
      },
      false
    );
  }

  // Réinitialisations de mot de passe par l'administrateur.
  for (const person of sample(
    b.people.filter(p => p.id !== adminUserId && p.status === MembershipStatus.ACTIVE),
    3
  )) {
    const at = workInstant(
      new Date(person.joinedAt.getTime() + rng() * 0.6 * (end.getTime() - person.joinedAt.getTime()) + 20 * DAY),
      rng
    );
    b.emit(
      at,
      AuditActionKey.PASSWORD_RESET,
      admin,
      'User',
      `${person.id}-reset`,
      { payload: { userId: person.id } },
      false
    );
  }

  // Modules activés à la création, réglages de l'agence au fil du temps.
  const modules = await prisma.tenantModule.findMany({
    where: { tenantId, enabled: true },
    select: { moduleKey: true }
  });
  for (const mod of modules) {
    b.emit(
      new Date(b.founded.getTime() + 4 * 60_000),
      AuditActionKey.MODULE_ENABLED,
      admin,
      'TenantModule',
      mod.moduleKey,
      {
        payload: { moduleKey: mod.moduleKey }
      }
    );
  }
  const settingsChanges: Array<{ field: string; before: unknown; after: unknown }> = [
    { field: 'contactPhone', before: null, after: '+225 27 22 44 55 66' },
    { field: 'address', before: 'Cocody', after: 'Cocody Riviera 3, Abidjan' },
    { field: 'logoUrl', before: null, after: '(logo téléversé)' },
    { field: 'contactEmail', before: 'contact@agence.test', after: 'direction@agence.test' }
  ];
  settingsChanges.forEach((c, i) => {
    const at = workInstant(new Date(b.founded.getTime() + (20 + i * 260 + between(rng, 0, 80)) * DAY), rng, 9, 16);
    b.emit(
      at,
      AuditActionKey.TENANT_UPDATED,
      admin,
      'Tenant',
      tenantId,
      { changes: { [c.field]: { before: c.before, after: c.after } } },
      false
    );
  });
}

interface RowLite {
  id: string;
  at: Date;
  [key: string]: unknown;
}

async function safeRows(ctx: HistoryContext, label: string, query: Prisma.Sql): Promise<RowLite[]> {
  try {
    const rows = await ctx.prisma.$queryRaw<Array<Record<string, unknown>>>(query);
    return rows.map(r => ({ ...r, id: String(r.id), at: new Date(r.at as string | Date) }));
  } catch (error) {
    ctx.log(
      `journal : source ${label} illisible (${error instanceof Error ? error.message.split('\n').pop() : error}).`
    );
    return [];
  }
}

const SAMPLE = 110;

/** Objets déjà créés par les modules : une création, des modifications, des étapes. */
async function genEntityEvents(g: Gen): Promise<void> {
  const { b, ctx } = g;
  const { tenantId, rng, end } = ctx;
  const T = tenantId;

  // Biens
  const properties = await safeRows(
    ctx,
    'properties',
    Prisma.sql`SELECT id, created_at AS at, internal_reference AS ref, title, status FROM properties WHERE tenant_id = ${T} ORDER BY created_at`
  );
  for (const p of sample(properties, SAMPLE)) {
    const label = [p.ref, p.title].filter(Boolean).join(' – ');
    const creator = b.actor(COMMERCIAL, p.at);
    b.emit(p.at, AuditActionKey.PROPERTY_CREATED, creator, 'PROPERTY', p.id, {
      payload: { title: p.title, reference: p.ref }
    });
    const updates = rng() < 0.7 ? between(rng, 1, 3) : 0;
    for (let i = 1; i <= updates; i += 1) {
      const at = new Date(p.at.getTime() + between(rng, 8, 140) * i * DAY);
      if (at.getTime() >= end.getTime()) continue;
      const field = pick(rng, ['price', 'description', 'surface', 'status', 'address']);
      b.emit(
        at,
        AuditActionKey.PROPERTY_UPDATED,
        b.actor(COMMERCIAL, at),
        'PROPERTY',
        p.id,
        {
          payload: { reference: p.ref },
          changes:
            field === 'price'
              ? { price: { before: between(rng, 40, 80) * 100000, after: between(rng, 80, 140) * 100000 } }
              : { [field]: { before: '(ancienne valeur)', after: '(nouvelle valeur)' } }
        },
        false
      );
    }
    if (p.status === 'AVAILABLE' && rng() < 0.6) {
      const at = new Date(p.at.getTime() + between(rng, 1, 12) * DAY);
      b.emit(at, AuditActionKey.PROPERTY_PUBLISHED, b.actor(COMMERCIAL, at), 'PROPERTY', p.id, {
        payload: { reference: p.ref, label }
      });
    }
  }
  const media = await safeRows(
    ctx,
    'property_media',
    Prisma.sql`SELECT id, created_at AS at, property_id, file_name FROM property_media WHERE tenant_id = ${T} ORDER BY created_at`
  );
  for (const m of sample(media, 70)) {
    b.emit(m.at, AuditActionKey.PROPERTY_MEDIA_UPLOADED, b.actor(COMMERCIAL, m.at), 'PROPERTY_MEDIA', m.id, {
      payload: { propertyId: m.property_id, fileName: m.file_name }
    });
  }

  // Contacts, affaires, activités, visites
  const contacts = await safeRows(
    ctx,
    'crm_contacts',
    Prisma.sql`SELECT id, created_at AS at, status FROM crm_contacts WHERE tenant_id = ${T} ORDER BY created_at`
  );
  for (const c of sample(contacts, SAMPLE)) {
    b.emit(c.at, AuditActionKey.CRM_CONTACT_CREATED, b.actor(COMMERCIAL, c.at), 'CONTACT', c.id, {
      payload: { status: c.status }
    });
    if (rng() < 0.35) {
      const at = new Date(c.at.getTime() + between(rng, 3, 90) * DAY);
      b.emit(
        at,
        AuditActionKey.CRM_CONTACT_UPDATED,
        b.actor(COMMERCIAL, at),
        'CONTACT',
        c.id,
        {
          changes: { phone: { before: '(ancien numéro)', after: '(nouveau numéro)' } }
        },
        false
      );
    }
    if (c.status === 'ACTIVE_CLIENT' && rng() < 0.5) {
      const at = new Date(c.at.getTime() + between(rng, 5, 60) * DAY);
      b.emit(at, AuditActionKey.CRM_CONTACT_CONVERTED, b.actor(COMMERCIAL, at), 'CONTACT', c.id, {
        payload: { to: 'ACTIVE_CLIENT' }
      });
    }
  }
  const deals = await safeRows(
    ctx,
    'crm_deals',
    Prisma.sql`SELECT id, created_at AS at, type, stage FROM crm_deals WHERE tenant_id = ${T} ORDER BY created_at`
  );
  const STAGES = ['NEW', 'QUALIFIED', 'VISIT', 'NEGOTIATION', 'WON'];
  for (const d of sample(deals, SAMPLE)) {
    b.emit(d.at, AuditActionKey.CRM_DEAL_CREATED, b.actor(COMMERCIAL, d.at), 'DEAL', d.id, {
      payload: { type: d.type }
    });
    const finalIndex = d.stage === 'LOST' ? 2 : Math.max(0, STAGES.indexOf(String(d.stage)));
    for (let i = 1; i <= finalIndex; i += 1) {
      const at = new Date(d.at.getTime() + between(rng, 3, 25) * i * DAY);
      if (at.getTime() >= end.getTime()) break;
      b.emit(
        at,
        AuditActionKey.CRM_DEAL_STAGE_CHANGED,
        b.actor(COMMERCIAL, at),
        'DEAL',
        `${d.id}`,
        {
          payload: { from: STAGES[i - 1], to: STAGES[i] }
        },
        false
      );
    }
    if (d.stage === 'LOST') {
      const at = new Date(d.at.getTime() + between(rng, 20, 90) * DAY);
      if (at.getTime() < end.getTime()) {
        b.emit(
          at,
          AuditActionKey.CRM_DEAL_STAGE_CHANGED,
          b.actor(COMMERCIAL, at),
          'DEAL',
          d.id,
          { payload: { from: STAGES[2], to: 'LOST' } },
          false
        );
      }
    }
  }
  const activities = await safeRows(
    ctx,
    'crm_activities',
    Prisma.sql`SELECT id, created_at AS at FROM crm_activities WHERE tenant_id = ${T} ORDER BY created_at`
  );
  for (const a of sample(activities, 90))
    b.emit(a.at, AuditActionKey.CRM_ACTIVITY_CREATED, b.actor(COMMERCIAL, a.at), 'ACTIVITY', a.id, { payload: null });
  const visits = await safeRows(
    ctx,
    'property_visits',
    Prisma.sql`SELECT id, created_at AS at, property_id FROM property_visits WHERE tenant_id = ${T} ORDER BY created_at`
  );
  for (const v of sample(visits, 80)) {
    b.emit(v.at, AuditActionKey.PROPERTY_VISIT_SCHEDULED, b.actor(COMMERCIAL, v.at), 'PROPERTY_VISIT', v.id, {
      payload: { propertyId: v.property_id }
    });
  }

  // Baux : révision de loyer annuelle, avenants, documents générés
  const leases = await safeRows(
    ctx,
    'rental_leases',
    Prisma.sql`SELECT id, created_at AS at, lease_number AS num, status FROM rental_leases WHERE tenant_id = ${T} ORDER BY created_at`
  );
  for (const l of sample(leases, 40)) {
    const age = (end.getTime() - l.at.getTime()) / DAY;
    if (age > 380 && rng() < 0.7) {
      const at = new Date(l.at.getTime() + 365 * DAY + between(rng, 0, 20) * DAY);
      if (at.getTime() < end.getTime()) {
        b.emit(at, AuditActionKey.RENTAL_LEASE_RENT_REVISED, b.actor(MANAGERS, at), 'RENTAL_LEASE', l.id, {
          payload: { leaseNumber: l.num, revisionPercent: pick(rng, [3, 5, 5, 7]) }
        });
      }
    }
    if (rng() < 0.18) {
      const at = new Date(l.at.getTime() + between(rng, 60, 300) * DAY);
      if (at.getTime() < end.getTime())
        b.emit(at, AuditActionKey.RENTAL_LEASE_AMENDED, b.actor(MANAGERS, at), 'RENTAL_LEASE', l.id, {
          payload: { leaseNumber: l.num, object: 'Avenant' }
        });
    }
  }
  const documents = await safeRows(
    ctx,
    'rental_documents',
    Prisma.sql`SELECT id, created_at AS at, type, title FROM rental_documents WHERE tenant_id = ${T} ORDER BY created_at`
  );
  for (const d of sample(documents, 80)) {
    b.emit(d.at, AuditActionKey.RENTAL_DOCUMENT_GENERATED, b.actor(COMMERCIAL, d.at), 'RENTAL_DOCUMENT', d.id, {
      payload: { type: d.type, title: d.title }
    });
  }

  // Maintenance
  const tickets = await safeRows(
    ctx,
    'maintenance_tickets',
    Prisma.sql`SELECT id, created_at AS at, title FROM maintenance_tickets WHERE tenant_id = ${T} ORDER BY created_at`
  );
  for (const t of sample(tickets, 80))
    b.emit(t.at, AuditActionKey.MAINTENANCE_TICKET_CREATED, b.actor(COMMERCIAL, t.at), 'MAINTENANCE_TICKET', t.id, {
      payload: { title: t.title }
    });
  const vendors = await safeRows(
    ctx,
    'maintenance_vendors',
    Prisma.sql`SELECT id, created_at AS at, name FROM maintenance_vendors WHERE tenant_id = ${T} ORDER BY created_at`
  );
  vendors.forEach((v, i) => {
    // Les prestataires ont été référencés au fil des trois ans, pas le jour du seed.
    const at = new Date(g.b.founded.getTime() + (30 + i * 120) * DAY);
    b.emit(at, AuditActionKey.MAINTENANCE_VENDOR_CREATED, b.actor(MANAGERS, at), 'MAINTENANCE_VENDOR', v.id, {
      payload: { name: v.name }
    });
    if (i % 3 === 0)
      b.emit(
        new Date(at.getTime() + 200 * DAY),
        AuditActionKey.MAINTENANCE_VENDOR_UPDATED,
        b.actor(MANAGERS, at),
        'MAINTENANCE_VENDOR',
        v.id,
        { payload: { name: v.name } },
        false
      );
  });

  // Relevés propriétaires
  const statements = await safeRows(
    ctx,
    'owner_statements',
    Prisma.sql`SELECT id, created_at AS at, period FROM owner_statements WHERE tenant_id = ${T} ORDER BY created_at`
  );
  for (const s of sample(statements, 60))
    b.emit(s.at, AuditActionKey.DOCUMENT_GENERATED, b.actor(FINANCE, s.at), 'OwnerStatement', s.id, {
      payload: { period: s.period }
    });

  // Modèles de documents
  const templates = await safeRows(
    ctx,
    'document_templates',
    Prisma.sql`SELECT id, created_at AS at, name FROM document_templates WHERE tenant_id = ${T} ORDER BY created_at`
  );
  for (const t of templates) {
    b.emit(t.at, AuditActionKey.DOCUMENT_TEMPLATE_UPLOADED, b.actor(MANAGERS, t.at), 'DocumentTemplate', t.id, {
      payload: { name: t.name }
    });
    b.emit(
      new Date(t.at.getTime() + 15 * 60_000),
      AuditActionKey.DOCUMENT_TEMPLATE_ACTIVATED,
      b.actor(MANAGERS, t.at),
      'DocumentTemplate',
      t.id,
      { payload: { name: t.name } }
    );
  }

  // Syndic : fonds, factures de prestataires
  const funds = await safeRows(
    ctx,
    'syndicate_funds',
    Prisma.sql`SELECT f.id, f.created_at AS at, f.name, f.syndicate_id FROM syndicate_funds f JOIN syndicates s ON s.id = f.syndicate_id WHERE s.tenant_id = ${T} ORDER BY f.created_at`
  );
  funds.forEach((f, i) => {
    const at = new Date(Math.max(f.at.getTime(), g.b.founded.getTime() + (40 + i * 90) * DAY));
    b.emit(at, AuditActionKey.SYNDICATE_FUND_CREATED, b.actor(MANAGERS, at), 'SYNDICATE_FUND', f.id, {
      payload: { syndicateId: f.syndicate_id, name: f.name, currency: 'XOF' }
    });
    if (i % 2 === 0) {
      const adj = new Date(at.getTime() + between(rng, 120, 400) * DAY);
      if (adj.getTime() < end.getTime()) {
        b.emit(
          adj,
          AuditActionKey.SYNDICATE_FUND_BALANCE_ADJUSTED,
          b.actor(MANAGERS, adj),
          'SYNDICATE_FUND',
          f.id,
          {
            payload: { syndicateId: f.syndicate_id, name: f.name },
            changes: { balance: { before: between(rng, 2, 9) * 1000000, after: between(rng, 10, 18) * 1000000 } }
          },
          false
        );
      }
    }
  });
  const providerInvoices = await safeRows(
    ctx,
    'syndic_provider_invoices',
    Prisma.sql`SELECT id, created_at AS at, number, file_name FROM syndic_provider_invoices WHERE tenant_id = ${T} AND file_path IS NOT NULL ORDER BY created_at`
  );
  for (const inv of sample(providerInvoices, 100)) {
    b.emit(
      inv.at,
      AuditActionKey.SYNDIC_PROVIDER_INVOICE_FILE_ATTACHED,
      b.actor(FINANCE, inv.at),
      'SYNDIC_PROVIDER_INVOICE',
      inv.id,
      {
        payload: { number: inv.number, fileName: inv.file_name }
      }
    );
  }
  const receipts = await safeRows(
    ctx,
    'syndic_charge_receipts',
    Prisma.sql`SELECT id, emailed_at AS at, number FROM syndic_charge_receipts WHERE tenant_id = ${T} AND emailed_at IS NOT NULL ORDER BY emailed_at`
  );
  for (const r of sample(receipts, 40)) {
    b.emit(
      new Date(r.at.getTime() + 2 * 3_600_000),
      AuditActionKey.SYNDIC_CHARGE_RECEIPT_EMAIL_RESENT,
      b.actor(MANAGERS, r.at),
      'SYNDIC_CHARGE_RECEIPT',
      r.id,
      { payload: { number: r.number } }
    );
  }

  // Stock de chantier
  const slips = await safeRows(
    ctx,
    'stock_slips',
    Prisma.sql`SELECT id, created_at AS at, kind, year, number FROM stock_slips WHERE tenant_id = ${T} AND kind IN ('RECEIPT','ISSUE') ORDER BY created_at`
  );
  for (const s of sample(slips, 120)) {
    b.emit(
      s.at,
      s.kind === 'RECEIPT' ? AuditActionKey.STOCK_RECEIPT_RECORDED : AuditActionKey.STOCK_ISSUE_RECORDED,
      b.actor(STOCK, s.at),
      'StockSlip',
      s.id,
      {
        payload: { kind: s.kind, year: s.year, number: s.number }
      }
    );
  }
  const counts = await safeRows(
    ctx,
    'stock_counts',
    Prisma.sql`SELECT id, created_at AS at, status, closed_at, validated_at FROM stock_counts WHERE tenant_id = ${T} ORDER BY created_at`
  );
  for (const c of sample(counts, 40)) {
    b.emit(c.at, AuditActionKey.STOCK_COUNT_OPENED, b.actor(STOCK, c.at), 'StockCount', c.id, {
      payload: { status: c.status }
    });
    if (c.closed_at)
      b.emit(
        new Date(c.closed_at as string),
        AuditActionKey.STOCK_COUNT_CLOSED,
        b.actor(STOCK, c.at),
        'StockCount',
        c.id,
        { payload: null }
      );
    if (c.validated_at)
      b.emit(
        new Date(c.validated_at as string),
        AuditActionKey.STOCK_COUNT_VALIDATED,
        b.actor(MANAGERS, c.at),
        'StockCount',
        c.id,
        { payload: null }
      );
  }
  const items = await safeRows(
    ctx,
    'stock_items',
    Prisma.sql`SELECT id, created_at AS at, label FROM stock_items WHERE tenant_id = ${T} ORDER BY created_at`
  );
  for (const it of sample(items, 60))
    b.emit(it.at, AuditActionKey.STOCK_ITEM_CREATED, b.actor(STOCK, it.at), 'StockItem', it.id, {
      payload: { label: it.label }
    });
  const takers = await safeRows(
    ctx,
    'stock_takers',
    Prisma.sql`SELECT id, created_at AS at, full_name FROM stock_takers WHERE tenant_id = ${T} ORDER BY created_at`
  );
  for (const tk of sample(takers, 40))
    b.emit(tk.at, AuditActionKey.STOCK_TAKER_CREATED, b.actor(STOCK, tk.at), 'StockTaker', tk.id, {
      payload: { fullName: tk.full_name }
    });

  // Patrimoine : sinistres, régularisations foncières, liens sécurisés, accès de tiers
  const claims = await safeRows(
    ctx,
    'insurance_claims',
    Prisma.sql`SELECT id, declared_at AS at, status, settled_at, closed_at FROM insurance_claims WHERE tenant_id = ${T} ORDER BY declared_at`
  );
  const CLAIM_FLOW = ['DECLARED', 'INSURER_NOTIFIED', 'EXPERTISE', 'SETTLED'];
  for (const c of claims) {
    b.emit(c.at, AuditActionKey.PATRIMOINE_INSURANCE_CLAIM_DECLARED, b.actor(MANAGERS, c.at), 'InsuranceClaim', c.id, {
      payload: null
    });
    const finalIdx = Math.max(0, CLAIM_FLOW.indexOf(String(c.status)));
    for (let i = 1; i <= finalIdx; i += 1) {
      const at = new Date(c.at.getTime() + i * between(rng, 6, 30) * DAY);
      b.emit(
        at,
        AuditActionKey.PATRIMOINE_INSURANCE_CLAIM_STATUS_CHANGED,
        b.actor(MANAGERS, at),
        'InsuranceClaim',
        c.id,
        { payload: { from: CLAIM_FLOW[i - 1], to: CLAIM_FLOW[i] } },
        false
      );
    }
  }
  const lands = await safeRows(
    ctx,
    'land_regularizations',
    Prisma.sql`SELECT id, created_at AS at, status FROM land_regularizations WHERE tenant_id = ${T} ORDER BY created_at`
  );
  for (const l of lands) {
    b.emit(l.at, AuditActionKey.LAND_REGULARIZATION_CREATED, b.actor(MANAGERS, l.at), 'LandRegularization', l.id, {
      payload: null
    });
  }
  const steps = await safeRows(
    ctx,
    'land_regularization_steps',
    Prisma.sql`SELECT id, COALESCE(completed_at, started_at, created_at) AS at, status, label FROM land_regularization_steps WHERE tenant_id = ${T} ORDER BY created_at`
  );
  for (const s of sample(steps, 40))
    b.emit(s.at, AuditActionKey.LAND_STEP_STATUS_CHANGED, b.actor(MANAGERS, s.at), 'LandRegularizationStep', s.id, {
      payload: { status: s.status, label: s.label }
    });
  const links = await safeRows(
    ctx,
    'secure_links',
    Prisma.sql`SELECT id, created_at AS at, last_viewed_at, view_count FROM secure_links WHERE tenant_id = ${T} ORDER BY created_at`
  );
  for (const l of sample(links, 50)) {
    b.emit(l.at, AuditActionKey.SECURE_LINK_CREATED, b.actor(COMMERCIAL, l.at), 'SecureLink', l.id, { payload: null });
    if (l.last_viewed_at)
      b.emit(
        new Date(l.last_viewed_at as string),
        AuditActionKey.SECURE_LINK_VIEWED,
        null,
        'SecureLink',
        l.id,
        { payload: { views: l.view_count }, system: true },
        false
      );
  }
  const grants = await safeRows(
    ctx,
    'external_access_grants',
    Prisma.sql`SELECT id, created_at AS at, last_viewed_at FROM external_access_grants WHERE tenant_id = ${T} ORDER BY created_at`
  );
  for (const gr of grants) {
    b.emit(
      gr.at,
      AuditActionKey.EXTERNAL_ACCESS_GRANT_CREATED,
      b.actor(MANAGERS, gr.at),
      'ExternalAccessGrant',
      gr.id,
      { payload: null }
    );
    b.emit(
      new Date(gr.at.getTime() + 10 * 60_000),
      AuditActionKey.EXTERNAL_ACCESS_GRANT_LINK_SENT,
      b.actor(MANAGERS, gr.at),
      'ExternalAccessGrant',
      gr.id,
      { payload: { channel: 'email' } },
      false
    );
    if (gr.last_viewed_at)
      b.emit(
        new Date(gr.last_viewed_at as string),
        AuditActionKey.EXTERNAL_ACCESS_GRANT_VIEWED,
        null,
        'ExternalAccessGrant',
        gr.id,
        { payload: null, system: true },
        false
      );
  }
}

/** Téléchargements et exports : comptabilité du mois, quittances, états patrimoniaux, mouvements de stock. */
async function genExports(g: Gen): Promise<void> {
  const { b, ctx } = g;
  const { prisma, tenantId, rng, end } = ctx;
  const accounting = (await prisma.journalEntry.count({ where: { tenantId } })) > 0;
  const stock = (await prisma.stockSlip.count({ where: { tenantId } })) > 0;
  const patrimoine =
    (await prisma.tenantModule.count({ where: { tenantId, moduleKey: 'MODULE_PATRIMOINE', enabled: true } })) > 0;
  const syndic = (await prisma.syndicate.count({ where: { tenantId } })) > 0;
  const rental = (await prisma.rentalLease.count({ where: { tenant_id: tenantId } })) > 0;
  const base = '/api/tenants/:id';
  const months = monthStarts(b.founded, end);
  for (const [index, monthStart] of months.entries()) {
    if (index < 2) continue;
    const prev = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1));
    const tag = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
    const day = (n: number) => new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), n));
    if (accounting) {
      const at = workInstant(day(between(rng, 2, 6)), rng, 8, 17);
      b.emit(
        at,
        AuditActionKey.DATA_EXPORTED,
        b.actor(FINANCE, at),
        'File',
        `${base}/finance/accounting/journal#${tag}`,
        {
          payload: {
            method: 'GET',
            path: `${base}/finance/accounting/journal`,
            contentType: 'text/csv',
            filename: `journal-comptable-${tag}.csv`
          }
        },
        false
      );
      if (prev.getUTCMonth() % 3 === 2) {
        const at2 = workInstant(day(between(rng, 6, 12)), rng, 9, 17);
        b.emit(
          at2,
          AuditActionKey.DATA_EXPORTED,
          b.actor(FINANCE, at2),
          'File',
          `${base}/finance/accounting/trial-balance#${tag}`,
          {
            payload: {
              method: 'GET',
              path: `${base}/finance/accounting/trial-balance`,
              contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              filename: `balance-generale-${tag}.xlsx`
            }
          },
          false
        );
      }
      if (prev.getUTCMonth() === 11) {
        const at3 = workInstant(day(between(rng, 10, 20)), rng, 9, 17);
        b.emit(
          at3,
          AuditActionKey.DATA_EXPORTED,
          b.actor(FINANCE, at3),
          'File',
          `${base}/finance/accounting/general-ledger#${prev.getUTCFullYear()}`,
          {
            payload: {
              method: 'GET',
              path: `${base}/finance/accounting/general-ledger`,
              contentType: 'application/zip',
              filename: `grand-livre-${prev.getUTCFullYear()}.zip`
            }
          },
          false
        );
      }
    }
    if (stock) {
      const at = workInstant(day(between(rng, 3, 9)), rng, 8, 17);
      b.emit(
        at,
        AuditActionKey.DATA_EXPORTED,
        b.actor(STOCK, at),
        'File',
        `${base}/finance/stock/movements/export.csv#${tag}`,
        {
          payload: {
            method: 'GET',
            path: `${base}/finance/stock/movements/export.csv`,
            contentType: 'text/csv',
            filename: `mouvements-stock-${tag}.csv`
          }
        },
        false
      );
    }
    if (patrimoine && prev.getUTCMonth() % 3 === 2) {
      const at = workInstant(day(between(rng, 4, 12)), rng, 9, 17);
      b.emit(
        at,
        AuditActionKey.DATA_EXPORTED,
        b.actor(MANAGERS, at),
        'File',
        `${base}/patrimoine/net-worth/export#${tag}`,
        {
          payload: {
            method: 'GET',
            path: `${base}/patrimoine/net-worth/export`,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            filename: `patrimoine-net-${tag}.xlsx`
          }
        },
        false
      );
    }
    if (syndic && rng() < 0.7) {
      const at = workInstant(day(between(rng, 5, 15)), rng, 8, 17);
      b.emit(
        at,
        AuditActionKey.DOCUMENT_DOWNLOADED,
        b.actor(MANAGERS, at),
        'File',
        fakeUuid(rng),
        {
          payload: {
            method: 'GET',
            path: `${base}/syndics/:id/quittances/impression`,
            contentType: 'application/pdf',
            filename: `quittances-${tag}.pdf`
          }
        },
        false
      );
    }
    // Quittances, contrats et rapports remis aux propriétaires (uniquement si l'agence gère des baux).
    if (rental && rng() < 0.6) {
      const at = workInstant(day(between(rng, 1, 27)), rng, 8, 17);
      b.emit(
        at,
        AuditActionKey.DOCUMENT_DOWNLOADED,
        b.actor(COMMERCIAL, at),
        'File',
        fakeUuid(rng),
        {
          payload: {
            method: 'GET',
            path: `${base}/rental/documents/:id`,
            contentType: 'application/pdf',
            filename: `document-${tag}-${between(rng, 100, 999)}.pdf`
          }
        },
        false
      );
    }
  }
}

/** Refus de droit : les rôles aux menus coupés qui tapent une adresse interdite, de loin en loin. */
function genDenials(g: Gen): void {
  const { b, ctx } = g;
  const { rng, end } = ctx;
  const targets: Array<{ roles: readonly TeamRoleKey[]; path: string; permission: string }> = [
    {
      roles: ['TENANT_AGENT'],
      path: '/api/tenants/:id/finance/accounting/journal',
      permission: 'FINANCE_ACCOUNTS_READ'
    },
    { roles: ['TENANT_AGENT'], path: '/api/tenants/:id/collaborators', permission: 'USERS_VIEW' },
    { roles: ['TENANT_AGENT', 'TENANT_STOREKEEPER'], path: '/api/tenants/:id/audit', permission: 'AUDIT_VIEW' },
    {
      roles: ['TENANT_STOREKEEPER', 'TENANT_SITE_MANAGER'],
      path: '/api/tenants/:id/finance/supplier-payments',
      permission: 'FINANCE_DOCUMENTS_VALIDATE'
    },
    { roles: ['TENANT_ACCOUNTANT'], path: '/api/tenants/:id/crm/deals', permission: 'CRM_DEALS_VIEW' },
    { roles: ['TENANT_SITE_MANAGER'], path: '/api/tenants/:id/settings/finance', permission: 'TENANT_SETTINGS_EDIT' }
  ];
  const total = between(rng, 18, 30);
  for (let i = 0; i < total; i += 1) {
    const target = pick(rng, targets);
    const at = workInstant(
      new Date(b.founded.getTime() + 15 * DAY + rng() * (end.getTime() - b.founded.getTime() - 20 * DAY)),
      rng,
      8,
      17
    );
    const actor = b.actor(target.roles, at);
    if (!target.roles.includes(actor.roleKey)) continue;
    b.emit(
      at,
      AuditActionKey.ACCESS_DENIED,
      actor,
      'Route',
      target.permission,
      {
        payload: { method: 'GET', path: target.path, permission: target.permission },
        outcome: 'DENIED'
      },
      false
    );
  }
  // Un jeton de rafraîchissement rejoué : incident de sécurité unique, sans suite.
  const at = workInstant(new Date(b.founded.getTime() + 0.62 * (end.getTime() - b.founded.getTime())), rng, 8, 17);
  const victim = b.actor(COMMERCIAL, at);
  b.emit(
    at,
    AuditActionKey.AUTH_TOKEN_REUSE_DETECTED,
    victim,
    'User',
    victim.id,
    { payload: { sessionsRevoked: 2 }, outcome: 'SUCCESS' },
    false
  );
  b.emit(
    new Date(at.getTime() + 90_000),
    AuditActionKey.SESSIONS_REVOKED,
    null,
    'User',
    victim.id,
    { payload: { reason: 'token_reuse' }, system: true },
    false
  );
}

/** Tours de l'assistant IA sur la dernière année : jamais le texte des messages. */
function genAssistant(g: Gen): void {
  const { b, ctx } = g;
  const { rng, end } = ctx;
  const since = new Date(end.getTime() - 400 * DAY);
  for (const person of b.people.filter(p => p.roleKey !== 'TENANT_STOREKEEPER')) {
    const from = person.joinedAt.getTime() > since.getTime() ? person.joinedAt : since;
    const to = new Date(Math.min(person.endAt.getTime(), end.getTime()));
    if (to.getTime() <= from.getTime()) continue;
    const turns = Math.round(
      ((to.getTime() - from.getTime()) / (30 * DAY)) * (person.roleKey === 'TENANT_ADMIN' ? 3 : 1.6)
    );
    for (const day of workdays(from, to, turns, rng)) {
      const at = workInstant(day, rng, 8, 17);
      const requestId = fakeUuid(rng);
      b.emit(
        at,
        AuditActionKey.AI_CHAT_TURN,
        person,
        'AI_CONVERSATION',
        requestId,
        {
          payload: {
            requestId,
            provider: 'anthropic',
            outcome: 'done',
            rounds: between(rng, 1, 3),
            toolCalls: between(rng, 0, 4),
            messageCount: between(rng, 1, 8),
            durationMs: between(rng, 1800, 14000)
          },
          requestId
        },
        false
      );
    }
  }
}

export interface AuditResult {
  rows: number;
}

export async function seedAuditJournal(ctx: HistoryContext): Promise<AuditResult> {
  const { prisma, tenantId, log } = ctx;
  const logins = await prisma.auditLog.count({ where: { tenantId, actionKey: AuditActionKey.AUTH_LOGIN_SUCCEEDED } });
  if (logins >= 50) {
    log(`journal : ${logins} connexions déjà tracées, journal non régénéré.`);
    return { rows: 0 };
  }
  const people = await loadPeople(ctx);
  if (people.length === 0) return { rows: 0 };
  const founded = people.reduce((min, p) => (p.joinedAt < min ? p.joinedAt : min), people[0].joinedAt);
  const b = new AuditBuilder(ctx, people, await existingKeys(ctx), founded);
  const g: Gen = { b, ctx };

  genSessions(g);
  await genTeamEvents(g);
  await genEntityEvents(g);
  await genExports(g);
  genDenials(g);
  genAssistant(g);

  await writeAuditRows(ctx, b.rows);
  log(`journal : ${b.rows.length} événement(s) d'audit écrits (${people.length} membres).`);
  return { rows: b.rows.length };
}

// ───────────────────────────────────────────────────────────── marques anti-doublon

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * `notification_markers` : la mémoire « cette alerte est déjà partie pour cet objet »
 * des alertes de fin de bail, d'échéance de prêt, de police d'assurance, de travaux
 * et des relevés mensuels, plus l'état de remise des convocations d'assemblée
 * (lu par l'écran des assemblées du syndic : envoyée, échec, non servie).
 * Aucun envoi réel : ce sont les traces de ce qui est « parti » pendant les trois ans.
 * Les clés reprennent celles des services (`id::AAAA-MM-JJ`).
 */
export async function seedNotificationMarkers(ctx: HistoryContext): Promise<number> {
  const { prisma, tenantId, end, start, rng, log } = ctx;
  const kinds = Object.values(MARKER_KIND);
  if ((await prisma.notificationMarker.count({ where: { tenantId, kind: { in: kinds } } })) > 0) return 0;
  const rows: Prisma.NotificationMarkerCreateManyInput[] = [];
  const clampTime = (d: Date): Date =>
    d.getTime() > end.getTime()
      ? new Date(end.getTime() - 3_600_000)
      : d.getTime() < start.getTime()
        ? new Date(start.getTime() + 3_600_000)
        : d;
  const push = (
    kind: string,
    entityType: string,
    entityId: string,
    payload: Record<string, unknown>,
    at: Date
  ): void => {
    rows.push({
      tenantId,
      kind,
      entityType,
      entityId,
      payload: payload as Prisma.InputJsonValue,
      createdAt: clampTime(at)
    });
  };
  const dayMs = DAY;

  const leases = await safeRows(
    ctx,
    'rental_leases (marques)',
    Prisma.sql`SELECT id, end_date AS at FROM rental_leases WHERE tenant_id = ${tenantId} AND end_date IS NOT NULL AND end_date <= ${new Date(end.getTime() + 90 * dayMs)}`
  );
  for (const l of leases) {
    push(
      MARKER_KIND.leaseEnd,
      'RentalLease',
      `${l.id}::${isoDay(l.at)}`,
      { leaseId: l.id, endDate: l.at.toISOString() },
      new Date(l.at.getTime() - between(rng, 60, 90) * dayMs)
    );
  }
  const loans = await safeRows(
    ctx,
    'property_loans (marques)',
    Prisma.sql`SELECT id, end_date AS at FROM property_loans WHERE tenant_id = ${tenantId} AND end_date <= ${new Date(end.getTime() + 90 * dayMs)}`
  );
  for (const l of loans) {
    push(
      MARKER_KIND.loanMaturity,
      'PropertyLoan',
      `${l.id}::${isoDay(l.at)}`,
      { loanId: l.id, endDate: l.at.toISOString() },
      new Date(l.at.getTime() - between(rng, 30, 60) * dayMs)
    );
  }
  const policies = await safeRows(
    ctx,
    'insurance_policies (marques)',
    Prisma.sql`SELECT id, end_date AS at FROM insurance_policies WHERE tenant_id = ${tenantId} AND end_date <= ${new Date(end.getTime() + 30 * dayMs)}`
  );
  for (const p of policies) {
    push(
      MARKER_KIND.insurancePolicy,
      'InsurancePolicy',
      `${p.id}::POLICY::${isoDay(p.at)}`,
      { id: p.id, kind: 'POLICY', dueDate: p.at.toISOString() },
      new Date(p.at.getTime() - between(rng, 15, 30) * dayMs)
    );
  }
  const works = await safeRows(
    ctx,
    'work_programs (marques)',
    Prisma.sql`SELECT id, planned_date AS at FROM work_programs WHERE tenant_id = ${tenantId} AND planned_date IS NOT NULL AND planned_date <= ${new Date(end.getTime() + 30 * dayMs)}`
  );
  for (const w of works) {
    push(
      MARKER_KIND.workUpcoming,
      'WorkProgram',
      `${w.id}::${isoDay(w.at)}`,
      { workProgramId: w.id, plannedDate: w.at.toISOString() },
      new Date(w.at.getTime() - between(rng, 5, 15) * dayMs)
    );
  }
  const statements = await safeRows(
    ctx,
    'owner_statements (marques)',
    Prisma.sql`SELECT id, created_at AS at, period FROM owner_statements WHERE tenant_id = ${tenantId} AND status = 'SENT'`
  );
  for (const s of statements) {
    push(
      MARKER_KIND.ownerMonthlyReport,
      'OwnerStatement',
      s.id,
      { statementId: s.id, period: s.period, channel: 'email' },
      new Date(s.at.getTime() + 3_600_000)
    );
  }

  // Convocations d'assemblée : un copropriétaire distinct par ligne, la grande majorité servie.
  const meetings = await safeRows(
    ctx,
    'general_meetings (marques)',
    Prisma.sql`SELECT m.id, m.scheduled_at AS at, m.syndicate_id FROM general_meetings m JOIN syndicates s ON s.id = m.syndicate_id WHERE s.tenant_id = ${tenantId} AND m.scheduled_at < ${end} ORDER BY m.scheduled_at`
  );
  for (const m of meetings) {
    const owners = await safeRows(
      ctx,
      'syndicate_lots (marques)',
      Prisma.sql`SELECT DISTINCT owner_contact_id AS id, now() AS at FROM syndicate_lots WHERE syndicate_id = ${m.syndicate_id}::uuid AND owner_contact_id IS NOT NULL AND general_shares > 0 LIMIT 60`
    );
    for (const owner of owners) {
      const roll = rng();
      const status = roll < 0.9 ? 'SENT' : roll < 0.96 ? 'FAILED' : 'NOT_SERVED';
      push(
        MARKER_KIND.convocationDelivery,
        'GeneralMeeting',
        m.id,
        { contactId: owner.id, status },
        new Date(m.at.getTime() - between(rng, 15, 25) * dayMs + between(rng, 0, 600) * 1000)
      );
    }
  }
  if (rows.length > 0) await prisma.notificationMarker.createMany({ data: rows });
  log(`marques anti-doublon : ${rows.length} écrite(s).`);
  return rows.length;
}
