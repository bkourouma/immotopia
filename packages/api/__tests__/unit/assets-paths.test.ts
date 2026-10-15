import * as path from 'path';

const envMock: { UPLOADS_DIR?: string } = {};
jest.mock('../../src/config/env', () => ({ env: envMock }));

import {
  getGeneratedDocumentsDir,
  getLegacyGeneratedDocumentsDir,
  getShippedTemplatesDir,
  getTemplatesWriteDir,
  isInsideDir
} from '../../src/utils/assets-paths';

describe('assets-paths', () => {
  it('sans UPLOADS_DIR : ancien emplacement sous <racine>/assets', () => {
    delete envMock.UPLOADS_DIR;
    expect(getGeneratedDocumentsDir()).toBe(getLegacyGeneratedDocumentsDir());
    expect(getTemplatesWriteDir()).toBe(getShippedTemplatesDir());
    expect(getShippedTemplatesDir().endsWith(path.join('assets', 'modeles_documents'))).toBe(true);
  });

  it('avec UPLOADS_DIR : écriture sur le volume, modèles livrés inchangés', () => {
    envMock.UPLOADS_DIR = path.resolve('/data/uploads');
    expect(getGeneratedDocumentsDir()).toBe(path.join(path.resolve('/data/uploads'), 'generated_documents'));
    expect(getTemplatesWriteDir()).toBe(path.join(path.resolve('/data/uploads'), 'modeles_documents'));
    expect(getShippedTemplatesDir()).not.toContain('uploads');
  });

  it('isInsideDir refuse la sortie de dossier', () => {
    const base = path.resolve('/a/b');
    expect(isInsideDir(path.join(base, 'x', 'y.docx'), base)).toBe(true);
    expect(isInsideDir(path.resolve('/a/b2/x'), base)).toBe(false);
    expect(isInsideDir(path.join(base, '..', 'c'), base)).toBe(false);
  });
});
