/**
 * Recherche multicritères des listes du CRM (lot DIV-A) : contacts, affaires,
 * activités.
 *
 * Trois niveaux :
 *  - lecture validée des paramètres (`crm-query-params`) : 400 sur valeur invalide ;
 *  - clause Prisma (`crm-list-where`) : toujours filtrée par `tenantId`, un
 *    identifiant reçu reste dans le `where` de l'agence ;
 *  - contrôleurs : les paramètres HTTP arrivent aux services, jamais de 500.
 */
jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({
  getTenantIdFromRequest: () => 'tenant-1'
}));

const listContactsMock = jest.fn().mockResolvedValue({
  contacts: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
});
const listDealsMock = jest.fn().mockResolvedValue({
  deals: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
});
const listActivitiesMock = jest.fn().mockResolvedValue({
  activities: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
});

jest.mock('../../src/services/crm-contact-service', () => ({
  listContacts: (...a: unknown[]) => listContactsMock(...a)
}));
jest.mock('../../src/services/crm-deal-service', () => ({
  listDeals: (...a: unknown[]) => listDealsMock(...a)
}));
jest.mock('../../src/services/crm-activity-service', () => ({
  listActivities: (...a: unknown[]) => listActivitiesMock(...a)
}));
jest.mock('../../src/services/crm-tag-service', () => ({}));
jest.mock('../../src/services/crm-dashboard-service', () => ({}));

import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../src/middleware/error-middleware';
import { listActivitiesHandler, listContactsHandler, listDealsHandler } from '../../src/controllers/crm-controller';
import { buildActivityListWhere, buildContactListWhere, buildDealListWhere } from '../../src/services/crm-list-where';
import {
  parseDateParam,
  parseEnumListParam,
  parseIdListParam,
  parseIdParam,
  parseSearchParam,
  periodEnd,
  periodStart
} from '../../src/utils/crm-query-params';

const app = express();
app.get('/api/tenants/:tenantId/crm/contacts', listContactsHandler);
app.get('/api/tenants/:tenantId/crm/deals', listDealsHandler);
app.get('/api/tenants/:tenantId/crm/activities', listActivitiesHandler);
app.use(errorHandler);

const BASE = '/api/tenants/tenant-1/crm';

beforeEach(() => {
  listContactsMock.mockClear();
  listDealsMock.mockClear();
  listActivitiesMock.mockClear();
});

describe('crm-query-params', () => {
  it('énumération multiple : valeurs séparées par des virgules, doublons ignorés', () => {
    expect(parseEnumListParam('NEW, VISIT,NEW', ['NEW', 'VISIT', 'WON'], 'stage')).toEqual(['NEW', 'VISIT']);
    expect(parseEnumListParam(['NEW', 'WON'], ['NEW', 'VISIT', 'WON'], 'stage')).toEqual(['NEW', 'WON']);
  });

  it('énumération : absent ou vide = rien à filtrer, valeur inconnue = 400', () => {
    expect(parseEnumListParam(undefined, ['NEW'], 'stage')).toBeUndefined();
    expect(parseEnumListParam('', ['NEW'], 'stage')).toBeUndefined();
    expect(() => parseEnumListParam('NEW,BOGUS', ['NEW'], 'stage')).toThrow(/stage/);
  });

  it('texte libre : rogné, borné à 100 caractères, une seule valeur', () => {
    expect(parseSearchParam('  awa  ')).toBe('awa');
    expect(parseSearchParam('   ')).toBeUndefined();
    expect(() => parseSearchParam('x'.repeat(101))).toThrow(/search/);
    expect(() => parseSearchParam(['a', 'b'])).toThrow(/search/);
  });

  it('identifiants : bornés, liste dédoublonnée', () => {
    expect(parseIdParam(' abc ', 'contactId')).toBe('abc');
    expect(() => parseIdParam('x'.repeat(65), 'contactId')).toThrow(/contactId/);
    expect(parseIdListParam('a,b,a', 'tagIds')).toEqual(['a', 'b']);
  });

  it('dates : aaaa-mm-jj ou ISO, sinon 400 ; fin de période = jour entier', () => {
    expect(parseDateParam('2026-10-31', 'endDate')).toBe('2026-10-31');
    expect(() => parseDateParam('31/10/2026', 'endDate')).toThrow(/endDate/);
    expect(() => parseDateParam('2026-13-45', 'endDate')).toThrow(/endDate/);
    // Jour inexistant : ne devient pas le 3 mars.
    expect(() => parseDateParam('2026-02-31', 'endDate')).toThrow(/endDate/);
    expect(periodStart('2026-10-31').toISOString()).toBe('2026-10-31T00:00:00.000Z');
    expect(periodEnd('2026-10-31').toISOString()).toBe('2026-10-31T23:59:59.999Z');
  });
});

