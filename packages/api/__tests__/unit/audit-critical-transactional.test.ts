/**
 * Journal d'audit a deux niveaux, phase 3 : une action `critical` est tracee
 * DANS la transaction metier (`recordAuditEvent(tx, ...)`), jamais par la file
 * asynchrone (`logAuditEvent`).
 *
 * Trois familles se testent au comportement (faux Prisma) ; les trois autres
 * (suppression de bail, resiliation, revocation du portail copropriétaire)
 * dependent de chaines de services trop lourdes a simuler : on verifie dans le
 * source que l'evenement est ecrit par `recordAuditEvent` avec le client de la
 * transaction, et que la file asynchrone ne le porte plus.
 */
import * as fs from 'fs';
import * as path from 'path';

const mockTx: Record<string, any> = {
  crmContactTag: { deleteMany: jest.fn(async () => ({})) },
  crmContactTargetZone: { deleteMany: jest.fn(async () => ({})) },
  crmContactRole: { deleteMany: jest.fn(async () => ({})) },
  crmActivity: { deleteMany: jest.fn(async () => ({})) },
  crmDeal: { deleteMany: jest.fn(async () => ({})) },
  crmContact: { deleteMany: jest.fn(async () => ({})) },
  documentTemplate: { update: jest.fn(async () => ({ id: 'tpl-1', status: 'DELETED' })) },
  maintenanceVendor: { deleteMany: jest.fn(async () => ({})) },
  serviceProvider: { delete: jest.fn(async () => ({})) }
};

const mockPrisma: Record<string, any> = {
  crmContact: {
    findFirst: jest.fn(async () => ({ id: 'c1', email: 'a@b.c', firstName: 'A', lastName: 'B' }))
  },
  documentTemplate: {
    findFirst: jest.fn(async (args: any) =>
      args.where.id === 'tpl-1' ? { id: 'tpl-1', is_default: false, doc_type: 'LEASE' } : null
    )
  },
  serviceProvider: {
    findFirst: jest.fn(async () => ({ id: 'v1', name: 'Plomberie Koné' }))
  },
  maintenanceTicket: { count: jest.fn(async () => 0) },
  maintenanceContract: { count: jest.fn(async () => 0) },
  $transaction: jest.fn(async (arg: unknown) => {
    if (typeof arg !== 'function') throw new Error('forme tableau interdite pour une action critique');
    return (arg as (tx: unknown) => Promise<unknown>)(mockTx);
  })
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/services/whatsapp-group-automation-service', () => ({
  autoInviteContactToWhatsappGroup: jest.fn()
}));

import { deleteContact } from '../../src/services/crm-contact-service';
import { deleteTemplate } from '../../src/services/document-template-service';
import { deleteVendor } from '../../src/services/maintenance-vendor-service';
import { logAuditEvent, recordAuditEvent } from '../../src/services/audit-service';

beforeEach(() => {
  (recordAuditEvent as jest.Mock).mockClear();
  (logAuditEvent as jest.Mock).mockClear();
});

describe('actions critiques : audit dans la transaction metier', () => {
  it('CRM_CONTACT_DELETED : suppressions et trace dans la meme transaction, apres les suppressions', async () => {
    await deleteContact('t1', 'c1', 'u1');

    expect(mockTx.crmContact.deleteMany).toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({ actionKey: 'CRM_CONTACT_DELETED', entityId: 'c1', tenantId: 't1', actorUserId: 'u1' })
    );
    expect(mockTx.crmContact.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      (recordAuditEvent as jest.Mock).mock.invocationCallOrder[0]
    );
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('CRM_CONTACT_DELETED : sans acteur, aucun evenement (condition conservee)', async () => {
    await deleteContact('t1', 'c1');
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it('CRM_CONTACT_DELETED : si la trace echoue, la transaction echoue', async () => {
    (recordAuditEvent as jest.Mock).mockRejectedValueOnce(new Error('audit down'));
    await expect(deleteContact('t1', 'c1', 'u1')).rejects.toThrow('audit down');
  });

  it('DOCUMENT_TEMPLATE_DELETED : tracee avec le client de la transaction', async () => {
    await deleteTemplate('t1', 'tpl-1', 'u1');
    expect(recordAuditEvent).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({ actionKey: 'DOCUMENT_TEMPLATE_DELETED', entityId: 'tpl-1', actorUserId: 'u1' })
    );
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('MAINTENANCE_VENDOR_DELETED : tracee avec le client de la transaction', async () => {
    await deleteVendor('t1', 'v1', 'u1');
    expect(mockTx.serviceProvider.delete).toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        actionKey: 'MAINTENANCE_VENDOR_DELETED',
        entityId: 'v1',
        payload: { vendorName: 'Plomberie Koné' }
      })
    );
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});

describe('actions critiques : verification structurelle du source', () => {
  const src = (file: string) => fs.readFileSync(path.join(__dirname, '../../src', file), 'utf8');

  const CASES: Array<[string, string, string]> = [
    ['services/rental-lease-service.ts', 'RENTAL_LEASE_DELETED', 'recordAuditEvent(tx,'],
    ['lib/lease-lifecycle/service.ts', 'RENTAL_LEASE_TERMINATED', 'auditTx(tx,'],
    ['services/syndic-coowner-portal-service.ts', 'SYNDIC_COOWNER_PORTAL_REVOKED', 'recordAuditEvent(tx,']
  ];

  it.each(CASES)('%s : %s ecrit dans la transaction, jamais en file asynchrone', (file, actionKey, writer) => {
    const text = src(file);
    const at = text.indexOf(actionKey);
    expect(at).toBeGreaterThan(-1);
    // L'appel qui porte la cle est celui d'une ecriture transactionnelle...
    const before = text.slice(Math.max(0, at - 400), at + 50);
    expect(before.includes('recordAuditEvent(tx') || before.includes(writer)).toBe(true);
    // ... et aucun logAuditEvent (file) ne porte plus cette cle.
    expect(new RegExp(`logAuditEvent\\(\\{[^}]*${actionKey}`).test(text)).toBe(false);
    expect(new RegExp(`audit\\([^)]*'${actionKey}'`).test(text)).toBe(false);
  });
});
