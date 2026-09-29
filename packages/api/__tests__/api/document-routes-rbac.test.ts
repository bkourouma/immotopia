import express from 'express';
import request from 'supertest';

/**
 * RBAC des routes de documents (`routes/document-routes.ts`) : chaque route
 * répond 403 sans la permission attendue et atteint le contrôleur avec elle.
 * Auth, tenant et isolation sont des passe-plats ; le service de permissions
 * est simulé pour vérifier la clé réellement demandée.
 */

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', email: 'u@example.com', globalRole: 'USER' };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = { tenantId: req.path.split('/')[1], isCollaborator: true, isClient: false };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({
  enforceTenantIsolation: (_req: any, _res: any, next: any) => next()
}));

jest.mock('../../src/services/permission-service', () => ({
  hasPermission: jest.fn(),
  hasAnyPermission: jest.fn(),
  hasAllPermissions: jest.fn()
}));

jest.mock('../../src/services/subscription-service', () => ({
  checkSubscriptionAccess: jest.fn()
}));

jest.mock('../../src/controllers/document-template-controller', () => ({
  uploadTemplateHandler: (_req: any, res: any) => res.status(200).json({ reached: true }),
  listTemplatesHandler: (_req: any, res: any) => res.status(200).json({ reached: true }),
  updateTemplateHandler: (_req: any, res: any) => res.status(200).json({ reached: true }),
  setDefaultTemplateHandler: (_req: any, res: any) => res.status(200).json({ reached: true }),
  deleteTemplateHandler: (_req: any, res: any) => res.status(200).json({ reached: true })
}));
jest.mock('../../src/controllers/document-generation-controller', () => ({
  generateDocumentHandler: (_req: any, res: any) => res.status(200).json({ reached: true }),
  regenerateDocumentHandler: (_req: any, res: any) => res.status(200).json({ reached: true }),
  downloadDocumentHandler: (_req: any, res: any) => res.status(200).json({ reached: true })
}));

import { hasPermission, hasAnyPermission } from '../../src/services/permission-service';
import documentRoutes from '../../src/routes/document-routes';

const mockHas = hasPermission as jest.Mock;
const mockHasAny = hasAnyPermission as jest.Mock;

const app = express();
app.use(express.json());
app.use('/api', documentRoutes);

const T = 'tenant-A';
const ANY_KEYS = ['RENTAL_DOCUMENTS_VIEW', 'RENTAL_DOCUMENTS_GENERATE'];

type Case = { name: string; method: 'get' | 'post' | 'patch' | 'delete'; path: string; key?: string; anyOf?: string[] };

const cases: Case[] = [
  { name: 'GET modèles', method: 'get', path: `/api/${T}/documents/templates`, anyOf: ANY_KEYS },
  {
    name: 'POST upload modèle',
    method: 'post',
    path: `/api/${T}/documents/templates/upload`,
    key: 'RENTAL_DOCUMENTS_EDIT'
  },
  { name: 'PATCH modèle', method: 'patch', path: `/api/${T}/documents/templates/t1`, key: 'RENTAL_DOCUMENTS_EDIT' },
  {
    name: 'POST set-default',
    method: 'post',
    path: `/api/${T}/documents/templates/t1/set-default`,
    key: 'RENTAL_DOCUMENTS_EDIT'
  },
  { name: 'DELETE modèle', method: 'delete', path: `/api/${T}/documents/templates/t1`, key: 'RENTAL_DOCUMENTS_EDIT' },
  { name: 'POST generate', method: 'post', path: `/api/${T}/documents/generate`, key: 'RENTAL_DOCUMENTS_GENERATE' },
  {
    name: 'POST regenerate',
    method: 'post',
    path: `/api/${T}/documents/d1/regenerate`,
    key: 'RENTAL_DOCUMENTS_GENERATE'
  },
  { name: 'GET download', method: 'get', path: `/api/${T}/documents/d1/download`, key: 'RENTAL_DOCUMENTS_VIEW' }
];

describe('RBAC des routes de documents', () => {
  beforeEach(() => {
    mockHas.mockReset();
    mockHasAny.mockReset();
  });

  it.each(cases)('$name : 403 sans la permission', async c => {
    mockHas.mockResolvedValue(false);
    mockHasAny.mockResolvedValue(false);
    const res = await request(app)[c.method](c.path);
    expect(res.status).toBe(403);
    expect(res.body.reached).toBeUndefined();
  });

  it.each(cases)('$name : atteint le contrôleur avec la permission et vérifie la clé', async c => {
    mockHas.mockResolvedValue(true);
    mockHasAny.mockResolvedValue(true);
    const res = await request(app)[c.method](c.path);
    expect(res.status).toBe(200);
    expect(res.body.reached).toBe(true);
    if (c.anyOf) {
      expect(mockHasAny).toHaveBeenCalledWith('user-1', c.anyOf, T);
    } else {
      expect(mockHas).toHaveBeenCalledWith('user-1', c.key, T);
    }
  });
});
