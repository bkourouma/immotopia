/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Cache mémoire des octets d'image de marque déjà validés (lot
 * « anomalies-recette »). Un document non stocké (ou l'impression groupée,
 * qui ne stocke jamais rien) relit le même logo d'agence à chaque appel :
 * ces lectures disque répétées sont évitées, sans jamais servir un fichier
 * remplacé sous le même chemin (invalidation par `mtimeMs`).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { clearImageFileCache, readImageFile } from '../../src/lib/documents/branding-storage';

const DIR = path.join(os.tmpdir(), `immotopia-branding-cache-${process.pid}-${Date.now()}`);

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

beforeAll(() => {
  fs.mkdirSync(DIR, { recursive: true });
});

afterAll(() => {
  fs.rmSync(DIR, { recursive: true, force: true });
});

beforeEach(() => {
  clearImageFileCache();
});

describe('readImageFile — cache mémoire', () => {
  it('ne relit pas le disque pour le même fichier (même chemin, même mtime)', async () => {
    const file = path.join(DIR, 'logo-un.png');
    fs.writeFileSync(file, PNG);
    const readFileSpy = jest.spyOn(fs.promises, 'readFile');
    readFileSpy.mockClear();

    const first = await readImageFile(file);
    const second = await readImageFile(file);

    expect(first?.format).toBe('png');
    expect(second).toEqual(first);
    // Un seul `fs.readFile` : le second appel sert le cache.
    expect(readFileSpy).toHaveBeenCalledTimes(1);
    readFileSpy.mockRestore();
  });

  it('relit le disque si le fichier a été remplacé (mtime différent)', async () => {
    const file = path.join(DIR, 'logo-deux.png');
    fs.writeFileSync(file, PNG);
    await readImageFile(file);

    // `mtimeMs` change explicitement : sur certains systèmes de fichiers, une
    // écriture immédiate peut garder la même milliseconde.
    const future = new Date(Date.now() + 5_000);
    fs.utimesSync(file, future, future);
    fs.writeFileSync(file, PNG); // contenu identique, seul le remplacement compte ici
    fs.utimesSync(file, future, future);

    const readFileSpy = jest.spyOn(fs.promises, 'readFile');
    readFileSpy.mockClear();
    await readImageFile(file);
    expect(readFileSpy).toHaveBeenCalledTimes(1);
    readFileSpy.mockRestore();
  });

  it('deux fichiers différents ne partagent jamais leur entrée de cache', async () => {
    const fileA = path.join(DIR, 'logo-a.png');
    const fileB = path.join(DIR, 'logo-b.png');
    fs.writeFileSync(fileA, PNG);
    fs.writeFileSync(fileB, PNG);

    const a = await readImageFile(fileA);
    const b = await readImageFile(fileB);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a?.bytes).not.toBe(b?.bytes);
  });

  it('renvoie null pour un fichier absent, sans planter, et ne le met pas en cache', async () => {
    const missing = path.join(DIR, 'absent.png');
    expect(await readImageFile(missing)).toBeNull();
    expect(await readImageFile(missing)).toBeNull();
  });
});
