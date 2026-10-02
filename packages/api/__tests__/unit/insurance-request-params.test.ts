/**
 * `lib/patrimoine/insurance/request-params.ts` et contrôleur du carnet
 * d'entretien : un paramètre d'URL non UUID donne la même 404 qu'un objet
 * inexistant (lot B1, spec 032).
 */

jest.mock('../../src/lib/patrimoine/insurance/maintenance-log-service', () => ({
  createMaintenanceLogEntry: jest.fn(),
  deleteMaintenanceLogEntry: jest.fn(async () => undefined),
  exportMaintenanceLogCsv: jest.fn(),
  listMaintenanceLog: jest.fn(),
  updateMaintenanceLogEntry: jest.fn(async () => ({}))
}));

import { NotFoundError, BadRequestError } from '../../src/middleware/error-middleware';
import { requireTenantId, uuidParam } from '../../src/lib/patrimoine/insurance/request-params';
import {
  deleteMaintenanceLogHandler,
  updateMaintenanceLogHandler
} from '../../src/controllers/patrimoine-maintenance-log-controller';
import * as logService from '../../src/lib/patrimoine/insurance/maintenance-log-service';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const fakeReq = (params: Record<string, string>, body: unknown = {}): any => ({
  params,
  body,
  query: {},
  tenantContext: { tenantId: 'tenant-a' }
});
const fakeRes = (): any => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.send = jest.fn(() => res);
  return res;
};

describe('uuidParam / requireTenantId', () => {
  it('accepte un UUID, refuse le reste par NotFoundError', () => {
    expect(uuidParam(fakeReq({ id: UUID }), 'id', 'x')).toBe(UUID);
    for (const bad of ['abc', '', '1234', `${UUID}x`, "'; DROP TABLE"]) {
      expect(() => uuidParam(fakeReq({ id: bad }), 'id', 'Introuvable.')).toThrow(NotFoundError);
    }
    expect(() => uuidParam(fakeReq({}), 'id', 'Introuvable.')).toThrow(NotFoundError);
  });

  it('requireTenantId : contexte agence, sinon 400', () => {
    expect(requireTenantId(fakeReq({}))).toBe('tenant-a');
    expect(() => requireTenantId({ params: {} } as any)).toThrow(BadRequestError);
  });
});

describe('contrôleur du carnet d’entretien', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['PATCH', updateMaintenanceLogHandler],
    ['DELETE', deleteMaintenanceLogHandler]
  ])('%s avec entryId non UUID -> 404, service jamais appelé', async (_label, handler) => {
    const next = jest.fn();
    await (handler as any)(fakeReq({ entryId: 'pas-un-uuid' }), fakeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    expect(logService.updateMaintenanceLogEntry).not.toHaveBeenCalled();
    expect(logService.deleteMaintenanceLogEntry).not.toHaveBeenCalled();
  });

  it('DELETE avec UUID : appelle le service avec l’agence', async () => {
    const res = fakeRes();
    await (deleteMaintenanceLogHandler as any)(fakeReq({ entryId: UUID }), res, jest.fn());
    expect(logService.deleteMaintenanceLogEntry).toHaveBeenCalledWith('tenant-a', UUID);
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
