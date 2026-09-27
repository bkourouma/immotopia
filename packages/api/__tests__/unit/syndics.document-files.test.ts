/**
 * Fichiers des documents de copropriété (lib/syndics/document-files.ts) :
 * écriture sous la racine de référence (`UPLOADS_DIR`), relecture de cette
 * racine puis de l'ancien dossier `packages/uploads`, où
 * `createDocumentHandler` écrivait avant ce lot.
 */

import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';

const mockRoot = path.join(os.tmpdir(), `syndic-document-files-${process.pid}`);
const mockReference = path.join(mockRoot, 'reference-uploads');
const mockProject = path.join(mockRoot, 'monorepo');

jest.mock('../../src/config/env', () => ({ env: { UPLOADS_DIR: mockReference } }));
jest.mock('../../src/utils/project-root', () => {
  const nodePath = jest.requireActual('path');
  return {
    getProjectRoot: () => mockProject,
    getUploadsRoot: (uploadsDir?: string | null) =>
      uploadsDir ? nodePath.resolve(uploadsDir) : nodePath.join(mockProject, 'uploads')
  };
});
jest.mock('../../src/utils/database', () => ({ prisma: {} }));

import {
  readSyndicateDocumentFile,
  syndicateDocumentFileUrl,
  syndicateDocumentReadRoots,
  syndicateDocumentsDir
} from '../../src/lib/syndics/document-files';

const SYNDIC = 'syn-1';
const legacyDir = path.join(mockProject, 'packages', 'uploads', 'syndics', SYNDIC, 'documents');

beforeAll(async () => {
  await fs.mkdir(syndicateDocumentsDir(SYNDIC), { recursive: true });
  await fs.mkdir(legacyDir, { recursive: true });
  await fs.writeFile(path.join(syndicateDocumentsDir(SYNDIC), 'neuf.pdf'), 'REFERENCE');
  await fs.writeFile(path.join(legacyDir, 'ancien.pdf'), 'ANCIEN');
  await fs.writeFile(path.join(syndicateDocumentsDir(SYNDIC), 'double.pdf'), 'REFERENCE');
  await fs.writeFile(path.join(legacyDir, 'double.pdf'), 'ANCIEN');
});

afterAll(async () => {
  await fs.rm(mockRoot, { recursive: true, force: true });
});

describe('documents de copropriété — dossiers', () => {
  it('écrit sous la racine de référence (UPLOADS_DIR), jamais sous packages/uploads', () => {
    expect(syndicateDocumentsDir(SYNDIC)).toBe(path.join(path.resolve(mockReference), 'syndics', SYNDIC, 'documents'));
    expect(syndicateDocumentsDir(SYNDIC)).not.toContain(path.join('packages', 'uploads'));
    expect(syndicateDocumentFileUrl(SYNDIC, 'f.pdf')).toBe(`/uploads/syndics/${SYNDIC}/documents/f.pdf`);
  });

  it("relit la racine de référence d'abord, puis l'ancien dossier", () => {
    expect(syndicateDocumentReadRoots()).toEqual([
      path.resolve(mockReference),
      path.join(mockProject, 'packages', 'uploads')
    ]);
  });

  it('lit un fichier récent (racine de référence)', async () => {
    const file = await readSyndicateDocumentFile({
      syndicateId: SYNDIC,
      title: 'Règlement',
      fileUrl: syndicateDocumentFileUrl(SYNDIC, 'neuf.pdf')
    });
    expect(file.buffer.toString()).toBe('REFERENCE');
    expect(file.mimeType).toBe('application/pdf');
    expect(file.fileName).toBe('Règlement.pdf');
  });

  it('lit encore un fichier déposé avant ce lot (packages/uploads), sans déplacement', async () => {
    const file = await readSyndicateDocumentFile({
      syndicateId: SYNDIC,
      title: 'PV',
      fileUrl: syndicateDocumentFileUrl(SYNDIC, 'ancien.pdf')
    });
    expect(file.buffer.toString()).toBe('ANCIEN');
  });

  it('préfère la racine de référence quand le fichier existe dans les deux', async () => {
    const file = await readSyndicateDocumentFile({
      syndicateId: SYNDIC,
      title: 'X',
      fileUrl: syndicateDocumentFileUrl(SYNDIC, 'double.pdf')
    });
    expect(file.buffer.toString()).toBe('REFERENCE');
  });

  it("refuse un lien externe, le fichier d'une autre copropriété et un chemin suspect", async () => {
    await expect(
      readSyndicateDocumentFile({ syndicateId: SYNDIC, title: 'X', fileUrl: 'https://example.com/a.pdf' })
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      readSyndicateDocumentFile({
        syndicateId: 'autre',
        title: 'X',
        fileUrl: syndicateDocumentFileUrl(SYNDIC, 'neuf.pdf')
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      readSyndicateDocumentFile({ syndicateId: SYNDIC, title: 'X', fileUrl: `/uploads/syndics/${SYNDIC}/documents/..` })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
