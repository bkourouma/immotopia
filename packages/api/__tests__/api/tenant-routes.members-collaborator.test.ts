/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * M2 (contre-audit de la PR #205) : la gestion des membres et des invitations
 * (`/api/tenants/:tenantId/users/*`, `/invitations`) est réservée aux
 * collaborateurs. Un membre DÉSACTIVÉ resté client de l'agence passe
 * `requireTenantAccess` en simple client : il ne doit plus atteindre ces
 * routes, quelles que soient ses anciennes lignes user_roles.
 *
 * Pile réelle du routeur ; seuls la session, le calcul du contexte d'agence
 * (en-tête x-test-role), le RBAC (laissé passant pour isoler la garde de type
 * de compte) et les contrôleurs sont remplacés.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../../src/utils/database', () => ({ prisma: {} }));

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'u1', globalRole: 'USER' };
    next();
  }
}));

// requireTenantAccess pose le contexte selon l'en-tête ; requireTenantCollaborator reste le vrai.
jest.mock('../../src/middleware/tenant-middleware', () => ({
  ...jest.requireActual('../../src/middleware/tenant-middleware'),
  requireTenantAccess: (req: any, _res: any, next: any) => {
    const role = req.headers['x-test-role'];
    req.tenantContext = {
      tenantId: req.params.tenantId,
      role: null,
      isCollaborator: role === 'collab',
      isClient: role === 'client',
      isSuperAdmin: false
    };
    next();
  }
}));

// RBAC passant : seule la garde « collaborateur » est testée ici.
jest.mock('../../src/middleware/rbac-middleware', () => {
  const pass = () => (_req: any, _res: any, next: any) => next();
  return {
    requirePermission: pass,
    requireAnyPermission: pass,
    requireAllPermissions: pass,
    requireModule: pass,
    requireSubscriptionAccess: pass
  };
});

jest.mock('../../src/controllers/membership-controller', () => {
  const ok = (_req: any, res: any) => res.json({ success: true });
  return {
    listMembersHandler: ok,
    listAssignableMembersHandler: ok,
    getMemberHandler: ok,
    updateMemberHandler: ok,
    disableMemberHandler: ok,
    enableMemberHandler: ok,
    resetPasswordHandler: ok,
    revokeSessionsHandler: ok
  };
});

jest.mock('../../src/controllers/invitation-controller', () => {
  const ok = (_req: any, res: any) => res.json({ success: true });
  return {
    inviteCollaboratorHandler: ok,
    acceptInvitationHandler: ok,
    resendInvitationHandler: ok,
    revokeInvitationHandler: ok,
    listInvitationsHandler: ok
  };
});

import tenantRoutes from '../../src/routes/tenant-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

const app = express();
app.use(express.json());
app.use('/api/tenants', tenantRoutes);
app.use(errorHandler);

const ROUTES: Array<['get' | 'post' | 'patch' | 'delete', string]> = [
  ['get', '/api/tenants/ag1/invitations'],
  ['post', '/api/tenants/ag1/users/invite'],
  ['post', '/api/tenants/ag1/users/invitations/inv1/resend'],
  ['delete', '/api/tenants/ag1/users/invitations/inv1'],
  ['get', '/api/tenants/ag1/users'],
  ['get', '/api/tenants/ag1/users/u2'],
  ['patch', '/api/tenants/ag1/users/u2'],
  ['post', '/api/tenants/ag1/users/u2/disable'],
  ['post', '/api/tenants/ag1/users/u2/enable'],
  ['post', '/api/tenants/ag1/users/u2/reset-password'],
  ['post', '/api/tenants/ag1/users/u2/revoke-sessions']
];

describe('gestion des membres : réservée aux collaborateurs (M2)', () => {
  it.each(ROUTES)('%s %s : 403 pour un client (membre désactivé resté client)', async (method, url) => {
    const res = await request(app)[method](url).set('x-test-role', 'client').send({});
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it.each(ROUTES)('%s %s : 200 pour un collaborateur', async (method, url) => {
    const res = await request(app)[method](url).set('x-test-role', 'collab').send({});
    expect(res.status).toBe(200);
  });
});
