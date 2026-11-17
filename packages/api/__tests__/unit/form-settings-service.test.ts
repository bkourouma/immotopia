const mockPrisma = {
  tenantFormFieldSetting: { findMany: jest.fn() },
  tenantFormFieldUnlock: { findMany: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
const mockWarn = jest.fn();
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: (...args: unknown[]) => mockWarn(...args), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import { getEffectiveFieldModes, invalidateFieldModes } from '../../src/lib/form-settings/service';
import type { FormRegistry } from '../../src/lib/form-settings/types';
import { NotFoundError } from '../../src/middleware/error-middleware';

const REGISTRY: FormRegistry = {
  'test.form': {
    formKey: 'test.form',
    module: 'test',
    label: 'Formulaire',
    audience: 'agency',
    fields: [
      {
        key: 'open',
        label: 'Champ ouvert',
        fieldClass: 'OPEN',
        defaultMode: 'REQUIRED',
        allowedModes: ['REQUIRED', 'OPTIONAL', 'HIDDEN'],
        consequence: 'x'
      },
      {
        key: 'gated',
        label: 'Champ verrouillé',
        fieldClass: 'GATED',
        defaultMode: 'REQUIRED',
        allowedModes: ['REQUIRED', 'OPTIONAL'],
        consequence: 'x'
      }
    ]
  }
};

function seed(settings: Array<{ fieldKey: string; mode: string }>, unlocks: string[] = []) {
  mockPrisma.tenantFormFieldSetting.findMany.mockResolvedValue(settings);
  mockPrisma.tenantFormFieldUnlock.findMany.mockResolvedValue(unlocks.map(fieldKey => ({ fieldKey })));
}

describe('getEffectiveFieldModes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateFieldModes('t1');
    invalidateFieldModes('t2');
  });

  it('sans ligne : comportement actuel', async () => {
    seed([]);
    const res = await getEffectiveFieldModes('t1', 'test.form', REGISTRY);
    expect(res).toEqual({ formKey: 'test.form', fields: { open: 'REQUIRED', gated: 'REQUIRED' } });
  });

  it("OPEN : le réglage de l'agence s'applique", async () => {
    seed([{ fieldKey: 'open', mode: 'HIDDEN' }]);
    const res = await getEffectiveFieldModes('t1', 'test.form', REGISTRY);
    expect(res.fields.open).toBe('HIDDEN');
  });

  it('GATED sans déverrouillage : defaultMode malgré le réglage', async () => {
    seed([{ fieldKey: 'gated', mode: 'OPTIONAL' }]);
    const res = await getEffectiveFieldModes('t1', 'test.form', REGISTRY);
    expect(res.fields.gated).toBe('REQUIRED');
  });

  it("GATED déverrouillé : le réglage s'applique", async () => {
    seed([{ fieldKey: 'gated', mode: 'OPTIONAL' }], ['gated']);
    const res = await getEffectiveFieldModes('t1', 'test.form', REGISTRY);
    expect(res.fields.gated).toBe('OPTIONAL');
  });

  it('mode hors allowedModes ou invalide : defaultMode', async () => {
    seed(
      [
        { fieldKey: 'gated', mode: 'HIDDEN' },
        { fieldKey: 'open', mode: 'BIZARRE' }
      ],
      ['gated']
    );
    const res = await getEffectiveFieldModes('t1', 'test.form', REGISTRY);
    expect(res.fields).toEqual({ open: 'REQUIRED', gated: 'REQUIRED' });
  });

  it('filtre les requêtes par tenantId et formKey', async () => {
    seed([]);
    await getEffectiveFieldModes('t1', 'test.form', REGISTRY);
    expect(mockPrisma.tenantFormFieldSetting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', formKey: 'test.form' } })
    );
    expect(mockPrisma.tenantFormFieldUnlock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', formKey: 'test.form' } })
    );
  });

  it('formKey inconnu : NotFoundError', async () => {
    await expect(getEffectiveFieldModes('t1', 'nope', REGISTRY)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('cache : une seule lecture, par tenant, invalidable', async () => {
    seed([]);
    await getEffectiveFieldModes('t1', 'test.form', REGISTRY);
    await getEffectiveFieldModes('t1', 'test.form', REGISTRY);
    expect(mockPrisma.tenantFormFieldSetting.findMany).toHaveBeenCalledTimes(1);

    await getEffectiveFieldModes('t2', 'test.form', REGISTRY);
    expect(mockPrisma.tenantFormFieldSetting.findMany).toHaveBeenCalledTimes(2);

    seed([{ fieldKey: 'open', mode: 'OPTIONAL' }]);
    invalidateFieldModes('t1', 'test.form');
    const res = await getEffectiveFieldModes('t1', 'test.form', REGISTRY);
    expect(res.fields.open).toBe('OPTIONAL');
    expect(mockPrisma.tenantFormFieldSetting.findMany).toHaveBeenCalledTimes(3);

    // Invalidation de toute l'agence, sans toucher aux autres.
    invalidateFieldModes('t1');
    await getEffectiveFieldModes('t1', 'test.form', REGISTRY);
    await getEffectiveFieldModes('t2', 'test.form', REGISTRY);
    expect(mockPrisma.tenantFormFieldSetting.findMany).toHaveBeenCalledTimes(4);
  });

  it('cache : expire après 30 s', async () => {
    seed([]);
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    await getEffectiveFieldModes('t1', 'test.form', REGISTRY);
    now.mockReturnValue(1_000_000 + 31_000);
    await getEffectiveFieldModes('t1', 'test.form', REGISTRY);
    expect(mockPrisma.tenantFormFieldSetting.findMany).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });

  it('lecture Prisma en échec : modes par défaut, avertissement, rien en cache', async () => {
    mockPrisma.tenantFormFieldSetting.findMany.mockRejectedValue(new Error('table absente'));
    mockPrisma.tenantFormFieldUnlock.findMany.mockResolvedValue([]);
    const res = await getEffectiveFieldModes('t1', 'test.form', REGISTRY);
    expect(res.fields).toEqual({ open: 'REQUIRED', gated: 'REQUIRED' });
    expect(mockWarn).toHaveBeenCalledTimes(1);

    // Pas de mise en cache : la lecture suivante, réussie, voit le réglage.
    seed([{ fieldKey: 'open', mode: 'HIDDEN' }]);
    const next = await getEffectiveFieldModes('t1', 'test.form', REGISTRY);
    expect(next.fields.open).toBe('HIDDEN');
  });

  it('client mocké (réponse vide) : modes par défaut', async () => {
    mockPrisma.tenantFormFieldSetting.findMany.mockReset();
    mockPrisma.tenantFormFieldUnlock.findMany.mockReset();
    const res = await getEffectiveFieldModes('t1', 'test.form', REGISTRY);
    expect(res.fields).toEqual({ open: 'REQUIRED', gated: 'REQUIRED' });
  });
});
