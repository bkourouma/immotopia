/**
 * Newsletter et configuration WhatsApp : gardes RBAC de communication et
 * limiteur de /test-send (par utilisateur ET par agence).
 */
import express, { Express, NextFunction, Request, Response } from 'express';
import request from 'supertest';

const hasAnyPermission = jest.fn();
jest.mock('../../src/services/permission-service', () => ({
  hasAnyPermission: (...a: unknown[]) => hasAnyPermission(...a),
  hasPermission: jest.fn(),
  invalidateAllUserPermissionCache: jest.fn()
}));
jest.mock('../../src/services/signup-guard-service', () => ({ assertSignupAllowed: jest.fn() }));

function build(): Express {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { requireCommunicationByMethod } = require('../../src/middleware/communication-rbac-middleware');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { whatsappTestSendRateLimiter } = require('../../src/middleware/rate-limit-middleware');
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { userId: req.header('x-user') ?? 'u1' };
    (req as any).tenantContext = {
      tenantId: req.header('x-tenant') ?? 't1',
      isSuperAdmin: req.header('x-super') === '1'
    };
    next();
  });
  app.use(requireCommunicationByMethod);
  const ok = (_req: Request, res: Response) => res.status(200).json({ ok: true });
  app.get('/lists', ok);
  app.post('/lists', ok);
  app.delete('/subscribers/1', ok);
  app.get('/whatsapp', ok);
  app.patch('/whatsapp/key', ok);
  app.post('/test-send', ...whatsappTestSendRateLimiter, ok);
  return app;
}

beforeEach(() => {
  jest.resetModules();
  hasAnyPermission.mockReset();
});

describe('garde de communication', () => {
  it('sans permission : 403 en lecture comme en écriture, y compris /test-send', async () => {
    hasAnyPermission.mockResolvedValue(false);
    const app = build();
    expect((await request(app).get('/lists')).status).toBe(403);
    expect((await request(app).post('/lists')).status).toBe(403);
    expect((await request(app).delete('/subscribers/1')).status).toBe(403);
    expect((await request(app).get('/whatsapp')).status).toBe(403);
    expect((await request(app).patch('/whatsapp/key')).status).toBe(403);
    expect((await request(app).post('/test-send')).status).toBe(403);
  });

  it('avec la permission : passe, clés existantes, contexte agence', async () => {
    hasAnyPermission.mockResolvedValue(true);
    const app = build();
    expect((await request(app).get('/lists')).status).toBe(200);
    expect((await request(app).post('/lists')).status).toBe(200);
    expect((await request(app).post('/test-send')).status).toBe(200);
    expect(hasAnyPermission).toHaveBeenCalledWith('u1', ['TENANT_ADMIN', 'COMMUNICATION_VIEW'], 't1');
  });

  it('super-admin : passe sans consulter les permissions', async () => {
    hasAnyPermission.mockResolvedValue(false);
    const app = build();
    expect((await request(app).get('/lists').set('x-super', '1')).status).toBe(200);
    expect((await request(app).post('/lists').set('x-super', '1')).status).toBe(200);
    expect(hasAnyPermission).not.toHaveBeenCalled();
  });
});

describe('limiteur /test-send', () => {
  it('429 au-delà de 5 par minute pour un même utilisateur, sans bloquer un autre', async () => {
    hasAnyPermission.mockResolvedValue(true);
    const app = build();
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      expect((await request(app).post('/test-send').set('x-user', 'a')).status).toBe(200);
    }
    const blocked = await request(app).post('/test-send').set('x-user', 'a');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ success: false });
    expect(typeof blocked.body.message).toBe('string');
    expect((await request(app).post('/test-send').set('x-user', 'b')).status).toBe(200);
  });

  it('429 au-delà de 20 par heure pour une même agence, tous utilisateurs confondus', async () => {
    hasAnyPermission.mockResolvedValue(true);
    const app = build();
    for (let i = 0; i < 20; i += 1) {
      // un utilisateur différent à chaque appel : seul le plafond d'agence peut jouer
      // eslint-disable-next-line no-await-in-loop
      expect((await request(app).post('/test-send').set('x-user', `u${i}`)).status).toBe(200);
    }
    expect((await request(app).post('/test-send').set('x-user', 'nouveau')).status).toBe(429);
    expect((await request(app).post('/test-send').set('x-user', 'nouveau').set('x-tenant', 't2')).status).toBe(200);
  });
});
