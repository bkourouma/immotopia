/* eslint-disable @typescript-eslint/no-explicit-any */
const mockPrisma = {
  tenantFormFieldSetting: { findMany: jest.fn() },
  tenantFormFieldUnlock: { findMany: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

import { applyFieldModes, formFieldModes } from '../../src/lib/form-settings/apply';
import { invalidateFieldModes } from '../../src/lib/form-settings/service';
import type { EffectiveForm, FormRegistry } from '../../src/lib/form-settings/types';
import { AppError, ErrorCode } from '../../src/middleware/error-middleware';

function modes(fields: EffectiveForm['fields'], labels: Record<string, string> = {}): EffectiveForm {
  const form: EffectiveForm = { formKey: 'f', fields };
  Object.defineProperty(form, 'labels', { value: labels, enumerable: false });
  return form;
}

function catchError(fn: () => void): AppError {
  try {
    fn();
  } catch (e) {
    return e as AppError;
  }
  throw new Error('aucune erreur levée');
}

describe('applyFieldModes', () => {
  it('REQUIRED vide : 400 FORM_FIELD_REQUIRED avec libellé et fieldKey', () => {
    for (const empty of [undefined, null, '', '   ', []]) {
      const err = catchError(() => applyFieldModes({ ref: empty }, modes({ ref: 'REQUIRED' }, { ref: 'Référence' })));
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe(ErrorCode.FORM_FIELD_REQUIRED);
      expect(err.message).toBe('Le champ Référence est obligatoire.');
      expect(err.data).toEqual({ fieldKey: 'ref' });
    }
  });

  it('REQUIRED renseigné (y compris 0 et false) : accepté', () => {
    const body = { a: 0, b: false, c: 'x' };
    expect(() => applyFieldModes(body, modes({ a: 'REQUIRED', b: 'REQUIRED', c: 'REQUIRED' }))).not.toThrow();
  });

  it('OPTIONAL : inchangé', () => {
    const body = { ref: '' };
    applyFieldModes(body, modes({ ref: 'OPTIONAL' }));
    expect(body).toEqual({ ref: '' });
  });

  it('HIDDEN : clé supprimée, ou null avec nullOnHidden', () => {
    const a: any = { ref: 'x', other: 1 };
    applyFieldModes(a, modes({ ref: 'HIDDEN' }));
    expect(a).toEqual({ other: 1 });

    const b: any = { ref: 'x', other: 1 };
    applyFieldModes(b, modes({ ref: 'HIDDEN' }), { nullOnHidden: true });
    expect(b).toEqual({ ref: null, other: 1 });
  });

  it('tableaux lines[].x : chaque élément est contrôlé', () => {
    const body: any = {
      lines: [
        { x: 'a', y: 1 },
        { x: 'b', y: 2 }
      ]
    };
    applyFieldModes(body, modes({ 'lines[].x': 'HIDDEN' }));
    expect(body.lines).toEqual([{ y: 1 }, { y: 2 }]);

    const err = catchError(() =>
      applyFieldModes({ lines: [{ x: 'a' }, { x: ' ' }] }, modes({ 'lines[].x': 'REQUIRED' }))
    );
    expect(err.data).toEqual({ fieldKey: 'lines[].x' });
  });

  it('tableau absent ou vide : rien à contrôler', () => {
    expect(() => applyFieldModes({}, modes({ 'lines[].x': 'REQUIRED' }))).not.toThrow();
    expect(() => applyFieldModes({ lines: [] }, modes({ 'lines[].x': 'REQUIRED' }))).not.toThrow();
  });

  it('partial : REQUIRED absent accepté, présent et vide refusé', () => {
    expect(() => applyFieldModes({}, modes({ ref: 'REQUIRED' }), { partial: true })).not.toThrow();
    expect(() => applyFieldModes({ ref: '' }, modes({ ref: 'REQUIRED' }), { partial: true })).toThrow(AppError);
    expect(() => applyFieldModes({ ref: null }, modes({ ref: 'REQUIRED' }), { partial: true })).toThrow(AppError);
  });

  it('corps non objet : sans effet', () => {
    expect(() => applyFieldModes(undefined, modes({ ref: 'REQUIRED' }))).not.toThrow();
    expect(() => applyFieldModes('x', modes({ ref: 'REQUIRED' }))).not.toThrow();
  });
});

describe('formFieldModes (middleware)', () => {
  const REGISTRY: FormRegistry = {
    'test.form': {
      formKey: 'test.form',
      module: 'test',
      label: 'Formulaire',
      audience: 'agency',
      fields: [
        {
          key: 'ref',
          label: 'Référence',
          fieldClass: 'OPEN',
          defaultMode: 'REQUIRED',
          allowedModes: ['REQUIRED', 'OPTIONAL', 'HIDDEN'],
          consequence: 'x'
        },
        {
          key: 'note',
          label: 'Note',
          fieldClass: 'OPEN',
          defaultMode: 'OPTIONAL',
          allowedModes: ['REQUIRED', 'OPTIONAL', 'HIDDEN'],
          consequence: 'x'
        }
      ]
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    invalidateFieldModes('tenant-a');
    invalidateFieldModes('tenant-p');
    mockPrisma.tenantFormFieldSetting.findMany.mockResolvedValue([]);
    mockPrisma.tenantFormFieldUnlock.findMany.mockResolvedValue([]);
  });

  async function run(mw: any, req: any) {
    const next = jest.fn();
    await mw(req, {}, next);
    return next;
  }

  it('agence : tenantId lu dans req.tenantContext', async () => {
    const req: any = { tenantContext: { tenantId: 'tenant-a' }, body: { ref: 'R1' } };
    const next = await run(formFieldModes('test.form', { registry: REGISTRY }), req);
    expect(next).toHaveBeenCalledWith();
    expect(mockPrisma.tenantFormFieldSetting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-a', formKey: 'test.form' } })
    );
  });

  it('portail copropriétaire : tenantId lu dans req.coOwnerPortal.scope.tenantId', async () => {
    mockPrisma.tenantFormFieldSetting.findMany.mockResolvedValue([{ fieldKey: 'ref', mode: 'HIDDEN' }]);
    const req: any = { coOwnerPortal: { scope: { tenantId: 'tenant-p' } }, body: { ref: 'R1', note: 'n' } };
    const next = await run(formFieldModes('test.form', { registry: REGISTRY }), req);
    expect(next).toHaveBeenCalledWith();
    expect(mockPrisma.tenantFormFieldSetting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-p', formKey: 'test.form' } })
    );
    expect(req.body).toEqual({ note: 'n' });
  });

  it('REQUIRED vide : next(AppError 400)', async () => {
    const req: any = { tenantContext: { tenantId: 'tenant-a' }, body: { ref: '' } };
    const next = await run(formFieldModes('test.form', { registry: REGISTRY }), req);
    expect(next.mock.calls[0][0].code).toBe(ErrorCode.FORM_FIELD_REQUIRED);
  });

  it('sans agence : next(403), aucune lecture', async () => {
    const next = await run(formFieldModes('test.form', { registry: REGISTRY }), { body: {} });
    expect(next.mock.calls[0][0].statusCode).toBe(403);
    expect(mockPrisma.tenantFormFieldSetting.findMany).not.toHaveBeenCalled();
  });

  it('formKey inconnu : next(404)', async () => {
    const req: any = { tenantContext: { tenantId: 'tenant-a' }, body: {} };
    const next = await run(formFieldModes('nope', { registry: REGISTRY }), req);
    expect(next.mock.calls[0][0].statusCode).toBe(404);
  });

  it('payloadField : JSON parsé puis réécrit en JSON', async () => {
    mockPrisma.tenantFormFieldSetting.findMany.mockResolvedValue([{ fieldKey: 'note', mode: 'HIDDEN' }]);
    const req: any = {
      tenantContext: { tenantId: 'tenant-a' },
      body: { payload: JSON.stringify({ ref: 'R1', note: 'à masquer' }), autre: 'garde' }
    };
    const next = await run(formFieldModes('test.form', { registry: REGISTRY, payloadField: 'payload' }), req);
    expect(next).toHaveBeenCalledWith();
    expect(typeof req.body.payload).toBe('string');
    expect(JSON.parse(req.body.payload)).toEqual({ ref: 'R1' });
    expect(req.body.autre).toBe('garde');
  });

  it('payloadField : REQUIRED vide, JSON illisible, payload absent', async () => {
    const mw = formFieldModes('test.form', { registry: REGISTRY, payloadField: 'payload' });

    const empty: any = { tenantContext: { tenantId: 'tenant-a' }, body: { payload: JSON.stringify({ ref: ' ' }) } };
    expect((await run(mw, empty)).mock.calls[0][0].code).toBe(ErrorCode.FORM_FIELD_REQUIRED);

    const bad: any = { tenantContext: { tenantId: 'tenant-a' }, body: { payload: '{oops' } };
    expect((await run(mw, bad)).mock.calls[0][0].statusCode).toBe(400);

    const missing: any = { tenantContext: { tenantId: 'tenant-a' }, body: {} };
    expect((await run(mw, missing)).mock.calls[0][0].code).toBe(ErrorCode.FORM_FIELD_REQUIRED);
  });

  it('partial : PATCH sans le champ REQUIRED accepté', async () => {
    const req: any = { tenantContext: { tenantId: 'tenant-a' }, body: { note: 'n' } };
    const next = await run(formFieldModes('test.form', { registry: REGISTRY, partial: true }), req);
    expect(next).toHaveBeenCalledWith();
  });
});
