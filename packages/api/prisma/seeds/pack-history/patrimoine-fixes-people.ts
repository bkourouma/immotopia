/**
 * PATRIMOINE (correctifs, 2e vague) : les personnes autour du patrimoine.
 *
 *  - Contacts CRM : créés par `core-communication` (qui s'exécute après) ; les visites s'y rattachent
 *    quand ils existent déjà, sinon elles restent sans contact.
 *  - Visites : calendrier des visites vide. Visites passées (faites, absents, annulées) et à
 *    venir (planifiées, confirmées) sur les biens vacants, à vendre ou à la location, plus
 *    quelques rendez-vous d'évaluation et de suivi sur les biens loués.
 *  - Portail propriétaire : un compte de démonstration pour un co-propriétaire en indivision, qui
 *    voit les biens, loyers et documents qui lui sont ouverts.
 *
 * Idempotent par bloc (contacts : e-mail ; visites : le tenant en a déjà ; portail : e-mail).
 */
import type { Prisma } from '@prisma/client';
import { hashPassword } from '../../../src/utils/password-utils';
import { PACK_TEST_PASSWORD } from '../pack-test-tenants';
import { addDays, between, pick } from './types';
import type { PatState } from './patrimoine-extras-state';

const DAY = 86_400_000;

// ------------------------------------------------------------------ visites

type VisitStatus = 'SCHEDULED' | 'CONFIRMED' | 'DONE' | 'NO_SHOW' | 'CANCELED';

export async function seedVisits(s: PatState): Promise<void> {
  const { prisma, tenantId, end, start, rng, log } = s.ctx;
  if ((await prisma.propertyVisit.count({ where: { tenantId } })) >= 8) return;

  const contacts = await prisma.crmContact.findMany({
    where: { tenantId, status: { not: 'ARCHIVED' } },
    select: { id: true, status: true, locationZone: true }
  });
  const prospects = contacts.filter(c => c.status === 'LEAD');
  const props = await prisma.property.findMany({
    where: { tenantId },
    select: {
      id: true,
      title: true,
      locationZone: true,
      status: true,
      isPublished: true,
      transactionModes: true,
      propertyType: true
    }
  });
  if (props.length === 0) return;

  // Biens « en vitrine » (vacants, à vendre, à louer, sous offre) puis quelques biens loués (suivi).
  const showcase = props.filter(
    p =>
      p.status !== 'RENTED' &&
      p.status !== 'SOLD' &&
      (p.isPublished || p.status === 'AVAILABLE' || p.status === 'UNDER_OFFER' || p.status === 'RESERVED')
  );
  const rented = props.filter(p => p.status === 'RENTED');
  const target = s.isPro ? 24 : 14;
  const rows: Prisma.PropertyVisitUncheckedCreateInput[] = [];
  const staff = s.staff;
  const hours = [9, 10, 11, 14, 15, 16, 17];
  const used = new Set<string>();

  const slot = (day: Date, propertyId: string): Date => {
    for (let t = 0; t < 12; t++) {
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), pick(rng, hours), pick(rng, [0, 30]), 0, 0);
      const key = `${propertyId}:${at.getTime()}`;
      if (!used.has(key)) {
        used.add(key);
        return at;
      }
    }
    return day;
  };
  const workday = (from: Date, to: Date): Date => {
    for (let t = 0; t < 20; t++) {
      const d = new Date(from.getTime() + rng() * (to.getTime() - from.getTime()));
      if (d.getDay() !== 0) return d;
    }
    return from;
  };

  for (let n = 0; n < target; n++) {
    const future = n < Math.max(6, Math.round(target * 0.3));
    const useRented = n % 4 === 3 && rented.length > 0;
    const pool = useRented ? rented : showcase.length > 0 ? showcase : props;
    const prop = pick(rng, pool);
    const contact = !useRented && prospects.length > 0 ? pick(rng, prospects) : null;
    let at: Date;
    let status: VisitStatus;
    if (future) {
      at = slot(workday(addDays(end, 1), addDays(end, 24)), prop.id);
      status = rng() < 0.55 ? 'CONFIRMED' : 'SCHEDULED';
    } else {
      // Surtout les six derniers mois, avec une traîne sur les trente-six.
      const from = n % 3 === 0 ? start : addDays(end, -180);
      at = slot(workday(from, addDays(end, -1)), prop.id);
      const r = rng();
      status = r < 0.68 ? 'DONE' : r < 0.82 ? 'NO_SHOW' : 'CANCELED';
    }
    const appointment = useRented;
    rows.push({
      propertyId: prop.id,
      tenantId,
      contactId: contact?.id ?? null,
      visitType: appointment ? 'APPOINTMENT' : 'VISIT',
      goal: appointment
        ? pick(rng, ['EVALUATION', 'FOLLOW_UP'] as const)
        : pick(rng, ['CONTACT_TAKING', 'NEGOTIATION', 'CONTRACT_SIGNING', 'FOLLOW_UP'] as const),
      scheduledAt: at,
      duration: pick(rng, [30, 45, 60]),
      location: `Sur site — ${prop.locationZone ?? 'Abidjan'}`,
      status,
      assignedToUserId: pick(rng, staff),
      notes: appointment
        ? status === 'DONE'
          ? 'Visite de contrôle : état général satisfaisant, quelques retouches à prévoir.'
          : 'Rendez-vous de suivi avec le locataire et l’entreprise intervenante.'
        : status === 'DONE'
          ? 'Visite effectuée, le client doit revenir vers l’agence sous quinzaine.'
          : status === 'NO_SHOW'
            ? 'Le visiteur ne s’est pas présenté, à relancer.'
            : status === 'CANCELED'
              ? 'Visite annulée à la demande du visiteur.'
              : 'Visite à confirmer par téléphone la veille.',
      createdAt: new Date(Math.min(at.getTime(), end.getTime()) - between(rng, 2, 10) * DAY)
    });
  }

  let collaborators = 0;
  for (const data of rows) {
    // eslint-disable-next-line no-await-in-loop -- une vingtaine de visites.
    const visit = await prisma.propertyVisit.create({ data, select: { id: true } });
    if (staff.length > 1 && rng() < 0.3) {
      const other = staff.find(u => u !== data.assignedToUserId);
      if (other) {
        // eslint-disable-next-line no-await-in-loop -- idem.
        await prisma.propertyVisitCollaborator.create({ data: { visitId: visit.id, userId: other } });
        collaborators += 1;
      }
    }
  }
  log(
    `patrimoine-correctifs : ${rows.length} visite(s) (${rows.filter(r => r.scheduledAt > end).length} à venir), ${collaborators} accompagnateur(s).`
  );
}

