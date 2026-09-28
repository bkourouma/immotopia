/**
 * Correctif securite (invitations), volet controleur :
 *
 * - `resendInvitationHandler`/`revokeInvitationHandler` doivent passer
 *   `req.params.tenantId` (pose par `requireTenantAccess`, verifie cote
 *   routeur) au service — jamais un identifiant du corps de la requete.
 *   Un regression-guard ici empeche qu'un futur changement rouvre l'IDOR
 *   sans que ce test le voie.
 * - `acceptUrl` (le jeton en clair) ne sort dans la reponse de
 *   `resendInvitationHandler` que pour un super-admin plateforme.
 * - `acceptInvitationHandler` transmet `req.user?.userId` (pose par
 *   `optionalAuthenticate` sur la route) au service, sous
 *   `requestingUserId`.
 *
 * Modele de mock : le SERVICE est simule (voir `testing.md`), pas Prisma —
 * ce fichier verifie le cablage du controleur, pas la logique metier
 * (couverte par `invitation-service.test.ts`).
 */

import express from 'express';
import request from 'supertest';

const inviteCollaborator = jest.fn();
const acceptInvitation = jest.fn();
const resendInvitation = jest.fn();
const revokeInvitation = jest.fn();
const listInvitations = jest.fn();

jest.mock('../../src/services/invitation-service', () => ({
  inviteCollaborator: (...args: any[]) => inviteCollaborator(...args),
  acceptInvitation: (...args: any[]) => acceptInvitation(...args),
  resendInvitation: (...args: any[]) => resendInvitation(...args),
  revokeInvitation: (...args: any[]) => revokeInvitation(...args),
  listInvitations: (...args: any[]) => listInvitations(...args)
}));

import {
  acceptInvitationHandler,
  resendInvitationHandler,
  revokeInvitationHandler
} from '../../src/controllers/invitation-controller';
import { errorHandler } from '../../src/middleware/error-middleware';

function buildApp(user: { userId: string; globalRole?: string } | null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (user) req.user = user;
    next();
  });
  app.post('/tenants/:tenantId/users/invitations/:invitationId/resend', resendInvitationHandler);
  app.delete('/tenants/:tenantId/users/invitations/:invitationId', revokeInvitationHandler);
  app.post('/auth/invitations/accept', acceptInvitationHandler);
  app.use(errorHandler);
  return app;
}

const TENANT_A = 'a0000000-0000-0000-0000-00000000000a';
const TENANT_B = 'b0000000-0000-0000-0000-00000000000b';
const INVITATION_ID = 'inv-1';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resendInvitationHandler', () => {
  it('passe req.params.tenantId au service, jamais un identifiant du corps (regression IDOR)', async () => {
    resendInvitation.mockResolvedValue({
      expiresAt: new Date('2026-01-01'),
      acceptUrl: 'https://exemple.test/auth/accept-invite?token=secret',
      emailSent: true
    });

    await request(buildApp({ userId: 'admin-1', globalRole: 'USER' }))
      .post(`/tenants/${TENANT_A}/users/invitations/${INVITATION_ID}/resend`)
      // Une agence B glissee dans le corps ne doit JAMAIS etre lue.
      .send({ tenantId: TENANT_B })
      .expect(200);

    expect(resendInvitation).toHaveBeenCalledWith(INVITATION_ID, TENANT_A, 'admin-1');
  });

  it("n'inclut PAS acceptUrl dans la reponse pour un administrateur d'agence", async () => {
    resendInvitation.mockResolvedValue({
      expiresAt: new Date('2026-01-01'),
      acceptUrl: 'https://exemple.test/auth/accept-invite?token=secret',
      emailSent: true
    });

    const res = await request(buildApp({ userId: 'admin-1', globalRole: 'USER' }))
      .post(`/tenants/${TENANT_A}/users/invitations/${INVITATION_ID}/resend`)
      .send({})
      .expect(200);

    expect(res.body.data.acceptUrl).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  it('inclut acceptUrl dans la reponse pour un super-admin plateforme', async () => {
    resendInvitation.mockResolvedValue({
      expiresAt: new Date('2026-01-01'),
      acceptUrl: 'https://exemple.test/auth/accept-invite?token=secret',
      emailSent: true
    });

    const res = await request(buildApp({ userId: 'super-1', globalRole: 'SUPER_ADMIN' }))
      .post(`/tenants/${TENANT_A}/users/invitations/${INVITATION_ID}/resend`)
      .send({})
      .expect(200);

    expect(res.body.data.acceptUrl).toBe('https://exemple.test/auth/accept-invite?token=secret');
  });

  it('refuse sans authentification (401)', async () => {
    await request(buildApp(null))
      .post(`/tenants/${TENANT_A}/users/invitations/${INVITATION_ID}/resend`)
      .send({})
      .expect(401);
    expect(resendInvitation).not.toHaveBeenCalled();
  });
});

describe('revokeInvitationHandler', () => {
  it('passe req.params.tenantId au service, jamais un identifiant du corps (regression IDOR)', async () => {
    revokeInvitation.mockResolvedValue(undefined);

    await request(buildApp({ userId: 'admin-1', globalRole: 'USER' }))
      .delete(`/tenants/${TENANT_A}/users/invitations/${INVITATION_ID}`)
      .send({ tenantId: TENANT_B })
      .expect(200);

    expect(revokeInvitation).toHaveBeenCalledWith(INVITATION_ID, TENANT_A, 'admin-1');
  });
});

describe('acceptInvitationHandler', () => {
  it('transmet req.user?.userId comme requestingUserId quand une session existe', async () => {
    acceptInvitation.mockResolvedValue({
      membership: { id: 'm-1' },
      user: { id: 'existing-1', email: 'e@example.com', fullName: 'E' }
    });

    await request(buildApp({ userId: 'existing-1' }))
      .post('/auth/invitations/accept')
      .send({ token: '11111111-1111-1111-1111-111111111111' })
      .expect(200);

    expect(acceptInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        token: '11111111-1111-1111-1111-111111111111',
        requestingUserId: 'existing-1'
      })
    );
  });

  it('ne transmet pas de requestingUserId sans session (nouveau compte)', async () => {
    acceptInvitation.mockResolvedValue({
      membership: { id: 'm-1' },
      user: { id: 'new-1', email: 'e@example.com', fullName: 'E' }
    });

    await request(buildApp(null))
      .post('/auth/invitations/accept')
      .send({ token: '11111111-1111-1111-1111-111111111111', password: 'MotDePasseValide#1' })
      .expect(200);

    expect(acceptInvitation).toHaveBeenCalledWith(expect.objectContaining({ requestingUserId: undefined }));
  });

  it('renvoie le code INVITATION_REQUIRES_LOGIN tel que leve par le service', async () => {
    const { InvitationRequiresLoginError } = jest.requireActual('../../src/middleware/error-middleware');
    acceptInvitation.mockRejectedValue(new InvitationRequiresLoginError());

    const res = await request(buildApp(null))
      .post('/auth/invitations/accept')
      .send({ token: '11111111-1111-1111-1111-111111111111' })
      .expect(403);

    expect(res.body.code).toBe('INVITATION_REQUIRES_LOGIN');
  });
});
