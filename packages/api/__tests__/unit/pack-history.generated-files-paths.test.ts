/**
 * Chemins des fichiers écrits par le seed des agences de test : avec `UPLOADS_DIR`
 * (staging : conteneur `migrate` jetable + volume), les documents locatifs et les
 * modèles de l'agence doivent atterrir sur le volume, là où l'API les relit
 * (`getDocumentFile`, `resolveTemplatePath`) ; sans `UPLOADS_DIR` (développement),
 * l'ancien emplacement sous `<racine>/assets` est conservé. Aucune base de données.
 */
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

const envMock: { UPLOADS_DIR?: string } = {};
const rootMock = { dir: '' };

jest.mock('../../src/config/env', () => ({ env: envMock }));
jest.mock('../../src/utils/project-root', () => ({
  ...jest.requireActual('../../src/utils/project-root'),
  getProjectRoot: () => rootMock.dir
}));
// `seedDocumentTemplates` importe le service des modèles (donc la base) à l'usage.
jest.mock('../../src/services/document-template-service', () => ({
  extractPlaceholders: jest.fn().mockResolvedValue(['BAILLEUR_NOM'])
}));

import {
  getGeneratedDocumentDir,
  getGeneratedDocumentsDir,
  getShippedTemplatesDir,
  getTemplatesWriteDir,
  isInsideDir
} from '../../src/utils/assets-paths';
import { saveRentalDocx } from '../../prisma/seeds/pack-history/agence-locatif-files';
import { writeGeneratedDocx } from '../../prisma/seeds/pack-history/patrimoine-extras-files';
import { seedDocumentTemplates } from '../../prisma/seeds/pack-history/agence-commercial-docs';
import type { CommercialEnv } from '../../prisma/seeds/pack-history/agence-commercial-data';

const TENANT = 'tenant-test-3ans';
const ISSUED_AT = new Date(Date.UTC(2026, 2, 15, 12, 0, 0));
const SHIPPED_MODELS = [
  'contrat_bail_habitation.docx',
  'contrat_bail_commercial.docx',
  'Reçu_Loyer.docx',
  'Releve_Compte.docx'
];

let workDir: string;
let uploadsDir: string;

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'immotopia-seed-paths-'));
  rootMock.dir = path.join(workDir, 'root');
  uploadsDir = path.join(workDir, 'uploads');
  const shipped = path.join(rootMock.dir, 'assets', 'modeles_documents');
  await fs.mkdir(shipped, { recursive: true });
  for (const model of SHIPPED_MODELS) {
    await fs.writeFile(path.join(shipped, model), Buffer.from(`modele ${model}`));
  }
});

afterEach(async () => {
  delete envMock.UPLOADS_DIR;
  await fs.rm(workDir, { recursive: true, force: true });
});

