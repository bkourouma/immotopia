import { describe, it, expect, vi, beforeEach } from 'vitest';

const { get, post, put, patch, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn()
}));

vi.mock('../../../utils/api-client', () => ({
  __esModule: true,
  default: { get, post, put, patch, delete: del }
}));

import * as service from '../../../services/syndic-declared-payment-service';
import {
  alertView,
  formatPhone,
  hasDuplicateSuspicion,
  rejectReasonLabel,
  REJECT_REASON_OPTIONS,
  OPERATOR_OPTIONS,
  statusLabel
} from '../../../components/syndics/declared-payment/helpers';
import type { DeclarationAlert, SyndicDeclarationRow } from '../../../services/syndic-declared-payment-service';

const B = '/tenants/t1/syndics/s1';
const ok = (data: unknown) => ({ data: { success: true, data } });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('syndic-declared-payment-service', () => {
  it('liste les numéros de réception', async () => {
    get.mockResolvedValue(ok([{ id: 'n1' }]));
    const r = await service.listSyndicReceivingNumbers('t1', 's1');
    expect(get).toHaveBeenCalledWith(`${B}/numeros-reception`);
    expect(r).toEqual([{ id: 'n1' }]);
  });

  it('crée, modifie et supprime un numéro', async () => {
    post.mockResolvedValue(ok({ id: 'n1' }));
    patch.mockResolvedValue(ok({ id: 'n1' }));
    del.mockResolvedValue({});
    const body = { operator: 'WAVE' as const, phoneNumber: '0707070707', holderName: 'Syndic' };
    expect(await service.createSyndicReceivingNumber('t1', 's1', body)).toEqual({ id: 'n1' });
    expect(post).toHaveBeenCalledWith(`${B}/numeros-reception`, body);
    await service.updateSyndicReceivingNumber('t1', 's1', 'n1', { isActive: false, sortOrder: 2 });
    expect(patch).toHaveBeenCalledWith(`${B}/numeros-reception/n1`, { isActive: false, sortOrder: 2 });
    await service.deleteSyndicReceivingNumber('t1', 's1', 'n1');
    expect(del).toHaveBeenCalledWith(`${B}/numeros-reception/n1`);
  });

  it('lit et met à jour les réglages', async () => {
    get.mockResolvedValue(ok({ enabled: true }));
    put.mockResolvedValue(ok({ enabled: false }));
    expect(await service.getSyndicDeclaredSettings('t1', 's1')).toEqual({ enabled: true });
    expect(get).toHaveBeenCalledWith(`${B}/paiements-declares/reglages`);
    expect(await service.updateSyndicDeclaredSettings('t1', 's1', { enabled: false })).toEqual({ enabled: false });
    expect(put).toHaveBeenCalledWith(`${B}/paiements-declares/reglages`, { enabled: false });
  });

  it('liste les déclarations sans envoyer les filtres non définis', async () => {
    get.mockResolvedValue(ok({ items: [] }));
    await service.listSyndicDeclarations('t1', 's1');
    const params = get.mock.calls[0][1].params;
    expect(get.mock.calls[0][0]).toBe(`${B}/paiements-declares`);
    expect(Object.values(params).every(v => v === undefined)).toBe(true);
  });

  it('envoie les filtres définis, status ALL tel quel, overdue seulement si vrai', async () => {
    get.mockResolvedValue(ok({ items: [] }));
    await service.listSyndicDeclarations('t1', 's1', {
      status: 'ALL',
      receivingNumberId: 'n1',
      lotId: 'l1',
      from: '2026-10-01',
      to: '2026-10-31',
      overdue: true,
      page: 2,
      limit: 50
    });
    expect(get.mock.calls[0][1].params).toEqual({
      status: 'ALL',
      receivingNumberId: 'n1',
      lotId: 'l1',
      from: '2026-10-01',
      to: '2026-10-31',
      overdue: true,
      page: 2,
      limit: 50
    });
    await service.listSyndicDeclarations('t1', 's1', { overdue: false, status: 'PENDING' });
    const params = get.mock.calls[1][1].params;
    expect(params.overdue).toBeUndefined();
    expect(params.status).toBe('PENDING');
  });

  it('lit une déclaration', async () => {
    get.mockResolvedValue(ok({ id: 'd1' }));
    expect(await service.getSyndicDeclaration('t1', 's1', 'd1')).toEqual({ id: 'd1' });
    expect(get).toHaveBeenCalledWith(`${B}/paiements-declares/d1`);
  });

  it('télécharge la preuve en blob par l’api-client', async () => {
    const blob = new Blob(['x']);
    get.mockResolvedValue({ data: blob });
    expect(await service.getSyndicDeclarationProof('t1', 's1', 'd1')).toBe(blob);
    expect(get).toHaveBeenCalledWith(`${B}/paiements-declares/d1/preuve`, { responseType: 'blob' });
  });

  it('valide et rejette', async () => {
    post.mockResolvedValueOnce(ok({ declaration: { id: 'd1' }, documents: [] }));
    const body = { correction: { paidAt: '2026-10-17T10:00:00+00:00' }, note: 'Date corrigée' };
    await service.approveSyndicDeclaration('t1', 's1', 'd1', body);
    expect(post).toHaveBeenLastCalledWith(`${B}/paiements-declares/d1/validation`, body);
    post.mockResolvedValueOnce(ok({ id: 'd1' }));
    const rej = { reason: 'NOT_FOUND' as const, note: 'Aucun paiement trouvé' };
    await service.rejectSyndicDeclaration('t1', 's1', 'd1', rej);
    expect(post).toHaveBeenLastCalledWith(`${B}/paiements-declares/d1/rejet`, rej);
  });

  it('crée une déclaration en multipart avec preuve', async () => {
    post.mockResolvedValue(ok({ id: 'd1' }));
    const input = {
      receivingNumberId: 'n1',
      payerPhone: '0707070707',
      amount: 1000,
      paidAt: '2026-10-17T10:00:00+00:00',
      transactionReference: 'MP1234',
      lines: [{ lotId: 'l1', amount: 1000, chargeCallIds: [] }]
    };
    const file = new File(['x'], 'preuve.png', { type: 'image/png' });
    await service.createSyndicDeclaration('t1', 's1', input, file);
    const [url, form, config] = post.mock.calls[0];
    expect(url).toBe(`${B}/paiements-declares`);
    expect(form).toBeInstanceOf(FormData);
    expect(JSON.parse(form.get('payload') as string)).toEqual(input);
    expect(form.get('proof')).toBe(file);
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
  });

  it('crée une déclaration sans preuve', async () => {
    post.mockResolvedValue(ok({ id: 'd1' }));
    await service.createSyndicDeclaration('t1', 's1', {
      receivingNumberId: 'n1',
      payerPhone: '0707070707',
      amount: 1000,
      paidAt: '2026-10-17T10:00:00+00:00',
      transactionReference: 'MP1234',
      lines: []
    });
    expect(post.mock.calls[0][1].has('proof')).toBe(false);
    expect(post.mock.calls[0][1].has('payload')).toBe(true);
  });
});

