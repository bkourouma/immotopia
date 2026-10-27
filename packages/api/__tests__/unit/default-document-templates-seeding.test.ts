import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const mockPrisma = {
  user: { findFirst: jest.fn(), create: jest.fn() },
  documentTemplate: {
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn()
  }
};
const mockUpload = jest.fn();
let mockWriteDir = '';

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/document-template-service', () => ({
  uploadTemplate: (...args: unknown[]) => mockUpload(...args),
  extractPlaceholders: jest.fn().mockResolvedValue(['A'])
}));
jest.mock('../../src/utils/assets-paths', () => ({
  ...jest.requireActual('../../src/utils/assets-paths'),
  getTemplatesWriteDir: () => mockWriteDir
}));

import {
  decideSeedAction,
  MissingSuperAdminError,
  seedDefaultDocumentTemplates
} from '../../src/services/default-document-templates-seeding';

const global = (hash: string) => ({ tenant_id: null, is_default: true, file_hash_sha256: hash });
const insertOnly = { refresh: false, force: false };

describe('decideSeedAction', () => {
  it('cree quand aucun modele global par defaut', () => {
    expect(decideSeedAction(null, 'h', [], insertOnly)).toBe('CREATE');
    expect(decideSeedAction(null, 'h', [], { refresh: true, force: false })).toBe('CREATE');
  });

  it('ignore sans modifier un modele existant par defaut (insert-only)', () => {
    expect(decideSeedAction(global('h'), 'h', [], insertOnly)).toBe('SKIP_EXISTS');
    expect(decideSeedAction(global('ancien'), 'h', ['ancien'], insertOnly)).toBe('SKIP_EXISTS');
    // force sans refresh ne change rien
    expect(decideSeedAction(global('inconnu'), 'h', [], { refresh: false, force: true })).toBe('SKIP_EXISTS');
  });

  it('rafraichit seulement avec refresh', () => {
    const refresh = { refresh: true, force: false };
    expect(decideSeedAction(global('ancien'), 'h', ['ancien'], refresh)).toBe('REFRESH');
    expect(decideSeedAction(global('h'), 'h', [], refresh)).toBe('SKIP_UP_TO_DATE');
    expect(decideSeedAction(global('inconnu'), 'h', [], refresh)).toBe('SKIP_CUSTOM');
    expect(decideSeedAction(global('inconnu'), 'h', [], { refresh: true, force: true })).toBe('REFRESH');
  });
});

describe('seedDefaultDocumentTemplates', () => {
  const log = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockWriteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tpl-seed-'));
  });

  it('echoue sans SUPER_ADMIN, sans creer d utilisateur ni ecrire', async () => {
    mockPrisma.documentTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await expect(seedDefaultDocumentTemplates(insertOnly, log)).rejects.toBeInstanceOf(MissingSuperAdminError);

    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { globalRole: 'SUPER_ADMIN' }, select: { id: true } })
    );
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('cree les 4 modeles avec le plus ancien SUPER_ADMIN', async () => {
    mockPrisma.documentTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'admin-1' });
    mockUpload.mockImplementation(async () => ({ id: 'tpl' }));

    const report = await seedDefaultDocumentTemplates(insertOnly, log);

    expect(report.created).toHaveLength(4);
    expect(report.errors).toHaveLength(0);
    expect(mockUpload).toHaveBeenCalledTimes(4);
    expect(mockUpload.mock.calls[0][0]).toBeNull();
    expect(mockUpload.mock.calls[0][5]).toBe('admin-1');
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('ignore tout quand les modeles existent, sans recherche de createur', async () => {
    mockPrisma.documentTemplate.findFirst.mockResolvedValue({
      id: 'x',
      ...global('quelconque')
    });

    const report = await seedDefaultDocumentTemplates(insertOnly, log);

    expect(report.skipped).toHaveLength(4);
    expect(report.created).toHaveLength(0);
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockPrisma.documentTemplate.update).not.toHaveBeenCalled();
  });

  it('signale une erreur d ecriture et continue', async () => {
    mockPrisma.documentTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'admin-1' });
    mockUpload.mockRejectedValueOnce(new Error('disque plein')).mockResolvedValue({ id: 'tpl' });

    const report = await seedDefaultDocumentTemplates(insertOnly, log);

    expect(report.errors).toHaveLength(1);
    expect(report.created).toHaveLength(3);
  });
});
