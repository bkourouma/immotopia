import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
const post = vi.fn();

vi.mock('../../utils/api-client', () => ({
  default: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a)
  }
}));

import {
  applyReturnFile,
  listReturnImports,
  previewReturnFile,
  rejectRemittanceLine,
  settleAllRemittanceLines,
  settleRemittanceLine
} from '../../services/direct-debit-service';

/** Spec 042, P3 — routes du retour banque (data-model §8.7). */

const BASE = '/tenants/agence-1/rental/direct-debit';

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: { success: true, data: { marker: 'get' } } });
  post.mockResolvedValue({ data: { success: true, data: { marker: 'post' } } });
});

describe('direct-debit-service — retour banque (P3)', () => {
  it("constate le règlement d'une ligne et renvoie la remise", async () => {
    const result = await settleRemittanceLine('agence-1', 'r-1', 'l-1', { settledAt: '2026-11-05' });
    expect(post).toHaveBeenCalledWith(`${BASE}/remittances/r-1/lines/l-1/settle`, { settledAt: '2026-11-05' });
    expect(result).toEqual({ marker: 'post' });
  });

  it('constate le rejet avec code et motif', async () => {
    await rejectRemittanceLine('agence-1', 'r-1', 'l-1', {
      rejectedAt: '2026-11-07',
      code: 'AC04',
      reason: 'Compte clôturé'
    });
    expect(post).toHaveBeenCalledWith(`${BASE}/remittances/r-1/lines/l-1/reject`, {
      rejectedAt: '2026-11-07',
      code: 'AC04',
      reason: 'Compte clôturé'
    });
  });

  it('constate toute la remise réglée à une date unique', async () => {
    await settleAllRemittanceLines('agence-1', 'r-1', { settledAt: '2026-11-05' });
    expect(post).toHaveBeenCalledWith(`${BASE}/remittances/r-1/settle-all`, { settledAt: '2026-11-05' });
  });

  it("envoie l'aperçu en multipart sous « file » avec le format", async () => {
    const file = new File(['reference_operation;statut'], 'retour.csv', { type: 'text/csv' });
    await previewReturnFile('agence-1', file);
    const [url, body, config] = post.mock.calls[0];
    expect(url).toBe(`${BASE}/returns/preview`);
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBe(file);
    expect((body as FormData).get('format')).toBe('GENERIC_CSV');
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
  });

  it("applique le même fichier par la route d'application", async () => {
    const file = new File(['x'], 'retour.csv', { type: 'text/csv' });
    await applyReturnFile('agence-1', file, 'GENERIC_CSV');
    const [url, body] = post.mock.calls[0];
    expect(url).toBe(`${BASE}/returns/apply`);
    expect((body as FormData).get('file')).toBe(file);
  });

  it("lit l'historique des imports avec la pagination", async () => {
    const result = await listReturnImports('agence-1', { page: 2, pageSize: 10 });
    expect(get).toHaveBeenCalledWith(`${BASE}/returns`, { params: { page: 2, pageSize: 10 } });
    expect(result).toEqual({ marker: 'get' });
  });
});
