/**
 * `getOrCreateTenantClientFromContact` : le nom d'un contact CRM ne s'écrit
 * sur un compte existant (global) sans nom que s'il est déjà client de CETTE
 * agence ; le lien de réinitialisation vient de `config/env`.
 */
import fs from 'fs';
import path from 'path';

jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), AuditActionKey: {} }));
jest.mock('../../src/middleware/session-invalidation', () => ({ revokeTenantSessions: jest.fn() }));

import { getOrCreateTenantClientFromContact } from '../../src/services/tenant-service';

const contact = {
  id: 'c1',
  tenantId: 'tenant-A',
  email: 'x@example.test',
  firstName: 'Awa',
  lastName: 'Kone',
  contactType: 'PERSON'
};

function makeDb(dejaClient: boolean) {
  const userUpdate = jest.fn().mockResolvedValue({ id: 'u1', email: contact.email, fullName: 'Awa Kone' });
  const db: any = {
    crmContact: { findFirst: jest.fn().mockResolvedValue(contact) },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: contact.email, fullName: null }),
      update: userUpdate
    },
    tenantClient: {
      findFirst: jest.fn().mockResolvedValue(dejaClient ? { id: 'tc1' } : null),
      findUnique: jest.fn().mockResolvedValue({ id: 'tc1', details: { crmContactId: 'c1' }, user: { id: 'u1' } }),
      update: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'tc1', details: {}, user: { id: 'u1' } })
    }
  };
  return { db, userUpdate };
}

describe('nom du contact CRM sur un compte existant', () => {
  it('compte sans lien avec l’agence : jamais renommé', async () => {
    const { db, userUpdate } = makeDb(false);
    await getOrCreateTenantClientFromContact('tenant-A', 'c1', 'RENTER' as any, { db });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('compte déjà client de l’agence : reprend le nom du contact', async () => {
    const { db, userUpdate } = makeDb(true);
    await getOrCreateTenantClientFromContact('tenant-A', 'c1', 'RENTER' as any, { db });
    expect(db.tenantClient.findFirst.mock.calls[0][0].where).toEqual({ tenantId: 'tenant-A', userId: 'u1' });
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { fullName: 'Awa Kone' } });
  });
});

describe('configuration', () => {
  it('l’URL du frontend vient de config/env, pas de process.env', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../src/services/tenant-service.ts'), 'utf8');
    expect(source).not.toMatch(/process\.env\.(FRONTEND_URL|CLIENT_URL)/);
    expect(source).toMatch(/import \{[^}]*frontendUrl[^}]*\} from '\.\.\/config\/env'/);
  });
});
