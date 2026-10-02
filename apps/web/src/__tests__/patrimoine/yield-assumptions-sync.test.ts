import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadYieldAssumptions,
  persistYieldAssumptions,
  readYieldAssumptions,
  writeYieldAssumptions
} from '../../components/patrimoine/yield-assumptions-storage';
import { getYieldAssumptions, saveYieldAssumptions } from '../../services/patrimoine-service';

vi.mock('../../services/patrimoine-service', () => ({
  getYieldAssumptions: vi.fn(),
  saveYieldAssumptions: vi.fn()
}));

const getMock = vi.mocked(getYieldAssumptions);
const saveMock = vi.mocked(saveYieldAssumptions);

const serveur = { years: 12, valueGrowthRate: 0.04, rentGrowthRate: 0.02, expenseGrowthRate: 0.025, vacancyRate: 0.05 };
const local = { years: 7, valueGrowthRate: 0.03, rentGrowthRate: 0.01, expenseGrowthRate: 0.02, vacancyRate: 0.1 };
const defauts = { years: 10, valueGrowthRate: 0.03, rentGrowthRate: 0.02, expenseGrowthRate: 0.025, vacancyRate: 0.05 };

const etat = (assumptions: typeof serveur, saved: boolean) => ({
  assumptions,
  saved,
  updatedAt: saved ? '2026-10-01T00:00:00.000Z' : null
});

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
});

describe('loadYieldAssumptions', () => {
  it('le serveur enregistré l’emporte sur le local, ne l’écrase pas et devient le miroir local', async () => {
    writeYieldAssumptions('A', 'P', local);
    getMock.mockResolvedValue(etat(serveur, true));

    const r = await loadYieldAssumptions('A', 'P');

    expect(r).toEqual({ assumptions: serveur, source: 'server', synced: true });
    expect(saveMock).not.toHaveBeenCalled();
    expect(readYieldAssumptions('A', 'P')).toEqual(serveur);
  });

  it('migre une valeur locale valide par un seul PUT, puis plus aucune migration (idempotent)', async () => {
    writeYieldAssumptions('A', 'P', local);
    // Faux serveur à état : sans ligne au départ, il en a une dès le premier PUT.
    let ligne: typeof serveur | null = null;
    getMock.mockImplementation(async () => (ligne ? etat(ligne, true) : etat(defauts, false)));
    saveMock.mockImplementation(async (_t, _p, valeur) => {
      ligne = valeur;
      return etat(valeur, true);
    });

    const premier = await loadYieldAssumptions('A', 'P');
    expect(premier).toEqual({ assumptions: local, source: 'server', synced: true });
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith('A', 'P', local);
    expect(readYieldAssumptions('A', 'P')).toEqual(local);

    const second = await loadYieldAssumptions('A', 'P');
    expect(second).toEqual({ assumptions: local, source: 'server', synced: true });
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(saveMock).toHaveBeenCalledTimes(1); // aucun PUT supplémentaire
  });

  it('lecture locale : years non entier rejeté, clé inconnue ignorée dans l’objet renvoyé', () => {
    const cle = 'patrimoine:performance:assumptions:A:P';
    window.localStorage.setItem(cle, JSON.stringify({ ...local, years: 2.5 }));
    expect(readYieldAssumptions('A', 'P')).toBeUndefined();

    window.localStorage.setItem(cle, JSON.stringify({ ...local, extra: 'x' }));
    const lu = readYieldAssumptions('A', 'P');
    expect(lu).toEqual(local);
    expect(Object.keys(lu as object).sort()).toEqual(Object.keys(local).sort());
  });

  it('ignore un local invalide : aucun PUT, source « default »', async () => {
    window.localStorage.setItem('patrimoine:performance:assumptions:A:P', JSON.stringify({ ...local, years: 99 }));
    getMock.mockResolvedValue(etat(defauts, false));

    const r = await loadYieldAssumptions('A', 'P');

    expect(saveMock).not.toHaveBeenCalled();
    expect(r).toEqual({ assumptions: undefined, source: 'default', synced: true });
  });

  it('sans valeur locale ni ligne serveur : défauts et aucun PUT', async () => {
    getMock.mockResolvedValue(etat(defauts, false));
    const r = await loadYieldAssumptions('A', 'P');
    expect(r).toEqual({ assumptions: undefined, source: 'default', synced: true });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('GET en échec : repli sur le local, sans exception', async () => {
    writeYieldAssumptions('A', 'P', local);
    getMock.mockRejectedValue(new Error('réseau'));

    await expect(loadYieldAssumptions('A', 'P')).resolves.toEqual({
      assumptions: local,
      source: 'local',
      synced: false
    });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('GET en échec sans local : pas d’exception, défauts non synchronisés', async () => {
    getMock.mockRejectedValue(new Error('réseau'));
    await expect(loadYieldAssumptions('A', 'P')).resolves.toEqual({
      assumptions: undefined,
      source: 'default',
      synced: false
    });
  });

  it('PUT de migration refusé (403 lecteur) : garde le local, non synchronisé, sans exception', async () => {
    writeYieldAssumptions('A', 'P', local);
    getMock.mockResolvedValue(etat(defauts, false));
    saveMock.mockRejectedValue({ response: { status: 403 } });

    await expect(loadYieldAssumptions('A', 'P')).resolves.toEqual({
      assumptions: local,
      source: 'local',
      synced: false
    });
    expect(readYieldAssumptions('A', 'P')).toEqual(local);
  });

  it('une seule promesse en vol par bien : pas de double PUT concurrent', async () => {
    writeYieldAssumptions('A', 'P', local);
    getMock.mockResolvedValue(etat(defauts, false));
    saveMock.mockResolvedValue(etat(local, true));

    const [a, b] = await Promise.all([loadYieldAssumptions('A', 'P'), loadYieldAssumptions('A', 'P')]);

    expect(a).toBe(b);
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });
});

describe('persistYieldAssumptions', () => {
  it('succès : PUT puis miroir local, synchronisé', async () => {
    saveMock.mockResolvedValue(etat(local, true));
    await expect(persistYieldAssumptions('A', 'P', local)).resolves.toEqual({ synced: true });
    expect(saveMock).toHaveBeenCalledWith('A', 'P', local);
    expect(readYieldAssumptions('A', 'P')).toEqual(local);
  });

  it('échec : écriture locale seule, non synchronisé, sans exception', async () => {
    saveMock.mockRejectedValue(new Error('hors ligne'));
    await expect(persistYieldAssumptions('A', 'P', local)).resolves.toEqual({ synced: false });
    expect(readYieldAssumptions('A', 'P')).toEqual(local);
  });
});
