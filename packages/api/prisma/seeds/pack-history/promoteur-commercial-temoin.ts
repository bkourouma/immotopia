/**
 * Visites de l'appartement témoin et de la villa témoin : une dizaine de visites
 * par mois depuis l'ouverture du bureau de vente, passées (faites, absentes,
 * annulées) et à venir (calendrier des visites).
 */
import { between, pick } from './types';
import { addDays } from './agence-commercial-data';
import { createVisit } from './promoteur-commercial-crm';
import type { ContactRef } from './promoteur-commercial-crm';
import { PROGRAMS } from './promoteur-commercial-data';
import type { PEnv, ProgCode } from './promoteur-commercial-data';

export async function seedTemoinVisits(env: PEnv, contacts: ContactRef[]): Promise<void> {
  const { prisma, tenantId, rng, ctx, staff, log } = env;
  const temoins = await prisma.property.findMany({
    where: { tenantId, internalReference: { endsWith: '-TEMOIN' } },
    select: { id: true, internalReference: true, createdAt: true }
  });
  let n = 0;
  for (const t of temoins) {
    const code = t.internalReference.split('-')[0] as ProgCode;
    const program = PROGRAMS[code];
    if (!program) continue;
    const already = await prisma.propertyVisit.count({ where: { tenantId, propertyId: t.id } });
    if (already > 0) continue;
    const days = Math.floor((ctx.end.getTime() - t.createdAt.getTime()) / 86_400_000);
    const past = Math.min(44, Math.max(10, Math.round(days / 12)));
    const where = `Bureau de vente — ${program.brand}`;
    const eligible = (when: Date): ContactRef[] =>
      contacts.filter(c => c.createdAt.getTime() < when.getTime() - 86_400_000);
    for (let i = 0; i < past; i++) {
      const when = addDays(t.createdAt, 5 + Math.floor((days - 8) * ((i + rng() * 0.9) / past)));
      if (when > addDays(ctx.end, -1)) continue;
      when.setHours(pick(rng, [9, 10, 11, 14, 15, 16]), pick(rng, [0, 30]), 0, 0);
      const pool = eligible(when);
      if (pool.length === 0) continue;
      const contact = pick(rng, pool);
      const r = rng();
      await createVisit(env, {
        propertyId: t.id,
        contactId: contact.id,
        dealId: null,
        at: when,
        status: r < 0.74 ? 'DONE' : r < 0.86 ? 'NO_SHOW' : 'CANCELED',
        userId: pick(rng, staff),
        location: where,
        goal: pick(rng, ['CONTACT_TAKING', 'EVALUATION'] as const),
        notes:
          r < 0.74
            ? 'Visite du lot témoin et présentation du plan de masse ; brochure et grille de prix remises.'
            : undefined
      });
      n += 1;
    }
    // À venir : une visite tous les deux jours ouvrés environ sur les trois prochaines semaines.
    for (let i = 0; i < 7; i++) {
      const when = addDays(ctx.end, 1 + i * 3 + between(rng, 0, 2));
      when.setHours(pick(rng, [9, 10, 11, 14, 15, 16]), pick(rng, [0, 30]), 0, 0);
      const pool = contacts.filter(c => c.status === 'LEAD');
      if (pool.length === 0) break;
      await createVisit(env, {
        propertyId: t.id,
        contactId: pick(rng, pool).id,
        dealId: null,
        at: when,
        status: rng() < 0.55 ? 'CONFIRMED' : 'SCHEDULED',
        userId: pick(rng, staff),
        location: where,
        goal: 'CONTACT_TAKING'
      });
      n += 1;
    }
  }
  log(`promoteur-commercial : ${n} visites des lots témoins.`);
}
