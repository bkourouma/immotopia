/**
 * SYNDIC — portail copropriétaire : de VRAIS comptes de connexion.
 *
 * Les profils de propriétaires de lot portent `portalAccessEnabled = true` sur une partie des lots, mais
 * aucun compte `User` ne pouvait s'y connecter. La garde `requireCoOwnerPortalAccess` attend :
 *   - un `User` actif ;
 *   - un `TenantClient` de l'agence dont `details.syndicCoOwnerContactIds` liste les fiches CRM ouvertes ;
 *   - des `LotOwnerProfile` actifs, `portalAccessEnabled`, non clos, sur ces fiches.
 * Mot de passe commun des comptes de test (`PACK_TEST_PASSWORD`), e-mails `prenom.nom@packs.immotopia.test`.
 * Aucun e-mail n'est envoyé.
 *
 * Idempotent : une fiche déjà liée à un compte de l'agence est sautée.
 * Les locataires de lots n'ont pas de portail propre (le portail locataire exige un bail de location
 * de l'agence) : seuls les copropriétaires reçoivent un compte.
 */
import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import { hashPassword } from '../../../src/utils/password-utils';
import { COOWNER_CONTACT_IDS_KEY } from '../../../src/lib/syndics/coowner-portal';
import { PACK_TEST_EMAIL_DOMAIN, PACK_TEST_PASSWORD } from '../pack-test-tenants';
import { addDays, between, slug, type SyndicEnv } from './syndic-extras-common';

const SOURCE = 'pack-history:syndic-fixes';

