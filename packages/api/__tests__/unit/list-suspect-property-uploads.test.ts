/**
 * Inventaire des médias de bien suspects : lecture seule, par extension hors
 * liste blanche, avec le type réel détecté par les octets magiques.
 */
import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';

jest.mock('../../src/config/env', () => ({ env: { UPLOADS_DIR: undefined } }));

import { listSuspectFiles, formatReport, readDirSafe } from '../../src/scripts/list-suspect-property-uploads';

const PNG = Buffer.from('89504e470d0a1a0a0000', 'hex');
let root: string;

async function put(rel: string, content: Buffer | string) {
  const full = path.join(root, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
}

async function snapshot(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (dir: string) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else out[path.relative(root, full)] = (await fs.readFile(full)).toString('hex');
    }
  };
  await walk(root);
  return out;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'suspect-uploads-'));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('listSuspectFiles', () => {
  it('liste .html, .svg et fichier sans extension ; pas les médias légitimes ni documents/', async () => {
    await put('properties/p1/a.html', '<script>alert(1)</script>');
    await put('properties/p1/b.svg', '<svg onload="alert(1)"/>');
    await put('properties/p2/sansextension', PNG);
    await put('properties/agency-logos/t1/logo.html', '<html>');
    await put('properties/agency-logos/t1/logo.png', PNG);
    await put('whatsapp/broadcast.html', '<html>');
    await put('whatsapp/2026/10/deep/page.html', '<html>');
    await put('whatsapp/2026/10/image.png', PNG);
    await put('properties/p1/ok.png', PNG);
    await put('properties/p1/ok.JPG', PNG);
    await put('properties/p1/ok.mp4', Buffer.from('0000001c66747970', 'hex'));
    await put('properties/p1/documents/titre.pdf', '%PDF-1.4');

    const found = await listSuspectFiles(root);
    expect(found.map(f => f.relativePath)).toEqual([
      'properties/agency-logos/t1/logo.html',
      'properties/p1/a.html',
      'properties/p1/b.svg',
      'properties/p2/sansextension',
      'whatsapp/2026/10/deep/page.html',
      'whatsapp/broadcast.html'
    ]);
    const bySansExt = found.find(f => f.relativePath.endsWith('sansextension'));
    expect(bySansExt).toMatchObject({ detectedKind: 'png', size: PNG.length });
    expect(found.find(f => f.relativePath.endsWith('a.html'))?.detectedKind).toBe('inconnu');
    expect(formatReport(found).at(-1)).toBe('Total : 6 fichier(s) suspect(s)');
  });

  it('ne modifie, ne supprime et ne déplace rien', async () => {
    await put('properties/p1/a.html', '<html>');
    await put('properties/p1/ok.png', PNG);
    const before = await snapshot();
    await listSuspectFiles(root);
    expect(await snapshot()).toEqual(before);
  });

  it('racine sans dossier properties : liste vide', async () => {
    expect(await listSuspectFiles(root)).toEqual([]);
  });
});

describe('readDirSafe', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reste silencieux sur un dossier absent (ENOENT)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await readDirSafe(path.join(root, 'absent'))).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('avertit sur une erreur autre que ENOENT et renvoie une liste vide', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(fs, 'readdir').mockRejectedValueOnce(Object.assign(new Error('refusé'), { code: 'EACCES' }));
    expect(await readDirSafe(root)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('EACCES');
  });
});
