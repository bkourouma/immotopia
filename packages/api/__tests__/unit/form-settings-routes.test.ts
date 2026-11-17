/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Routes de réglage des formulaires paramétrables (contrat §5) : contrôleurs
 * avec Prisma, registre, service et audit simulés.
 */

const prismaMock: any = {
  tenantFormFieldSetting: { findMany: jest.fn(), deleteMany: jest.fn(), upsert: jest.fn() },
  tenantFormFieldUnlock: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn()
  },
  tenant: { findUnique: jest.fn() },
  user: { findMany: jest.fn() },
  $transaction: jest.fn(async (fn: any) => fn(prismaMock))
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));

const recordAuditEvent = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  recordAuditEvent: (...a: any[]) => recordAuditEvent(...a),
  logAuditEvent: jest.fn()
}));

const invalidateFieldModes = jest.fn();
const getEffectiveFieldModes = jest.fn();
jest.mock('../../src/lib/form-settings/service', () => ({
  invalidateFieldModes: (...a: any[]) => invalidateFieldModes(...a),
  getEffectiveFieldModes: (...a: any[]) => getEffectiveFieldModes(...a)
}));

jest.mock('../../src/lib/form-settings/registry', () => ({
  FORM_REGISTRY: {
    'syndic.test-manager': {
      formKey: 'syndic.test-manager',
      module: 'syndic',
      label: 'Formulaire de test',
      audience: 'agency',
      fields: [
        {
          key: 'open',
          label: 'Champ ouvert',
          fieldClass: 'OPEN',
          defaultMode: 'REQUIRED',
          allowedModes: ['REQUIRED', 'OPTIONAL'],
          consequence: 'Rien'
        },
        {
          key: 'gated',
          label: 'Champ verrouillé',
          fieldClass: 'GATED',
          defaultMode: 'REQUIRED',
          allowedModes: ['REQUIRED', 'OPTIONAL', 'HIDDEN'],
          consequence: 'Tout'
        }
      ]
    },
    'syndic.test-portal': {
      formKey: 'syndic.test-portal',
      module: 'syndic',
      label: 'Portail de test',
      audience: 'coowner-portal',
      fields: []
    }
  }
}));

import {
  getCoOwnerPortalFormModesHandler,
  getFormModesHandler,
  getFormSettingsHandler,
  updateFormSettingsHandler
} from '../../src/controllers/form-settings-controller';
import { listFormUnlocksHandler, setFormUnlockHandler } from '../../src/controllers/admin-form-unlocks-controller';

function run(handler: any, req: any): Promise<{ status: number; body: any; error?: any }> {
  return new Promise(resolve => {
    const res: any = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: any) {
        resolve({ status: this.statusCode, body });
        return this;
      }
    };
    handler(
      { params: {}, body: {}, user: { userId: 'u1' }, tenantContext: { tenantId: 't1' }, ...req },
      res,
      (error: any) =>
        resolve({ status: error?.name === 'ZodError' ? 400 : (error?.statusCode ?? 500), body: undefined, error })
    );
  });
}

const FORM = 'syndic.test-manager';

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.tenantFormFieldSetting.findMany.mockResolvedValue([]);
  prismaMock.tenantFormFieldUnlock.findMany.mockResolvedValue([]);
  prismaMock.tenantFormFieldUnlock.findFirst.mockResolvedValue(null);
  prismaMock.tenant.findUnique.mockResolvedValue({ id: 't1' });
  prismaMock.user.findMany.mockResolvedValue([]);
});

