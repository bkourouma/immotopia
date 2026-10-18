import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/api-client', () => ({
  default: { get: vi.fn(), post: vi.fn() }
}));
vi.mock('../../utils/save-blob', () => ({ filenameFromDisposition: vi.fn() }));

import apiClient from '../../utils/api-client';
import {
  cancelDeclaration,
  createDeclaration,
  getDeclaredAvailability,
  listMyDeclarations,
  readPaymentProof,
  type DeclarationInput
} from '../../services/coowner-portal-service';
import {
  aiFieldHint,
  aiReadFailedMessage,
  declarationStatusColor,
  declarationStatusLabel,
  formatPhoneForDisplay,
  isValidTransactionReference,
  normalizeTransactionReference,
  operatorLabel,
  parseDeclarationApiError,
  rejectReasonLabel,
  validateProofFile
} from '../../components/coowner-portal/declared-payment/labels';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;

const input: DeclarationInput = {
  syndicId: 's1',
  receivingNumberId: 'n1',
  payerPhone: '0707070707',
  amount: 1000,
  paidAt: '2026-10-17T14:32:00+00:00',
  transactionReference: 'OM1234',
  lines: [{ lotId: 'l1', amount: 1000, chargeCallIds: [] }],
  proofReadId: 'r1'
};

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockResolvedValue({ data: { data: { ok: true } } });
  post.mockResolvedValue({ data: { data: { ok: true } } });
});

describe('service paiement déclaré', () => {
  it('createDeclaration garde proofReadId sans fichier', async () => {
    await createDeclaration(input);
    const [url, form, config] = post.mock.calls[0];
    expect(url).toBe('/portal/copropriete/paiements-declares');
    expect(config.headers['Content-Type']).toBe('multipart/form-data');
    expect(JSON.parse((form as FormData).get('payload') as string).proofReadId).toBe('r1');
    expect((form as FormData).has('proof')).toBe(false);
  });

  it('createDeclaration retire proofReadId quand un fichier est joint', async () => {
    const file = new File(['x'], 'p.png', { type: 'image/png' });
    await createDeclaration({ ...input, comment: undefined }, file);
    const form = post.mock.calls[0][1] as FormData;
    const payload = JSON.parse(form.get('payload') as string);
    expect('proofReadId' in payload).toBe(false);
    expect('comment' in payload).toBe(false);
    expect(form.get('proof')).toBeInstanceOf(File);
  });

  it('createDeclaration omet proofReadId nul', async () => {
    await createDeclaration({ ...input, proofReadId: null });
    const payload = JSON.parse((post.mock.calls[0][1] as FormData).get('payload') as string);
    expect('proofReadId' in payload).toBe(false);
  });

  it('cancelDeclaration, readPaymentProof, disponibilité et liste appellent la bonne route', async () => {
    await cancelDeclaration('a/b');
    expect(post.mock.calls[0][0]).toBe('/portal/copropriete/paiements-declares/a%2Fb/annulation');

    await readPaymentProof('s1', new File(['x'], 'p.png', { type: 'image/png' }));
    expect(post.mock.calls[1][0]).toBe('/portal/copropriete/paiements-declares/lecture');
    expect((post.mock.calls[1][1] as FormData).get('syndicId')).toBe('s1');

    await getDeclaredAvailability('s1');
    expect(get.mock.calls[0][0]).toBe('/portal/copropriete/paiements-declares/disponibilite');
    expect(get.mock.calls[0][1]).toEqual({ params: { syndicId: 's1' } });

    await listMyDeclarations({ status: 'ALL', page: 2 });
    expect(get.mock.calls[1][0]).toBe('/portal/copropriete/paiements-declares');
    expect(get.mock.calls[1][1]).toEqual({ params: { status: 'ALL', page: 2 } });
  });
});

describe('labels paiement déclaré', () => {
  it('normalise et valide la référence', () => {
    expect(normalizeTransactionReference('om 23 ab.12')).toBe('OM23AB.12');
    expect(isValidTransactionReference('OM23AB.12')).toBe(true);
    expect(isValidTransactionReference('AB')).toBe(false);
    expect(isValidTransactionReference('AB_CD')).toBe(false);
  });

  it('valide la capture', () => {
    expect(validateProofFile({ type: 'image/png', size: 100 })).toBeNull();
    expect(validateProofFile({ type: 'image/gif', size: 100 })).toContain('JPEG');
    expect(validateProofFile({ type: 'application/pdf', size: 5 * 1024 * 1024 + 1 })).toContain('5 Mo');
  });

  it('formate le téléphone', () => {
    expect(formatPhoneForDisplay('+2250707070707')).toBe('+225 07 07 07 07 07');
    expect(formatPhoneForDisplay('+33612345678')).toBe('+33612345678');
  });

  it('libellés et couleurs', () => {
    expect(operatorLabel('MTN')).toBe('MTN MoMo');
    expect(declarationStatusLabel('PENDING')).toBe('En vérification');
    expect(declarationStatusColor('APPROVED')).toBe('success');
    expect(declarationStatusColor('CANCELED')).toBe('default');
    expect(rejectReasonLabel('AMOUNT_MISMATCH')).toBe('Montant ne correspondant pas');
    expect(aiFieldHint()).toBe('Lu automatiquement, vérifiez');
    expect(aiReadFailedMessage()).toContain('lecture automatique');
  });

  it('lit l’erreur API', () => {
    expect(parseDeclarationApiError({ response: { status: 409, data: { message: 'm', code: 'C' } } }, 'f')).toEqual({
      message: 'm',
      code: 'C',
      status: 409
    });
    expect(parseDeclarationApiError(new Error('x'), 'f').message).toBe('f');
  });
});