export async function seedCoOwnerPortalAccounts(env: SyndicEnv): Promise<void> {
  const { prisma, tenantId, rng, end } = env;

  const linked = await prisma.tenantClient.findMany({
    where: { tenantId, clientType: 'CO_OWNER' },
    select: { details: true }
  });
  const alreadyLinked = new Set<string>();
  for (const c of linked) {
    const raw = (c.details as Record<string, unknown> | null)?.[COOWNER_CONTACT_IDS_KEY];
    if (Array.isArray(raw)) for (const id of raw) if (typeof id === 'string') alreadyLinked.add(id);
  }

  // propriétaires actuels dont l'accès au portail est ouvert, plus quelques autres pour les copropriétés peu dotées
  const profiles = await prisma.lotOwnerProfile.findMany({
    where: { lot: { syndicate: { tenantId } }, isActive: true, ownedUntil: null },
    select: {
      id: true,
      contactId: true,
      portalAccessEnabled: true,
      portalAccessToken: true,
      lot: { select: { syndicateId: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true, createdAt: true } }
    },
    orderBy: { id: 'asc' }
  });
  const byContact = new Map<string, typeof profiles>();
  for (const p of profiles) byContact.set(p.contactId, [...(byContact.get(p.contactId) ?? []), p]);

  const chosen: string[] = [];
  for (const [contactId, rows] of byContact) {
    if (alreadyLinked.has(contactId)) continue;
    if (rows.some(r => r.portalAccessEnabled)) chosen.push(contactId);
  }
  // une copropriété sans aucun accès ouvert : en ouvrir quelques-uns (choix stable par empreinte)
  for (const s of env.syndicates) {
    const hasOpen = [...byContact.values()].some(
      rows =>
        rows.some(r => r.lot.syndicateId === s.id) &&
        (alreadyLinked.has(rows[0].contactId) || chosen.includes(rows[0].contactId))
    );
    if (hasOpen) continue;
    const pool = [...byContact.entries()]
      .filter(([id, rows]) => !alreadyLinked.has(id) && rows.some(r => r.lot.syndicateId === s.id))
      .sort((a, b) => hashOf(a[0]) - hashOf(b[0]))
      .slice(0, 4);
    for (const [id] of pool) chosen.push(id);
  }
  if (chosen.length === 0) return;

  const passwordHash = await hashPassword(PACK_TEST_PASSWORD);
  let created = 0;
  let reused = 0;
  for (const contactId of chosen) {
    const rows = byContact.get(contactId)!;
    const contact = rows[0].contact;
    const base = `${slug(contact.firstName)}.${slug(contact.lastName)}`;
    // l'e-mail est unique sur toute la base : un homonyme d'une autre agence de test partage le compte
    let email = `${base}@${PACK_TEST_EMAIL_DOMAIN}`;
    let user = await prisma.user.findUnique({ where: { email }, select: { id: true, isActive: true } });
    for (let n = 2; user && !(await isPortalSeedUser(env, user.id)); n++) {
      email = `${base}${n}@${PACK_TEST_EMAIL_DOMAIN}`;
      user = await prisma.user.findUnique({ where: { email }, select: { id: true, isActive: true } });
    }
    const createdAt = addDays(contact.createdAt, between(rng, 5, 60));
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          fullName: `${contact.firstName} ${contact.lastName}`,
          globalRole: 'USER',
          emailVerified: true,
          isActive: true,
          preferredLanguage: 'fr',
          createdAt: createdAt > end ? addDays(end, -30) : createdAt,
          lastLoginAt: rng() < 0.6 ? addDays(end, -between(rng, 0, 28)) : addDays(end, -between(rng, 29, 220))
        },
        select: { id: true, isActive: true }
      });
      created++;
    } else reused++;

    const details = {
      crmContactId: contactId,
      [COOWNER_CONTACT_IDS_KEY]: [contactId],
      source: SOURCE
    } as Prisma.InputJsonValue;
    const client = await prisma.tenantClient.findFirst({
      where: { userId: user.id, tenantId },
      select: { id: true, details: true }
    });
    if (client) {
      const old = (client.details ?? {}) as Record<string, unknown>;
      const ids = new Set<string>(
        Array.isArray(old[COOWNER_CONTACT_IDS_KEY]) ? (old[COOWNER_CONTACT_IDS_KEY] as string[]) : []
      );
      ids.add(contactId);
      await prisma.tenantClient.update({
        where: { id: client.id },
        data: { details: { ...old, [COOWNER_CONTACT_IDS_KEY]: [...ids] } as Prisma.InputJsonValue }
      });
    } else {
      await prisma.tenantClient.create({
        data: {
          userId: user.id,
          tenantId,
          clientType: 'CO_OWNER',
          details,
          createdAt: createdAt > end ? undefined : createdAt
        }
      });
    }
    // la fiche CRM porte l'adresse de connexion (une seule fiche par e-mail dans l'agence)
    const clash = await prisma.crmContact.findFirst({
      where: { tenantId, email, id: { not: contactId } },
      select: { id: true }
    });
    if (!clash && contact.email !== email)
      await prisma.crmContact.update({ where: { id: contactId }, data: { email } });
    for (const p of rows) {
      await prisma.lotOwnerProfile.update({
        where: { id: p.id },
        data: {
          portalAccessEnabled: true,
          portalAccessToken:
            p.portalAccessToken ?? createHash('sha256').update(`portal:${p.id}`).digest('hex').slice(0, 32)
        }
      });
    }
  }
  env.log(
    `syndic-fixes portail : ${chosen.length} copropriétaire(s) avec identifiant (${created} compte(s) créé(s), ${reused} réutilisé(s))`
  );
}

const hashOf = (text: string): number => createHash('md5').update(text).digest().readUInt32BE(0);

/** Compte créé par ce bloc (donc réutilisable pour un homonyme d'une autre agence de test). */
async function isPortalSeedUser(env: SyndicEnv, userId: string): Promise<boolean> {
  const client = await env.prisma.tenantClient.findFirst({
    where: { userId, clientType: 'CO_OWNER', details: { path: ['source'], equals: SOURCE } },
    select: { id: true }
  });
  return Boolean(client);
}