describe('GET settings/forms', () => {
  it('renvoie le registre avec mode effectif, mode stocké et déverrouillage, filtré par agence', async () => {
    prismaMock.tenantFormFieldSetting.findMany.mockResolvedValue([
      { formKey: FORM, fieldKey: 'open', mode: 'OPTIONAL' },
      { formKey: FORM, fieldKey: 'gated', mode: 'HIDDEN' }
    ]);
    const { status, body } = await run(getFormSettingsHandler, {});
    expect(status).toBe(200);
    const fields = body.data.forms.find((f: any) => f.formKey === FORM).fields;
    expect(fields[0]).toMatchObject({ key: 'open', mode: 'OPTIONAL', storedMode: 'OPTIONAL', unlocked: true });
    // GATED non déverrouillé : le réglage stocké est inerte.
    expect(fields[1]).toMatchObject({ key: 'gated', mode: 'REQUIRED', storedMode: 'HIDDEN', unlocked: false });
    expect(prismaMock.tenantFormFieldSetting.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1' });
  });
});

describe('PUT settings/forms/:formKey', () => {
  const put = (fields: any, formKey = FORM) =>
    run(updateFormSettingsHandler, { params: { formKey }, body: { fields } });

  it('enregistre un champ OPEN, audite avant/après et invalide le cache', async () => {
    const { status, body } = await put({ open: 'OPTIONAL' });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(prismaMock.tenantFormFieldSetting.upsert).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        tenantId: 't1',
        actionKey: 'TENANT_FORM_FIELD_SETTINGS_UPDATED',
        changes: { open: { before: null, after: 'OPTIONAL' } }
      })
    );
    expect(invalidateFieldModes).toHaveBeenCalledWith('t1', FORM);
  });

  it('null supprime la ligne', async () => {
    prismaMock.tenantFormFieldSetting.findMany.mockResolvedValue([
      { fieldKey: 'open', mode: 'OPTIONAL', formKey: FORM }
    ]);
    const { status } = await put({ open: null });
    expect(status).toBe(200);
    expect(prismaMock.tenantFormFieldSetting.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', formKey: FORM, fieldKey: 'open' }
    });
  });

  it('400 pour une clé inconnue, un mode non permis ou un corps non strict', async () => {
    expect((await put({ inconnu: 'OPTIONAL' })).status).toBe(400);
    expect((await put({ open: 'HIDDEN' })).status).toBe(400);
    expect(
      (await run(updateFormSettingsHandler, { params: { formKey: FORM }, body: { fields: {}, extra: 1 } })).status
    ).toBe(400);
    expect((await put({ open: 'N_IMPORTE' })).status).toBe(400);
    expect(prismaMock.tenantFormFieldSetting.upsert).not.toHaveBeenCalled();
  });

  it('403 FORM_FIELD_LOCKED pour un champ GATED non déverrouillé, sans aucune écriture', async () => {
    const { status, error } = await put({ open: 'OPTIONAL', gated: 'OPTIONAL' });
    expect(status).toBe(403);
    expect(error.code).toBe('FORM_FIELD_LOCKED');
    expect(prismaMock.tenantFormFieldSetting.upsert).not.toHaveBeenCalled();
  });

  it('accepte un champ GATED déverrouillé', async () => {
    prismaMock.tenantFormFieldUnlock.findMany.mockResolvedValue([{ formKey: FORM, fieldKey: 'gated' }]);
    expect((await put({ gated: 'HIDDEN' })).status).toBe(200);
  });

  it('404 pour un formulaire inconnu', async () => {
    expect((await put({ open: 'OPTIONAL' }, 'nope')).status).toBe(404);
    expect((await put({ open: 'OPTIONAL' }, 'constructor')).status).toBe(404);
  });
});