describe('clause Prisma des listes CRM', () => {
  it('affaires : tenantId toujours posé, étapes multiples, contact et collaborateur dans le where', () => {
    const where = buildDealListWhere('tenant-1', {
      stage: ['NEW', 'VISIT'],
      type: 'ACHAT',
      contactId: 'contact-autre-agence',
      assignedTo: 'user-autre-agence'
    });
    expect(where).toMatchObject({
      tenantId: 'tenant-1',
      stage: { in: ['NEW', 'VISIT'] },
      type: 'ACHAT',
      contactId: 'contact-autre-agence',
      assignedToUserId: 'user-autre-agence'
    });
  });

  it('affaires : une seule étape = égalité simple (colonne du kanban)', () => {
    expect(buildDealListWhere('tenant-1', { stage: ['QUALIFIED'] }).stage).toBe('QUALIFIED');
  });

  it('affaires : search cherche dans le contact, la zone et le collaborateur', () => {
    const where = buildDealListWhere('tenant-1', { search: 'Cocody' });
    const or = where.AND[0].OR as Array<Record<string, unknown>>;
    expect(or).toEqual(
      expect.arrayContaining([
        { locationZone: { contains: 'Cocody', mode: 'insensitive' } },
        { contact: { lastName: { contains: 'Cocody', mode: 'insensitive' } } },
        { contact: { legalName: { contains: 'Cocody', mode: 'insensitive' } } },
        { contact: { email: { contains: 'Cocody', mode: 'insensitive' } } },
        { assignedTo: { fullName: { contains: 'Cocody', mode: 'insensitive' } } }
      ])
    );
    expect(where.tenantId).toBe('tenant-1');
  });

  it('affaires : search et budget se cumulent (ET)', () => {
    const where = buildDealListWhere('tenant-1', { search: 'awa', budgetMin: 1000 });
    expect(where.AND).toHaveLength(2);
  });

  it('affaires : zéro est une borne de budget valide', () => {
    const min = buildDealListWhere('tenant-1', { budgetMin: 0 });
    expect(min.AND).toEqual([{ OR: [{ budgetMax: { gte: 0 } }, { budgetMin: { gte: 0 } }] }]);

    const max = buildDealListWhere('tenant-1', { budgetMax: 0 });
    expect(max.AND).toEqual([{ OR: [{ budgetMin: { lte: 0 } }, { budgetMax: { lte: 0 } }] }]);

    const exact = buildDealListWhere('tenant-1', { budgetMin: 0, budgetMax: 0 });
    expect(exact.AND).toHaveLength(1);
    expect(exact.AND[0].OR).toHaveLength(3);
    expect(exact.AND[0].OR[0]).toEqual({ AND: [{ budgetMin: { lte: 0 } }, { budgetMax: { gte: 0 } }] });
  });

  it('affaires : période, jour de fin inclus', () => {
    const where = buildDealListWhere('tenant-1', { startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(where.createdAt.gte.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(where.createdAt.lte.toISOString()).toBe('2026-10-31T23:59:59.999Z');
  });

  it('activités : types multiples, direction, prochaine action, auteur', () => {
    const where = buildActivityListWhere('tenant-1', {
      type: ['CALL', 'EMAIL'],
      direction: 'IN',
      hasNextAction: true,
      createdBy: 'user-1',
      contactId: 'contact-1'
    });
    expect(where).toMatchObject({
      tenantId: 'tenant-1',
      activityType: { in: ['CALL', 'EMAIL'] },
      direction: 'IN',
      nextActionAt: { not: null },
      createdByUserId: 'user-1',
      contactId: 'contact-1'
    });
    expect(buildActivityListWhere('tenant-1', { hasNextAction: false }).nextActionAt).toBeNull();
  });

  it('activités : search cherche sujet, contenu, résultat, contact et auteur', () => {
    const where = buildActivityListWhere('tenant-1', { search: 'devis' });
    const or = where.AND[0].OR as Array<Record<string, unknown>>;
    expect(or).toEqual(
      expect.arrayContaining([
        { subject: { contains: 'devis', mode: 'insensitive' } },
        { content: { contains: 'devis', mode: 'insensitive' } },
        { outcome: { contains: 'devis', mode: 'insensitive' } },
        { contact: { lastName: { contains: 'devis', mode: 'insensitive' } } },
        { createdBy: { fullName: { contains: 'devis', mode: 'insensitive' } } }
      ])
    );
  });

  it('contacts : statuts multiples, type, maturité, téléphone et raison sociale dans la recherche', () => {
    const where = buildContactListWhere('tenant-1', {
      status: ['LEAD', 'ACTIVE_CLIENT'],
      contactType: ['COMPANY'],
      maturityLevel: ['HOT', 'WARM'],
      leadSource: ['WEBSITE', 'REFERRAL'],
      search: '0707'
    });
    expect(where).toMatchObject({
      tenantId: 'tenant-1',
      status: { in: ['LEAD', 'ACTIVE_CLIENT'] },
      contactType: 'COMPANY',
      maturityLevel: { in: ['HOT', 'WARM'] },
      leadSource: { in: ['WEBSITE', 'REFERRAL'] }
    });
    const or = where.AND[0].OR as Array<Record<string, unknown>>;
    expect(or).toEqual(
      expect.arrayContaining([
        { phonePrimary: { contains: '0707', mode: 'insensitive' } },
        { whatsappNumber: { contains: '0707', mode: 'insensitive' } },
        { legalName: { contains: '0707', mode: 'insensitive' } },
        // L'ancien champ texte « source » reste trouvable par le champ libre.
        { source: { contains: '0707', mode: 'insensitive' } }
      ])
    );
  });

  it("contacts : les étiquettes demandées sont celles de l'agence (une étiquette d'une autre agence ne ramène rien)", () => {
    const where = buildContactListWhere('tenant-1', { tagIds: ['tag-a', 'tag-b'] });
    expect(where.AND).toEqual([{ tags: { some: { tag: { id: { in: ['tag-a', 'tag-b'] }, tenantId: 'tenant-1' } } } }]);
  });

  it('contacts : période, affaire en cours, activité à venir', () => {
    const where = buildContactListWhere('tenant-1', {
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      hasActiveDeal: true,
      hasUpcomingActivity: false
    });
    expect(where.createdAt.lte.toISOString()).toBe('2026-10-31T23:59:59.999Z');
    expect(where.AND).toHaveLength(2);
  });
});

describe('GET /crm/deals', () => {
  it('transmet recherche, étapes, budget et période au service', async () => {
    const res = await request(app).get(
      `${BASE}/deals?search=%20Awa%20&stage=NEW,VISIT&type=ACHAT&budgetMin=1000&budgetMax=5000&startDate=2026-10-01&endDate=2026-10-31&assignedTo=u1&contactId=c1&page=2&limit=30`
    );
    expect(res.status).toBe(200);
    expect(listDealsMock).toHaveBeenCalledWith('tenant-1', {
      search: 'Awa',
      stage: ['NEW', 'VISIT'],
      type: ['ACHAT'],
      budgetMin: 1000,
      budgetMax: 5000,
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      assignedTo: 'u1',
      contactId: 'c1',
      page: 2,
      limit: 30
    });
  });

  it('kanban : une requête par colonne = filtre stage seul + limite 30', async () => {
    await request(app).get(`${BASE}/deals?stage=QUALIFIED&limit=30&page=1`);
    expect(listDealsMock).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ stage: ['QUALIFIED'], limit: 30, page: 1 })
    );
  });

  it.each([
    ['stage=BOGUS'],
    ['type=NOPE'],
    ['budgetMin=abc'],
    ['budgetMax=1e3'],
    ['startDate=hier'],
    ['endDate=2026-02-31x'],
    ['search=' + 'x'.repeat(101)],
    ['search=a&search=b'],
    ['limit=0']
  ])('paramètre invalide (%s) : 400, service non appelé', async query => {
    const res = await request(app).get(`${BASE}/deals?${query}`);
    expect(res.status).toBe(400);
    expect(listDealsMock).not.toHaveBeenCalled();
  });
});

