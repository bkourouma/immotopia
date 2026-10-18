import { getPortalAccountEmailNotice, type PortalNoticeDb } from '../../src/lib/crm/portal-email-notice';

type Client = { id: string; tenantId: string; crmContactId?: string; userEmail: string | null };

function makeDb(clients: Client[]): PortalNoticeDb & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    tenantClient: {
      findMany: jest.fn(async (args: any) => {
        calls.push(args);
        return clients
          .filter(c => c.tenantId === args.where.tenantId && c.crmContactId === args.where.details.equals)
          .map(c => ({ id: c.id, user: c.userEmail === null ? null : { email: c.userEmail } }));
      })
    } as never
  };
}

describe('getPortalAccountEmailNotice', () => {
  it('aucun client lié -> null', async () => {
    const db = makeDb([]);
    expect(await getPortalAccountEmailNotice(db, 'ta', 'c1', 'a@x.ci')).toBeNull();
  });

  it('client lié sans compte (adresse vide) -> null', async () => {
    const db = makeDb([{ id: 'k', tenantId: 'ta', crmContactId: 'c1', userEmail: null }]);
    expect(await getPortalAccountEmailNotice(db, 'ta', 'c1', 'a@x.ci')).toBeNull();
  });

  it('même adresse, casse et espaces différents -> null', async () => {
    const db = makeDb([{ id: 'k', tenantId: 'ta', crmContactId: 'c1', userEmail: '  Awa@Example.CI ' }]);
    expect(await getPortalAccountEmailNotice(db, 'ta', 'c1', 'awa@example.ci')).toBeNull();
  });

  it('adresse différente -> adresse masquée, jamais complète', async () => {
    const db = makeDb([{ id: 'k', tenantId: 'ta', crmContactId: 'c1', userEmail: 'ancienne@example.ci' }]);
    const notice = await getPortalAccountEmailNotice(db, 'ta', 'c1', 'nouvelle@example.ci');
    expect(notice).toEqual({ maskedEmail: 'a•••@ex•••.ci' });
    expect(JSON.stringify(notice)).not.toContain('ancienne');
  });

  it('fiche sans e-mail et compte avec adresse -> avertit', async () => {
    const db = makeDb([{ id: 'k', tenantId: 'ta', crmContactId: 'c1', userEmail: 'ancienne@example.ci' }]);
    expect(await getPortalAccountEmailNotice(db, 'ta', 'c1', null)).not.toBeNull();
  });

  it("client d'une autre agence ignoré, requête filtrée par tenantId", async () => {
    const db = makeDb([{ id: 'k', tenantId: 'tb', crmContactId: 'c1', userEmail: 'autre@example.ci' }]);
    expect(await getPortalAccountEmailNotice(db, 'ta', 'c1', 'a@x.ci')).toBeNull();
    expect((db.calls[0] as any).where.tenantId).toBe('ta');
    expect((db.calls[0] as any).select.user).toEqual({ select: { email: true } });
  });
});

describe('listes des contacts', () => {
  it("listContacts n'ajoute pas le champ (détail seulement)", () => {
    // Le calcul n'est branché que dans getContactById.
    const fs = require('fs') as typeof import('fs');
    const src = fs.readFileSync(require.resolve('../../src/services/crm-contact-service.ts'), 'utf8');
    const occurrences = src.match(/getPortalAccountEmailNotice\(/g) ?? [];
    expect(occurrences).toHaveLength(1);
    const listBlock = src.slice(
      src.indexOf('export async function listContacts'),
      src.indexOf('export async function updateContact')
    );
    expect(listBlock.length).toBeGreaterThan(100);
    expect(listBlock).not.toContain('portalAccountEmailNotice');
  });
});