describe('helpers', () => {
  const row: Pick<SyndicDeclarationRow, 'lines'> = {
    lines: [
      {
        id: 'li1',
        lot: { id: 'l1', lotNumber: 'A12' },
        amount: 1000,
        acceptedAmount: null,
        chargeCalls: [],
        chargePaymentId: null,
        documents: []
      }
    ]
  };

  it('formatPhone', () => {
    expect(formatPhone('+2250707070707')).toBe('+225 07 07 07 07 07');
    expect(formatPhone('0707070707')).toBe('0707070707');
    expect(formatPhone('+33612345678')).toBe('+33612345678');
  });

  it('alertView couvre les 9 variantes', () => {
    const alerts: DeclarationAlert[] = [
      { kind: 'REFERENCE_ON_EXISTING_PAYMENT', chargePaymentId: 'p1', paidAt: '2026-10-10T08:00:00Z', amount: 25000 },
      { kind: 'PROBABLE_DUPLICATE', declarationId: 'd2', createdAt: '2026-10-17T10:00:00Z' },
      { kind: 'EXCESS', lotId: 'l1', excess: 5000 },
      { kind: 'PARTIAL', lotId: 'l1', remaining: 7000 },
      { kind: 'DECLARANT_NOT_CURRENT_OWNER', lotId: 'l1' },
      { kind: 'AI_FIELDS_EDITED', fields: ['amount', 'paidAt'] },
      { kind: 'RECIPIENT_MISMATCH', recipientPhone: '+2250101010101' },
      { kind: 'FISCAL_YEAR_CLOSED' },
      { kind: 'OVERDUE', businessDays: 4 }
    ];
    const views = alerts.map(a => alertView(a, row));
    expect(views.map(v => v.severity)).toEqual([
      'warning',
      'warning',
      'info',
      'info',
      'warning',
      'info',
      'warning',
      'error',
      'warning'
    ]);
    for (const v of views) expect(v.text).not.toMatch(/\{\{|undefined/);
    expect(views[0].text).toContain('10/10/2026');
    expect(views[0].text).toMatch(/25\D*000/);
    expect(views[1].text).toMatch(/10 minutes/);
    expect(views[2].text).toMatch(/5\D*000 FCFA/);
    expect(views[2].text).toContain('A12');
    expect(views[3].text).toMatch(/7\D*000 FCFA/);
    expect(views[3].text).toContain('A12');
    expect(views[4].text).toContain('A12');
    expect(views[5].text).toContain('Montant');
    expect(views[5].text).toContain('Date et heure');
    expect(views[6].text).toContain('+225 01 01 01 01 01');
    expect(views[7].text).toContain('exercice clos');
    expect(views[8].text).toContain('4 jours ouvrés');
  });

  it('hasDuplicateSuspicion', () => {
    expect(
      hasDuplicateSuspicion({ alerts: [{ kind: 'PROBABLE_DUPLICATE', declarationId: 'x', createdAt: 'y' }] })
    ).toBe(true);
    expect(
      hasDuplicateSuspicion({
        alerts: [{ kind: 'REFERENCE_ON_EXISTING_PAYMENT', chargePaymentId: 'p', paidAt: 'x', amount: 1 }]
      })
    ).toBe(true);
    expect(hasDuplicateSuspicion({ alerts: [{ kind: 'OVERDUE', businessDays: 3 }] })).toBe(false);
    expect(hasDuplicateSuspicion({ alerts: [] })).toBe(false);
  });

  it('libellés', () => {
    expect(rejectReasonLabel('NOT_FOUND')).toBe('Paiement introuvable');
    expect(REJECT_REASON_OPTIONS.map(o => o.label)).toEqual([
      'Paiement introuvable',
      'Montant ne correspondant pas',
      'Référence déjà utilisée',
      'Numéro de réception erroné',
      'Autre'
    ]);
    expect(OPERATOR_OPTIONS.map(o => o.label)).toEqual(['Orange Money', 'MTN MoMo', 'Moov Money', 'Wave', 'Autre']);
    expect(statusLabel('APPROVED')).toBe('Validée');
  });
});