describe('GET /crm/activities', () => {
  it('transmet recherche, types, direction, auteur et période', async () => {
    const res = await request(app).get(
      `${BASE}/activities?search=devis&type=CALL,EMAIL&direction=IN&hasNextAction=true&createdBy=u1&contactId=c1&startDate=2026-10-01&endDate=2026-10-31`
    );
    expect(res.status).toBe(200);
    expect(listActivitiesMock).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        search: 'devis',
        type: ['CALL', 'EMAIL'],
        direction: ['IN'],
        hasNextAction: true,
        createdBy: 'u1',
        contactId: 'c1',
        startDate: '2026-10-01',
        endDate: '2026-10-31'
      })
    );
  });

  it.each([['type=APPEL'], ['direction=SIDEWAYS'], ['hasNextAction=peut-etre'], ['startDate=nimporte']])(
    'paramètre invalide (%s) : 400',
    async query => {
      const res = await request(app).get(`${BASE}/activities?${query}`);
      expect(res.status).toBe(400);
      expect(listActivitiesMock).not.toHaveBeenCalled();
    }
  );
});

describe('GET /crm/contacts', () => {
  it('transmet les critères que la page envoyait déjà sans qu’ils soient lus (période, affaire, activité, étiquettes)', async () => {
    const res = await request(app).get(
      `${BASE}/contacts?search=awa&status=LEAD,ACTIVE_CLIENT&contactType=COMPANY&maturityLevel=HOT&leadSource=WEBSITE,CAMPAIGN&tagIds=t1,t2&startDate=2026-10-01&endDate=2026-10-31&hasActiveDeal=true&hasUpcomingActivity=false&assignedTo=u1&source=Facebook`
    );
    expect(res.status).toBe(200);
    expect(listContactsMock).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        search: 'awa',
        status: ['LEAD', 'ACTIVE_CLIENT'],
        contactType: ['COMPANY'],
        maturityLevel: ['HOT'],
        leadSource: ['WEBSITE', 'CAMPAIGN'],
        tagIds: ['t1', 't2'],
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        hasActiveDeal: true,
        hasUpcomingActivity: false,
        assignedTo: 'u1',
        source: 'Facebook'
      })
    );
  });

  it('tagIds répété (tagIds=a&tagIds=b) accepté', async () => {
    await request(app).get(`${BASE}/contacts?tagIds=a&tagIds=b`);
    expect(listContactsMock).toHaveBeenCalledWith('tenant-1', expect.objectContaining({ tagIds: ['a', 'b'] }));
  });

  it.each([
    ['status=ARCHIVE'],
    ['contactType=ROBOT'],
    ['maturityLevel=TIEDE'],
    ['leadSource=ONDIT'],
    ['hasActiveDeal=oui'],
    ['endDate=x']
  ])('paramètre invalide (%s) : 400', async query => {
    const res = await request(app).get(`${BASE}/contacts?${query}`);
    expect(res.status).toBe(400);
    expect(listContactsMock).not.toHaveBeenCalled();
  });
});
