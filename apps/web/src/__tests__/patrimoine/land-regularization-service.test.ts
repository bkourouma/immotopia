import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient from '../../utils/api-client';
import {
  addLandStep,
  changeLandRegularizationStatus,
  changeLandStepStatus,
  createLandRegularization,
  deleteLandStep,
  getLandRegularization,
  listLandRegularizations,
  listLandTracks,
  updateLandRegularization,
  updateLandStep
} from '../../pages/patrimoine/land/land-regularization-service';

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

const client = apiClient as unknown as Record<'get' | 'post' | 'patch' | 'delete', ReturnType<typeof vi.fn>>;
const BASE = '/tenants/agence-1/patrimoine';

beforeEach(() => {
  vi.clearAllMocks();
  for (const method of ['get', 'post', 'patch', 'delete'] as const) {
    client[method].mockResolvedValue({ data: { success: true, data: { ok: method } } });
  }
});

describe('land-regularization-service', () => {
  it('lit le catalogue des filières', async () => {
    expect(await listLandTracks('agence-1')).toEqual({ ok: 'get' });
    expect(client.get).toHaveBeenCalledWith(`${BASE}/land-tracks`);
  });

  it('la liste n’envoie que propertyId et status', async () => {
    await listLandRegularizations('agence-1', { propertyId: 'bien-1', status: 'EN_COURS' });
    expect(client.get).toHaveBeenCalledWith(`${BASE}/land-regularizations?propertyId=bien-1&status=EN_COURS`);

    await listLandRegularizations('agence-1');
    expect(client.get).toHaveBeenLastCalledWith(`${BASE}/land-regularizations`);

    await listLandRegularizations('agence-1', { status: 'TERMINEE' });
    expect(client.get).toHaveBeenLastCalledWith(`${BASE}/land-regularizations?status=TERMINEE`);
  });

  it('crée un dossier par POST', async () => {
    const body = { propertyId: 'bien-1', track: 'CI_ACD' as const, notes: 'n' };
    await createLandRegularization('agence-1', body);
    expect(client.post).toHaveBeenCalledWith(`${BASE}/land-regularizations`, body);
  });

  it('lit et modifie un dossier', async () => {
    await getLandRegularization('agence-1', 'reg 1');
    expect(client.get).toHaveBeenCalledWith(`${BASE}/land-regularizations/reg%201`);

    await updateLandRegularization('agence-1', 'reg-1', { notes: 'x' });
    expect(client.patch).toHaveBeenCalledWith(`${BASE}/land-regularizations/reg-1`, { notes: 'x' });
  });

  it('change le statut du dossier, avec ou sans motif', async () => {
    await changeLandRegularizationStatus('agence-1', 'reg-1', 'EN_COURS', 'Nouvelle pièce');
    expect(client.post).toHaveBeenCalledWith(`${BASE}/land-regularizations/reg-1/status`, {
      status: 'EN_COURS',
      reason: 'Nouvelle pièce'
    });

    await changeLandRegularizationStatus('agence-1', 'reg-1', 'TERMINEE');
    expect(client.post).toHaveBeenLastCalledWith(`${BASE}/land-regularizations/reg-1/status`, { status: 'TERMINEE' });
  });

  it('ajoute, modifie, change le statut et supprime une étape', async () => {
    await addLandStep('agence-1', 'reg-1', { label: 'Visite' });
    expect(client.post).toHaveBeenCalledWith(`${BASE}/land-regularizations/reg-1/steps`, { label: 'Visite' });

    await updateLandStep('agence-1', 'reg-1', 'st-1', { documentId: null, costXof: 1000 });
    expect(client.patch).toHaveBeenCalledWith(`${BASE}/land-regularizations/reg-1/steps/st-1`, {
      documentId: null,
      costXof: 1000
    });

    await changeLandStepStatus('agence-1', 'reg-1', 'st-1', 'EN_COURS', 'motif');
    expect(client.post).toHaveBeenLastCalledWith(`${BASE}/land-regularizations/reg-1/steps/st-1/status`, {
      status: 'EN_COURS',
      reason: 'motif'
    });

    await deleteLandStep('agence-1', 'reg-1', 'st-1');
    expect(client.delete).toHaveBeenCalledWith(`${BASE}/land-regularizations/reg-1/steps/st-1`);
  });
});