// ------------------------------------------------------------------ portail propriétaire

/**
 * Compte de démonstration d'un co-propriétaire en indivision (portail propriétaire) : un
 * utilisateur, son profil propriétaire de l'agence, la propriété de quelques biens (ouvrant le
 * périmètre du portail) et sa quote-part. Les réglages du portail existent déjà.
 */
export async function seedOwnerPortalAccount(s: PatState): Promise<{ email: string; shares: number } | null> {
  const { prisma, tenantId, end, rng, log } = s.ctx;
  const profile = s.isPro
    ? {
        email: 'aicha.kouassi@packs.immotopia.test',
        fullName: 'Aïcha Kouassi',
        pick: ['PAT-APP-ANGRE', 'PAT-VIL-RIVIERA', 'PAT-BUR-PLATEAU', 'PAT-APP-RIV3']
      }
    : {
        email: 'marie-laure.yao@packs.immotopia.test',
        fullName: 'Marie-Laure Yao',
        pick: ['PAT-APP-ANGRE', 'PAT-VIL-RIVIERA', 'PAT-BUR-PLATEAU']
      };

  let user = await prisma.user.findUnique({ where: { email: profile.email }, select: { id: true } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: profile.email,
        passwordHash: await hashPassword(PACK_TEST_PASSWORD),
        fullName: profile.fullName,
        globalRole: 'USER',
        emailVerified: true,
        isActive: true,
        preferredLanguage: 'fr',
        createdAt: new Date(end.getTime() - 400 * DAY)
      },
      select: { id: true }
    });
  }
  const userId = user.id;

  let client = await prisma.tenantClient.findFirst({
    where: { tenantId, userId, clientType: 'OWNER' },
    select: { id: true }
  });
  if (!client) {
    client = await prisma.tenantClient.create({
      data: {
        tenantId,
        userId,
        clientType: 'OWNER',
        details: { source: 'pack-history', role: 'Co-propriétaire en indivision' }
      },
      select: { id: true }
    });
  }

  let shares = 0;
  const shareOptions = [50, 40, 30, 25];
  for (const [i, ref] of profile.pick.entries()) {
    const prop = s.properties.find(p => p.ref === ref);
    if (!prop) continue;
    await prisma.property.update({ where: { id: prop.id }, data: { ownerUserId: userId } });
    const exists = await prisma.propertyOwnershipShare.findFirst({
      where: { propertyId: prop.id, ownerClientId: client.id },
      select: { id: true }
    });
    if (!exists) {
      await prisma.propertyOwnershipShare.create({
        data: {
          tenantId,
          propertyId: prop.id,
          ownerClientId: client.id,
          sharePercent: shareOptions[i % shareOptions.length],
          updatedByUserId: pick(rng, s.staff)
        }
      });
      shares += 1;
    }
  }
  if (shares > 0)
    log(`patrimoine-correctifs : compte portail propriétaire ${profile.email} (${shares} quote(s)-part).`);
  return { email: profile.email, shares };
}
