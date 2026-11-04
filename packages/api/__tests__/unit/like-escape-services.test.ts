/**
 * Les recherches texte des services échappent les jokers LIKE (pourcentage,
 * tiret bas, barre oblique inverse) avant de les passer à `contains` : la
 * saisie est cherchée telle quelle.
 */
const mockPrisma = {
  crmContact: { findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
  newsletterTemplate: { findMany: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/utils/sanitize-html', () => ({ sanitizeHtml: (s: string) => s }));

import { buildContactListWhere, buildDealListWhere, buildActivityListWhere } from '../../src/services/crm-list-where';
import { searchContacts, getFieldSuggestions } from '../../src/services/contact-search.service';
import { listTemplates } from '../../src/services/newsletter-template.service';
import {
  buildOwnerLeasesSearch,
  buildOwnerPaymentsSearch,
  buildOwnerDocumentsSearch
} from '../../src/services/portal-list-filters/owner-portal-list-filters';
import {
  buildTenantInstallmentsSearch,
  buildTenantPaymentsSearch
} from '../../src/services/portal-list-filters/tenant-portal-list-filters';

/** Une seule barre oblique inverse (évite toute ambiguïté d'écriture dans le source). */
const BS = String.fromCharCode(92);
const PCT100 = `100${BS}%`;
const LOT7 = `lot${BS}_7`;

/** Toutes les valeurs de `contains` trouvées dans une structure. */
function containsValues(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach(n => containsValues(n, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'contains' && typeof v === 'string') out.push(v);
      else containsValues(v, out);
    }
  }
  return out;
}

describe('échappement des jokers LIKE dans les services', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['100%', PCT100],
    ['lot_7', LOT7],
    [`a${BS}b`, `a${BS}${BS}b`],
    ['Dupont', 'Dupont']
  ])('CRM : « %s » devient la valeur échappée attendue', (saisie, attendu) => {
    for (const where of [
      buildContactListWhere('t1', { search: saisie } as never),
      buildDealListWhere('t1', { search: saisie } as never),
      buildActivityListWhere('t1', { search: saisie } as never)
    ]) {
      const values = containsValues(where);
      expect(values.length).toBeGreaterThan(0);
      expect(new Set(values)).toEqual(new Set([attendu]));
    }
  });

  it('recherche de contacts : q et filtres échappés, tenantId conservé', async () => {
    mockPrisma.crmContact.findMany.mockResolvedValue([]);
    mockPrisma.crmContact.count.mockResolvedValue(0);
    await searchContacts('t1', { searchQuery: ' 100% ', city: 'lot_7' } as never);
    const where = mockPrisma.crmContact.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"tenantId":"t1"');
    const values = containsValues(where);
    expect(values).toContain(PCT100);
    expect(values).toContain(LOT7);
    expect(values).not.toContain('100%');
  });

  it('suggestions de champ : la requête est échappée', async () => {
    mockPrisma.crmContact.groupBy.mockResolvedValue([]);
    await getFieldSuggestions('t1', 'city', 'lot_7');
    expect(containsValues(mockPrisma.crmContact.groupBy.mock.calls[0][0].where)).toEqual([LOT7]);
  });

  it('modèles de newsletter : le nom cherché est échappé', async () => {
    mockPrisma.newsletterTemplate.findMany.mockResolvedValue([]);
    await listTemplates('t1', { search: '100%' });
    const where = mockPrisma.newsletterTemplate.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('t1');
    expect(containsValues(where)).toEqual([PCT100]);
  });

  it('portail propriétaire : baux, paiements, documents', () => {
    for (const where of [
      buildOwnerLeasesSearch('100%'),
      buildOwnerPaymentsSearch('100%'),
      buildOwnerDocumentsSearch('100%')
    ]) {
      const values = containsValues(where);
      expect(values.length).toBeGreaterThan(0);
      expect(new Set(values)).toEqual(new Set([PCT100]));
    }
    expect(containsValues(buildOwnerDocumentsSearch('lot_7'))).toEqual([LOT7, LOT7]);
  });

  it('portail locataire : échéances et paiements', () => {
    expect(new Set(containsValues(buildTenantInstallmentsSearch('100%')))).toEqual(new Set([PCT100]));
    expect(new Set(containsValues(buildTenantPaymentsSearch('lot_7')))).toEqual(new Set([LOT7]));
  });
});
