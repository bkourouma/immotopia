import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../src/utils/database';
import { containsFoldedSql } from '../../src/utils/sql-text-search';
import { listMeetingsPage } from '../../src/lib/syndics/meeting-reads';
import { meetingsListQuerySchema } from '../../src/lib/syndics/schemas';
import { listGatewayPayouts } from '../../src/lib/syndics/online-payment/payout';

const enabled = Boolean(process.env.DATABASE_URL_TEST) && process.env.DATABASE_URL === process.env.DATABASE_URL_TEST;
const sqlDescribe = enabled ? describe : describe.skip;
const tenants: string[] = [];
let tenantId: string;
let syndicId: string;
let otherSyndicId: string;
jest.setTimeout(120_000);

async function seedAgency() {
  const suffix = randomUUID();
  const tenant = await prisma.tenant.create({
    data: { name: `UI pagination ${suffix}`, slug: `ui-pages-${suffix}`, type: 'AGENCY', status: 'ACTIVE' }
  });
  tenants.push(tenant.id);
  const syndic = await prisma.syndicate.create({
    data: { tenantId: tenant.id, name: 'Residence pagination', address: 'Adresse de test' }
  });
  return { tenantId: tenant.id, syndicId: syndic.id };
}

sqlDescribe('pagination et recherche sur historique syndic complet (SQL reel)', () => {
  beforeAll(async () => {
    const agency = await seedAgency();
    tenantId = agency.tenantId;
    syndicId = agency.syndicId;
    otherSyndicId = (await seedAgency()).syndicId;
    await prisma.generalMeeting.createMany({
      data: Array.from({ length: 5001 }, (_, i) => ({
        syndicateId: syndicId,
        type: i === 0 ? ('EXTRAORDINARY' as const) : ('ORDINARY' as const),
        status: i === 0 ? ('COMPLETED' as const) : ('PLANNED' as const),
        scheduledAt: new Date(Date.UTC(2000, 0, 1 + i)),
        location: i === 0 ? 'Salle des fêtes 100% lot_7' : `Salle ${i}`
      }))
    });
    const journal = await prisma.accountingJournal.create({
      data: { tenantId, syndicateId: syndicId, journalType: 'BANK', code: 'UI', label: 'Test', fiscalYear: 2026 }
    });
    await prisma.journalEntry.createMany({
      data: Array.from({ length: 205 }, (_, i) => ({
        tenantId,
        journalId: journal.id,
        reference: `REV-UI-${i}`,
        documentType: 'SYNDIC_GATEWAY_PAYOUT',
        description: i === 0 ? 'UI-0 | épargne 100% lot_7' : `UI-${i}`,
        entryDate: new Date(Date.UTC(2026, 0, 1 + i)),
        sourceType: 'MANUAL' as const
      }))
    });
  });

  afterAll(async () => {
    for (const id of tenants) {
      await prisma.generalMeeting.deleteMany({ where: { syndicate: { tenantId: id } } });
      await prisma.journalEntry.deleteMany({ where: { tenantId: id } });
      await prisma.accountingJournal.deleteMany({ where: { tenantId: id } });
      await prisma.syndicate.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });

  it('plie les accents sans activer les jokers SQL de la saisie', async () => {
    const result = await prisma.$queryRaw<Array<{ matches: boolean }>>(
      Prisma.sql`SELECT ${containsFoldedSql(Prisma.sql`'FÊTES 100% lot_7'`, 'fetes 100% lot_7')} AS matches`
    );
    expect(result[0].matches).toBe(true);
    const literal = await prisma.$queryRaw<Array<{ matches: boolean }>>(
      Prisma.sql`SELECT ${containsFoldedSql(Prisma.sql`'Fêtes 100A lotA7'`, '100% lot_7')} AS matches`
    );
    expect(literal[0].matches).toBe(false);
  });

  it('recherche une AG au-dela des5000premieres sans charger cet historique dans le navigateur', async () => {
    const result = await listMeetingsPage(
      tenantId,
      syndicId,
      meetingsListQuerySchema.parse({ page: 1, limit: 20, search: 'FETES 100% lot_7' })
    );
    expect(result.pagination.total).toBe(1);
    expect(result.items[0].location).toBe('Salle des fêtes 100% lot_7');
  });

  it('pagine la derniere AG sans perdre le total', async () => {
    const result = await listMeetingsPage(tenantId, syndicId, meetingsListQuerySchema.parse({ page: 251, limit: 20 }));
    expect(result.pagination.total).toBe(5001);
    expect(result.items).toHaveLength(1);
  });

  it('preserve les mots repartis entre lieu et type sans imposer leur ordre', async () => {
    const result = await listMeetingsPage(
      tenantId,
      syndicId,
      meetingsListQuerySchema.parse({ search: 'extraordinaire lot_7 fetes' })
    );
    expect(result.pagination.total).toBe(1);
  });

  it('combine types, statuts et jours avant de compter', async () => {
    const result = await listMeetingsPage(
      tenantId,
      syndicId,
      meetingsListQuerySchema.parse({
        type: 'EXTRAORDINARY',
        status: 'COMPLETED,CANCELLED',
        from: '2000-01-01',
        to: '2000-01-01'
      })
    );
    expect(result.pagination.total).toBe(1);
  });

  it('ne rend ni le total ni les lignes dune copropriete dune autre agence', async () => {
    await expect(listMeetingsPage(tenantId, otherSyndicId, meetingsListQuerySchema.parse({}))).rejects.toMatchObject({
      status: 403
    });
  });

  it('recherche un reversement au-dela des200derniers avec accents et jokers litteraux', async () => {
    const result = await listGatewayPayouts(tenantId, syndicId, { page: 1, limit: 20, search: 'EPARGNE 100% lot_7' });
    expect(result.pagination?.total).toBe(1);
    expect(result.items[0].reference).toBe('UI-0');
  });

  it('pagine les reversements en gardant un ordre stable et le total complet', async () => {
    const result = await listGatewayPayouts(tenantId, syndicId, { page: 11, limit: 20 });
    expect(result.pagination?.total).toBe(205);
    expect(result.items).toHaveLength(5);
  });
});