describe('lecture des modes', () => {
  it('agence : renvoie les modes effectifs de son agence', async () => {
    getEffectiveFieldModes.mockResolvedValue({ formKey: FORM, fields: { open: 'REQUIRED' } });
    const { status, body } = await run(getFormModesHandler, { params: { formKey: FORM } });
    expect(status).toBe(200);
    expect(body.data).toEqual({ formKey: FORM, fields: { open: 'REQUIRED' } });
    expect(getEffectiveFieldModes).toHaveBeenCalledWith('t1', FORM);
  });

  it('portail : agence issue de la garde, formulaire coowner-portal seulement, sinon 404', async () => {
    getEffectiveFieldModes.mockResolvedValue({ formKey: 'syndic.test-portal', fields: {} });
    const coOwnerPortal = { scope: { tenantId: 't9' } };
    const ok = await run(getCoOwnerPortalFormModesHandler, {
      params: { formKey: 'syndic.test-portal' },
      coOwnerPortal
    });
    expect(ok.status).toBe(200);
    expect(getEffectiveFieldModes).toHaveBeenCalledWith('t9', 'syndic.test-portal');
    expect((await run(getCoOwnerPortalFormModesHandler, { params: { formKey: FORM }, coOwnerPortal })).status).toBe(
      404
    );
    expect((await run(getCoOwnerPortalFormModesHandler, { params: { formKey: 'syndic.test-portal' } })).status).toBe(
      403
    );
  });
});

describe('admin form-unlocks', () => {
  const put = (body: any, tenantId = 't1') => run(setFormUnlockHandler, { params: { tenantId }, body });

  it('liste les champs GATED avec auteur (select restreint), date et motif', async () => {
    const date = new Date('2026-11-16T10:00:00Z');
    prismaMock.tenantFormFieldUnlock.findMany.mockResolvedValue([
      { formKey: FORM, fieldKey: 'gated', reason: 'Demande client', unlockedById: 'u9', createdAt: date }
    ]);
    prismaMock.user.findMany.mockResolvedValue([{ id: 'u9', fullName: 'Admin Test', email: 'a@x.test' }]);
    const { status, body } = await run(listFormUnlocksHandler, { params: { tenantId: 't1' } });
    expect(status).toBe(200);
    expect(body.data.entries).toHaveLength(1);
    expect(body.data.entries[0]).toMatchObject({
      fieldKey: 'gated',
      unlocked: true,
      reason: 'Demande client',
      unlockedAt: '2026-11-16T10:00:00.000Z',
      unlockedBy: { id: 'u9', firstName: 'Admin', lastName: 'Test', email: 'a@x.test' }
    });
    expect(prismaMock.user.findMany.mock.calls[0][0].select).toEqual({ id: true, fullName: true, email: true });
  });

  it('déverrouille : crée la ligne, audit plateforme, invalide le cache', async () => {
    const { status } = await put({ formKey: FORM, fieldKey: 'gated', unlocked: true, reason: 'ok' });
    expect(status).toBe(200);
    expect(prismaMock.tenantFormFieldUnlock.create).toHaveBeenCalledWith({
      data: { tenantId: 't1', formKey: FORM, fieldKey: 'gated', reason: 'ok', unlockedById: 'u1' }
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ actionKey: 'PLATFORM_FORM_FIELD_UNLOCK_CHANGED', tenantId: 't1' })
    );
    expect(invalidateFieldModes).toHaveBeenCalledWith('t1', FORM);
  });

  it('reverrouille : supprime la ligne', async () => {
    prismaMock.tenantFormFieldUnlock.findFirst.mockResolvedValue({ id: 'x', reason: null });
    expect((await put({ formKey: FORM, fieldKey: 'gated', unlocked: false })).status).toBe(200);
    expect(prismaMock.tenantFormFieldUnlock.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', formKey: FORM, fieldKey: 'gated' }
    });
  });

  it('404 agence inexistante, 400 champ non GATED ou inconnu ou corps non strict', async () => {
    prismaMock.tenant.findUnique.mockResolvedValueOnce(null);
    expect((await put({ formKey: FORM, fieldKey: 'gated', unlocked: true }, 'zzz')).status).toBe(404);
    expect((await put({ formKey: FORM, fieldKey: 'open', unlocked: true })).status).toBe(400);
    expect((await put({ formKey: FORM, fieldKey: 'inconnu', unlocked: true })).status).toBe(400);
    expect((await put({ formKey: FORM, fieldKey: 'gated', unlocked: true, tenantId: 'autre' })).status).toBe(400);
    expect(prismaMock.tenantFormFieldUnlock.create).not.toHaveBeenCalled();
  });
});