describe('saveRentalDocx / writeGeneratedDocx', () => {
  it('avec UPLOADS_DIR : écrit sur le volume, dans un dossier que getDocumentFile accepte', async () => {
    envMock.UPLOADS_DIR = uploadsDir;

    const rental = await saveRentalDocx({
      tenantId: TENANT,
      typeDir: 'LEASE_CONTRACT',
      issuedAt: ISSUED_AT,
      number: 'BAIL-2026-0052',
      keyPart: 'abcdef123456',
      title: 'Contrat',
      lines: ['Ligne']
    });
    const extras = await writeGeneratedDocx(
      TENANT,
      'RENT_QUITTANCE',
      'QUI-2026-0001',
      'abcdef123456',
      new Date(2026, 2, 15),
      Buffer.from('docx')
    );

    const expectedDir = getGeneratedDocumentDir(TENANT, 'LEASE_CONTRACT', 2026, 3);
    expect(path.dirname(rental.filePath)).toBe(expectedDir);
    expect(expectedDir).toBe(path.join(uploadsDir, 'generated_documents', TENANT, 'LEASE_CONTRACT', '2026', '03'));
    expect(path.dirname(extras)).toBe(
      path.join(uploadsDir, 'generated_documents', TENANT, 'RENT_QUITTANCE', '2026', '03')
    );

    // Même test que `getDocumentFile` : sous le dossier des documents générés.
    expect(isInsideDir(rental.filePath, getGeneratedDocumentsDir())).toBe(true);
    expect(isInsideDir(extras, getGeneratedDocumentsDir())).toBe(true);
    // Rien n'est écrit sous la racine du dépôt (la couche jetable du conteneur).
    await expect(fs.stat(path.join(rootMock.dir, 'assets', 'generated_documents'))).rejects.toThrow();

    expect((await fs.readFile(rental.filePath)).subarray(0, 2).toString()).toBe('PK');
    expect(await fs.readFile(extras, 'utf8')).toBe('docx');
  });

  it("sans UPLOADS_DIR : garde l'ancien emplacement sous <racine>/assets/generated_documents", async () => {
    const rental = await saveRentalDocx({
      tenantId: TENANT,
      typeDir: 'RENT_RECEIPT',
      issuedAt: ISSUED_AT,
      number: 'RCU-1',
      keyPart: 'zzzzzzzz',
      title: 'Reçu',
      lines: []
    });
    const extras = await writeGeneratedDocx(
      TENANT,
      'RENT_RECEIPT',
      'RCU-2',
      'zzzzzzzz',
      new Date(2026, 2, 15),
      Buffer.from('x')
    );

    const legacy = path.join(rootMock.dir, 'assets', 'generated_documents', TENANT, 'RENT_RECEIPT', '2026', '03');
    expect(path.dirname(rental.filePath)).toBe(legacy);
    expect(path.dirname(extras)).toBe(legacy);
    expect(isInsideDir(rental.filePath, getGeneratedDocumentsDir())).toBe(true);
  });

  it("le nom du fichier est assaini et ne sort jamais de l'arborescence", async () => {
    envMock.UPLOADS_DIR = uploadsDir;
    const rental = await saveRentalDocx({
      tenantId: TENANT,
      typeDir: 'LEASE_CONTRACT',
      issuedAt: ISSUED_AT,
      number: '../../evil',
      keyPart: 'abcdef123456',
      title: 'x',
      lines: []
    });
    expect(isInsideDir(rental.filePath, getGeneratedDocumentsDir())).toBe(true);
    expect(path.basename(rental.filePath)).not.toContain('/');
  });
});

function fakeCommercialEnv(tenantId: string): { env: CommercialEnv; created: Array<Record<string, unknown>> } {
  const created: Array<Record<string, unknown>> = [];
  const prisma = {
    documentTemplate: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return data;
      })
    }
  };
  const env = {
    prisma,
    tenantId,
    adminUserId: 'admin-1',
    ctx: { end: new Date(Date.UTC(2026, 9, 1)) },
    rng: () => 0.5,
    log: jest.fn()
  } as unknown as CommercialEnv;
  return { env, created };
}

describe('seedDocumentTemplates', () => {
  it('avec UPLOADS_DIR : copie les modèles livrés sur le volume, storage_path compris', async () => {
    envMock.UPLOADS_DIR = uploadsDir;
    const { env, created } = fakeCommercialEnv(TENANT);

    await seedDocumentTemplates(env);

    expect(created).toHaveLength(5);
    const targetDir = path.join(getTemplatesWriteDir(), 'tenants', TENANT);
    expect(targetDir).toBe(path.join(uploadsDir, 'modeles_documents', 'tenants', TENANT));
    for (const row of created) {
      const storagePath = String(row.storage_path);
      expect(path.dirname(storagePath)).toBe(targetDir);
      expect(path.basename(storagePath)).toBe(row.stored_filename);
      expect((await fs.stat(storagePath)).isFile()).toBe(true);
    }
    // Les modèles livrés restent en lecture seule : rien n'y est écrit.
    await expect(fs.stat(path.join(getShippedTemplatesDir(), 'tenants'))).rejects.toThrow();
  });

  it("sans UPLOADS_DIR : garde l'ancien emplacement sous assets/modeles_documents/tenants", async () => {
    const { env, created } = fakeCommercialEnv(TENANT);

    await seedDocumentTemplates(env);

    const legacy = path.join(getShippedTemplatesDir(), 'tenants', TENANT);
    expect(created).toHaveLength(5);
    expect(path.dirname(String(created[0].storage_path))).toBe(legacy);
  });

  it('modèle livré absent : ignoré avec un message, sans créer de ligne ni de fichier', async () => {
    envMock.UPLOADS_DIR = uploadsDir;
    await fs.rm(path.join(getShippedTemplatesDir(), 'Reçu_Loyer.docx'));
    const { env, created } = fakeCommercialEnv(TENANT);

    await seedDocumentTemplates(env);

    expect(created).toHaveLength(4);
    expect(created.every(row => row.original_filename !== 'Reçu_Loyer.docx')).toBe(true);
  });
});
