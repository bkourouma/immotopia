/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import request from 'supertest';

/**
 * Formulaires paramétrables : la référence de transaction du paiement déclaré (portail
 * copropriétaire) peut être obligatoire (défaut), facultative ou masquée. Fichier à part :
 * le limiteur de création du portail est le vrai et se partage par compte.
 */

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', globalRole: 'USER' };
    next();
  }
}));

const SCOPE = { tenantId: 'tenant-A', contactIds: ['c1'], lots: [], lotIds: [], syndicateIds: [] };
jest.mock('../../src/middleware/coowner-portal-access', () => ({
  requireCoOwnerPortalAccess: (req: any, _res: any, next: any) => {
    req.coOwnerPortal = { scope: SCOPE, tenantClientId: 'tc-1' };
    next();
  }
}));

const passthrough = () => new Proxy({}, { get: () => (_req: any, _res: any, next: any) => next() });
jest.mock('../../src/controllers/coowner-portal-controller', () => passthrough());
jest.mock('../../src/controllers/coowner-portal-finance-controller', () => passthrough());
jest.mock('../../src/controllers/coowner-charge-notice-controller', () => passthrough());
jest.mock('../../src/controllers/coowner-online-payment-controller', () => passthrough());

// Modes des champs : défauts du registre, sans base ; `mockModes` simule un réglage d'agence.
const mockModes: Record<string, Record<string, string>> = {};
jest.mock('../../src/lib/form-settings/service', () => ({
  getEffectiveFieldModes: async (_tenantId: string, formKey: string) => {
    const { FORM_REGISTRY } = jest.requireActual('../../src/lib/form-settings/registry');
    const fields: Record<string, string> = {};
    for (const field of FORM_REGISTRY[formKey].fields) fields[field.key] = field.defaultMode;
    return { formKey, fields: { ...fields, ...(mockModes[formKey] ?? {}) } };
  }
}));

const createDeclaration = jest.fn();
jest.mock('../../src/lib/syndics/declared-payment/portal', () => ({
  getCoOwnerDeclaredAvailability: jest.fn(),
  createCoOwnerDeclaration: (...a: any[]) => createDeclaration(...a),
  listCoOwnerDeclarations: jest.fn(),
  cancelCoOwnerDeclaration: jest.fn()
}));
jest.mock('../../src/lib/syndics/declared-payment/proof-read', () => ({ readPaymentProof: jest.fn() }));

import { errorHandler } from '../../src/middleware/error-middleware';
import router from '../../src/routes/coowner-portal-routes';

const app = express();
app.set('trust proxy', false);
app.use(express.json());
app.use('/api/portal/copropriete', router);
app.use(errorHandler);

const BASE = '/api/portal/copropriete/paiements-declares';
const FORM = 'syndic.paiement-declare-portail';
const payload = {
  syndicId: '11111111-1111-4111-8111-111111111111',
  receivingNumberId: '33333333-3333-4333-8333-333333333333',
  payerPhone: '0707070707',
  amount: 30000,
  paidAt: '2026-10-17T14:32:00+00:00',
  transactionReference: 'MP261017.1432.A12345',
  lines: [{ lotId: '44444444-4444-4444-8444-444444444444', amount: 30000, chargeCallIds: [] }]
};
const { transactionReference: _omitted, ...withoutReference } = payload;

beforeEach(() => {
  jest.clearAllMocks();
  delete mockModes[FORM];
  createDeclaration.mockResolvedValue({ id: 'decl-1', status: 'PENDING' });
});

describe('référence de transaction du paiement déclaré (portail)', () => {
  it('reste obligatoire sans réglage (400 FORM_FIELD_REQUIRED)', async () => {
    const res = await request(app).post(BASE).field('payload', JSON.stringify(withoutReference));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FORM_FIELD_REQUIRED');
    expect(createDeclaration).not.toHaveBeenCalled();
  });

  it('accepte une déclaration sans référence quand le champ est facultatif', async () => {
    mockModes[FORM] = { transactionReference: 'OPTIONAL' };
    const res = await request(app).post(BASE).field('payload', JSON.stringify(withoutReference));
    expect(res.status).toBe(201);
    expect(createDeclaration.mock.calls[0][1].transactionReference).toBeUndefined();
  });

  it('retire la référence envoyée quand le champ est masqué', async () => {
    mockModes[FORM] = { transactionReference: 'HIDDEN' };
    const res = await request(app).post(BASE).field('payload', JSON.stringify(payload));
    expect(res.status).toBe(201);
    expect(createDeclaration.mock.calls[0][1]).not.toHaveProperty('transactionReference');
  });
});
