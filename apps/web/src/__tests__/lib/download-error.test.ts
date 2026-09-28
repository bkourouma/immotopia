import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AxiosError } from 'axios';
import { describeDownloadError, readDownloadErrorBody } from '../../utils/download-error';

/**
 * `describeDownloadError` — message affiché pour l'échec d'un téléchargement
 * de fichier (`responseType: 'blob'`).
 *
 * Le corps d'une erreur serveur y arrive en `Blob`, jamais en JSON déjà
 * parsé : ces tests vérifient qu'il est bien relu, et que chaque famille de
 * panne (délai dépassé, réseau coupé, 404, 403, 5xx) obtient un message
 * distinct plutôt que le « Téléchargement impossible. » générique d'avant.
 */

function blobError(status: number, body: unknown): AxiosError {
  const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
  return new AxiosError(
    'Request failed',
    String(status),
    { method: 'get', url: '/tenants/t1/syndics/s1/quittances/r1/fichier', responseType: 'blob' } as never,
    {},
    { status, statusText: '', headers: {}, data: blob, config: {} as never }
  );
}

function noResponseError(code: string): AxiosError {
  return new AxiosError('Network Error', code, { method: 'get', responseType: 'blob' } as never, {});
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('readDownloadErrorBody', () => {
  it('lit le message JSON d’une erreur reçue en Blob', async () => {
    const err = blobError(404, { message: 'Document introuvable.' });
    await expect(readDownloadErrorBody(err)).resolves.toEqual({ message: 'Document introuvable.' });
  });

  it('renvoie null pour un corps qui n’est pas du JSON', async () => {
    const err = new AxiosError(
      'x',
      '404',
      {} as never,
      {},
      {
        status: 404,
        statusText: '',
        headers: {},
        data: new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])]), // %PDF
        config: {} as never
      }
    );
    await expect(readDownloadErrorBody(err)).resolves.toBeNull();
  });

  it('renvoie null si l’erreur n’est pas une AxiosError', async () => {
    await expect(readDownloadErrorBody(new Error('boom'))).resolves.toBeNull();
  });
});

describe('describeDownloadError', () => {
  it('préfère le message du corps JSON (blob) quand il existe', async () => {
    const err = blobError(422, { message: 'Trop de documents pour une seule impression.' });
    await expect(describeDownloadError(err)).resolves.toBe('Trop de documents pour une seule impression.');
  });

  it('utilise `error` si `message` est absent', async () => {
    const err = blobError(500, { error: 'Erreur serveur détaillée' });
    await expect(describeDownloadError(err)).resolves.toBe('Erreur serveur détaillée');
  });

  it('délai dépassé (ECONNABORTED) : message dédié', async () => {
    const err = noResponseError('ECONNABORTED');
    await expect(describeDownloadError(err)).resolves.toBe(
      'Le téléchargement a pris trop de temps. Vérifiez votre connexion puis réessayez.'
    );
  });

  it('délai dépassé (ETIMEDOUT) : même message', async () => {
    const err = noResponseError('ETIMEDOUT');
    await expect(describeDownloadError(err)).resolves.toBe(
      'Le téléchargement a pris trop de temps. Vérifiez votre connexion puis réessayez.'
    );
  });

  it('pas de réponse du tout (réseau coupé) : message réseau', async () => {
    const err = noResponseError('ERR_NETWORK');
    await expect(describeDownloadError(err)).resolves.toBe(
      'Connexion au serveur impossible. Vérifiez votre connexion puis réessayez.'
    );
  });

  it('404 sans corps JSON exploitable : document introuvable', async () => {
    const err = new AxiosError(
      'x',
      '404',
      {} as never,
      {},
      {
        status: 404,
        statusText: '',
        headers: {},
        data: new Blob([]),
        config: {} as never
      }
    );
    await expect(describeDownloadError(err)).resolves.toBe('Document introuvable.');
  });

  it('403 sans corps JSON exploitable : accès refusé', async () => {
    const err = new AxiosError(
      'x',
      '403',
      {} as never,
      {},
      {
        status: 403,
        statusText: '',
        headers: {},
        data: new Blob([]),
        config: {} as never
      }
    );
    await expect(describeDownloadError(err)).resolves.toBe('Accès refusé. Permissions insuffisantes.');
  });

  it('5xx sans corps JSON exploitable : le serveur n’a pas pu produire le document', async () => {
    const err = new AxiosError(
      'x',
      '500',
      {} as never,
      {},
      {
        status: 503,
        statusText: '',
        headers: {},
        data: new Blob([]),
        config: {} as never
      }
    );
    await expect(describeDownloadError(err)).resolves.toBe(
      "Le serveur n'a pas pu produire le document. Réessayez dans un instant."
    );
  });

  it('statut inattendu sans corps exploitable : message générique', async () => {
    const err = new AxiosError(
      'x',
      '418',
      {} as never,
      {},
      {
        status: 418,
        statusText: '',
        headers: {},
        data: new Blob([]),
        config: {} as never
      }
    );
    await expect(describeDownloadError(err)).resolves.toBe('Téléchargement impossible.');
  });

  it('erreur non-Axios : message générique, sans planter', async () => {
    await expect(describeDownloadError(new Error('boom'))).resolves.toBe('Téléchargement impossible.');
    await expect(describeDownloadError('quelque chose')).resolves.toBe('Téléchargement impossible.');
    await expect(describeDownloadError(undefined)).resolves.toBe('Téléchargement impossible.');
  });

  it('journalise sans données personnelles (méthode, URL, code, statut)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const err = blobError(404, { message: 'Document introuvable.' });
    await describeDownloadError(err);
    expect(spy).toHaveBeenCalledWith('[téléchargement]', expect.objectContaining({ method: 'get', status: 404 }));
  });
});
