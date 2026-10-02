/**
 * L'avant/après (`changes`) part bien avec l'événement d'audit d'une mise à
 * jour (ADR-006, phase 3) : affaire CRM, loyer d'un bail, pénalité.
 */
const logAuditEvent = jest.fn();
const dealFindFirst = jest.fn();
const dealUpdate = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    crmDeal: {
      findFirst: (...a: unknown[]) => dealFindFirst(...a),
      update: (...a: unknown[]) => dealUpdate(...a)
    }
  }
}));
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...a: unknown[]) => logAuditEvent(...a),
  recordAuditEvent: jest.fn()
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/crm-contact-service', () => ({ assertActiveMember: jest.fn() }));

import { Prisma } from '@prisma/client';
import { updateDeal } from '../../src/services/crm-deal-service';

const existing = {
  id: 'deal-1',
  tenantId: 'tenant-A',
  version: 3,
  type: 'LOCATION',
  stage: 'LEAD',
  probability: 20,
  expectedValue: new Prisma.Decimal('1000'),
  locationZone: 'Cocody'
};

beforeEach(() => {
  logAuditEvent.mockReset();
  dealFindFirst.mockResolvedValue(existing);
  dealUpdate.mockResolvedValue({ ...existing, version: 4 });
});

describe('affaire CRM : avant/après', () => {
  it('envoie les champs réellement modifiés, sans le compteur de version', async () => {
    await updateDeal(
      'tenant-A',
      'deal-1',
      { version: 3, probability: 60, locationZone: 'Cocody', expectedValue: 1000 } as any,
      'user-1'
    );

    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    const entry = logAuditEvent.mock.calls[0][0];
    expect(entry.actionKey).toBe('CRM_DEAL_UPDATED');
    expect(entry.changes).toEqual({ probability: { before: 20, after: 60 } });
    expect(entry.changes).not.toHaveProperty('version');
  });

  it('un changement d’étape est une action distincte, avec son avant/après', async () => {
    await updateDeal('tenant-A', 'deal-1', { version: 3, stage: 'NEGOTIATION' } as any, 'user-1');
    const entry = logAuditEvent.mock.calls[0][0];
    expect(entry.actionKey).toBe('CRM_DEAL_STAGE_CHANGED');
    expect(entry.changes).toEqual({ stage: { before: 'LEAD', after: 'NEGOTIATION' } });
  });

  it('une mise à jour sans effet n’écrit aucun avant/après', async () => {
    await updateDeal('tenant-A', 'deal-1', { version: 3, locationZone: 'Cocody' } as any, 'user-1');
    expect(logAuditEvent.mock.calls[0][0].changes).toBeUndefined();
  });
});
