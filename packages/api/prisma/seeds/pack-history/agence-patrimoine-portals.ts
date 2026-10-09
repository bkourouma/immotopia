/**
 * Portails propriétaire et locataire activés, avec de vrais comptes de connexion.
 *
 * L'accès à un portail ne dépend d'aucun drapeau : il suffit d'un compte `User` relié à un
 * `TenantClient` OWNER (portail propriétaire, biens sous mandat actif) ou RENTER avec un bail
 * actif (portail locataire). Les comptes créés par les baux portaient un mot de passe aléatoire
 * et un e-mail technique ; ce bloc en fait des comptes utilisables en démonstration :
 * e-mail `prenom.nom@packs.immotopia.test`, mot de passe commun des comptes de test, e-mail
 * vérifié, fiche CRM alignée sur l'e-mail, et `ownerPortalEnabled` posé (la colonne sert de
 * témoin « portail activé » aux deux types de clients) avec une dernière connexion récente
 * pour la plupart. La moitié des propriétaires (ceux qui gèrent le plus de biens) et dix
 * locataires en bail actif sont ouverts.
 */
import { hashPassword } from '../../../src/utils/password-utils';
import { PACK_TEST_EMAIL_DOMAIN, PACK_TEST_PASSWORD } from '../pack-test-tenants';
import type { HistoryContext } from './types';
import { addDaysTo } from './agence-patrimoine-state';

const slug = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const COMPANY_PREFIX = /^(sarl|sa|sas|snc|gie|sci|ets)\b/i;

interface Candidate {
  clientId: string;
  userId: string;
  fullName: string;
  oldEmail: string;
  crmContactId: string | null;
  weight: number;
}

async function uniqueEmail(ctx: HistoryContext, fullName: string): Promise<string> {
  const parts = fullName.trim().split(/\s+/);
  const first = slug(parts[0] ?? 'client');
  const last = slug(parts.slice(1).join(' ') || 'client');
  const base = `${first}.${last}`;
  for (let n = 1; n < 50; n++) {
    const email = `${base}${n === 1 ? '' : n}@${PACK_TEST_EMAIL_DOMAIN}`;
    const taken = await ctx.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!taken) return email;
  }
  return `${base}.${Date.now()}@${PACK_TEST_EMAIL_DOMAIN}`;
}

async function activate(ctx: HistoryContext, picked: Candidate[], hash: string): Promise<number> {
  const { prisma, tenantId, end, rng } = ctx;
  let count = 0;
  for (const [i, c] of picked.entries()) {
    const email = await uniqueEmail(ctx, c.fullName);
    const lastLogin = i % 5 === 4 ? null : addDaysTo(end, -Math.floor(rng() * 40) - 1);
    await prisma.user.update({
      where: { id: c.userId },
      data: { email, passwordHash: hash, emailVerified: true, isActive: true, lastLoginAt: lastLogin }
    });
    if (c.crmContactId) {
      await prisma.crmContact.updateMany({
        where: { id: c.crmContactId, tenantId },
        data: { email }
      });
    }
    await prisma.tenantClient.update({
      where: { id: c.clientId },
      data: { ownerPortalEnabled: true, ownerPortalLastAccess: lastLogin }
    });
    count += 1;
  }
  return count;
}

export async function seedPortalAccounts(ctx: HistoryContext): Promise<void> {
  const { prisma, tenantId, log } = ctx;
  const clients = await prisma.tenantClient.findMany({
    where: { tenantId, clientType: { in: ['OWNER', 'RENTER'] } },
    select: {
      id: true,
      userId: true,
      clientType: true,
      ownerPortalEnabled: true,
      details: true,
      user: { select: { fullName: true, email: true } }
    },
    orderBy: { createdAt: 'asc' }
  });
  const owners = clients.filter(c => c.clientType === 'OWNER');
  const renters = clients.filter(c => c.clientType === 'RENTER');
  const ownersTarget = Math.ceil(owners.length / 2);
  const rentersTarget = Math.min(10, Math.ceil(renters.length / 3));
  const ownersOn = owners.filter(c => c.ownerPortalEnabled).length;
  const rentersOn = renters.filter(c => c.ownerPortalEnabled).length;
  if (ownersOn >= ownersTarget && rentersOn >= rentersTarget) {
    log(`portails : ${ownersOn} propriétaire(s) et ${rentersOn} locataire(s) déjà ouverts, bloc sauté.`);
    return;
  }

  const toCandidate = (c: (typeof clients)[number], weight: number): Candidate => ({
    clientId: c.id,
    userId: c.userId,
    fullName: c.user.fullName ?? c.user.email,
    oldEmail: c.user.email,
    crmContactId:
      typeof (c.details as { crmContactId?: unknown } | null)?.crmContactId === 'string'
        ? ((c.details as { crmContactId: string }).crmContactId as string)
        : null,
    weight
  });

  // Propriétaires : ceux qui gèrent le plus de biens sous mandat actif (le portail a de quoi montrer).
  const shares = await prisma.propertyOwnershipShare.groupBy({
    by: ['ownerClientId'],
    where: { tenantId },
    _count: { _all: true }
  });
  const sharesBy = new Map(shares.map(s => [s.ownerClientId, s._count._all]));
  const ownerPick = owners
    .filter(c => !c.ownerPortalEnabled)
    .map(c => toCandidate(c, sharesBy.get(c.id) ?? 0))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, Math.max(0, ownersTarget - ownersOn));

  // Locataires : personnes physiques en bail actif, avec le plus de règlements.
  const leases = await prisma.rentalLease.findMany({
    where: { tenant_id: tenantId, status: 'ACTIVE' },
    select: { primary_renter_client_id: true, _count: { select: { installments: true } } }
  });
  const activeBy = new Map<string, number>();
  for (const l of leases) {
    activeBy.set(
      l.primary_renter_client_id,
      Math.max(activeBy.get(l.primary_renter_client_id) ?? 0, l._count.installments)
    );
  }
  const renterPick = renters
    .filter(c => !c.ownerPortalEnabled && activeBy.has(c.id) && !COMPANY_PREFIX.test(c.user.fullName ?? ''))
    .map(c => toCandidate(c, activeBy.get(c.id) ?? 0))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, Math.max(0, rentersTarget - rentersOn));

  const hash = await hashPassword(PACK_TEST_PASSWORD);
  const o = await activate(ctx, ownerPick, hash);
  const r = await activate(ctx, renterPick, hash);
  log(
    `portails : ${o} portail(s) propriétaire et ${r} portail(s) locataire ouverts (e-mail prenom.nom@${PACK_TEST_EMAIL_DOMAIN}).`
  );
}
