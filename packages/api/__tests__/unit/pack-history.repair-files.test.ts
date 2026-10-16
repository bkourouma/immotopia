/**
 * Réparation des fichiers des agences de test déjà semées : une ligne dont le
 * fichier est absent ou hors du volume (`UPLOADS_DIR`) est réécrite sur le volume
 * puis son chemin mis à jour ; une ligne saine n'est pas touchée ; un second
 * passage répare 0 ligne. Base de données remplacée par un double en mémoire,
 * disque réel dans un dossier temporaire.
 */
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import PizZip from 'pizzip';

const envMock: { UPLOADS_DIR?: string } = {};
const rootMock = { dir: '' };

jest.mock('../../src/config/env', () => ({ env: envMock }));
jest.mock('../../src/utils/project-root', () => ({
  ...jest.requireActual('../../src/utils/project-root'),
  getProjectRoot: () => rootMock.dir
}));

import { getGeneratedDocumentsDir, getTemplatesWriteDir, isInsideDir } from '../../src/utils/assets-paths';
import {
  repairTenantFiles,
  repairedDocumentContent,
  repairedDocumentPath
} from '../../prisma/seeds/pack-history/repair-files';
import type { RentalDocumentRow, RepairDb, TemplateRow } from '../../prisma/seeds/pack-history/repair-files';

const T1 = 'tenant-1';
const T2 = 'tenant-2';
const OLD_ROOT = '/repo/assets/generated_documents';

let workDir: string;
let uploadsDir: string;
let shippedDir: string;

function docRow(overrides: Partial<RentalDocumentRow> & { id: string }): RentalDocumentRow {
  return {
    tenant_id: T1,
    type: 'LEASE_CONTRACT',
    document_number: 'BAIL-2026-0052',
    file_path: `${OLD_ROOT}/${T1}/LEASE_CONTRACT/2026/03/BAIL-2026-0052_LEASE_CONTRACT_abcd1234.docx`,
    title: 'Contrat de bail',
    description: null,
    issued_at: new Date(Date.UTC(2026, 2, 15)),
    created_at: new Date(Date.UTC(2026, 2, 15)),
    lease: { lease_number: 'LOC-0052' },
    ...overrides
  };
}

function templateRow(overrides: Partial<TemplateRow> & { id: string }): TemplateRow {
  return {
    tenant_id: T1,
    original_filename: 'contrat_bail_habitation.docx',
    stored_filename: 'LEASE_HABITATION_3_ACTIVE_0.docx',
    storage_path: `/repo/assets/modeles_documents/tenants/${T1}/LEASE_HABITATION_3_ACTIVE_0.docx`,
    file_size: 10,
    ...overrides
  };
}

/** Double en mémoire des deux modèles Prisma utilisés, filtré par agence comme le vrai. */
function makeDb(docs: RentalDocumentRow[], templates: TemplateRow[]) {
  const documentUpdates = jest.fn();
  const templateUpdates = jest.fn();
  const db = {
    rentalDocument: {
      findMany: jest.fn(async ({ where }: { where: { tenant_id: string } }) =>
        docs.filter(d => d.tenant_id === where.tenant_id && d.file_path !== null)
      ),
      updateMany: jest.fn(
        async ({ where, data }: { where: { id: string; tenant_id: string }; data: Record<string, unknown> }) => {
          documentUpdates(where, data);
          const row = docs.find(d => d.id === where.id && d.tenant_id === where.tenant_id);
          if (row) Object.assign(row, data);
          return { count: row ? 1 : 0 };
        }
      )
    },
    documentTemplate: {
      findMany: jest.fn(async ({ where }: { where: { tenant_id: string } }) =>
        templates.filter(t => t.tenant_id === where.tenant_id)
      ),
      updateMany: jest.fn(
        async ({ where, data }: { where: { id: string; tenant_id: string }; data: Record<string, unknown> }) => {
          templateUpdates(where, data);
          const row = templates.find(t => t.id === where.id && t.tenant_id === where.tenant_id);
          if (row) Object.assign(row, data);
          return { count: row ? 1 : 0 };
        }
      )
    }
  };
  return { db: db as unknown as RepairDb, documentUpdates, templateUpdates };
}

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'immotopia-repair-'));
  rootMock.dir = path.join(workDir, 'root');
  uploadsDir = path.join(workDir, 'uploads');
  envMock.UPLOADS_DIR = uploadsDir;
  shippedDir = path.join(rootMock.dir, 'assets', 'modeles_documents');
  await fs.mkdir(shippedDir, { recursive: true });
  await fs.writeFile(path.join(shippedDir, 'contrat_bail_habitation.docx'), Buffer.from('MODELE-BAIL'));
});

afterEach(async () => {
  delete envMock.UPLOADS_DIR;
  await fs.rm(workDir, { recursive: true, force: true });
});

describe('repairedDocumentPath', () => {
  it("garde l'arborescence de l'ancien chemin, ré-enracinée sur le volume", () => {
    const row = docRow({ id: 'doc-1' });
    expect(repairedDocumentPath(row)).toBe(
      path.join(
        uploadsDir,
        'generated_documents',
        T1,
        'LEASE_CONTRACT',
        '2026',
        '03',
        'BAIL-2026-0052_LEASE_CONTRACT_abcd1234.docx'
      )
    );
  });

  it('lit aussi un ancien chemin à barres obliques inverses', () => {
    const row = docRow({
      id: 'doc-2',
      file_path: `C:\\app\\assets\\generated_documents\\${T1}\\RENT_RECEIPT\\2026\\03\\RCU-1.docx`
    });
    expect(repairedDocumentPath(row)).toBe(
      path.join(uploadsDir, 'generated_documents', T1, 'RENT_RECEIPT', '2026', '03', 'RCU-1.docx')
    );
  });

  it("reconstruit le chemin (sans jamais sortir du volume) quand l'ancien est inexploitable", () => {
    const hostile = [
      '/repo/assets/generated_documents/../../etc/passwd',
      `/repo/assets/generated_documents/${T2}/LEASE_CONTRACT/2026/03/x.docx`,
      '/tmp/sans-dossier-attendu.docx'
    ];
    for (const file_path of hostile) {
      const target = repairedDocumentPath(docRow({ id: '12345678-aaaa', file_path }));
      expect(isInsideDir(target, getGeneratedDocumentsDir())).toBe(true);
      expect(target).toBe(
        path.join(
          uploadsDir,
          'generated_documents',
          T1,
          'LEASE_CONTRACT',
          '2026',
          '03',
          'BAIL-2026-0052_LEASE_CONTRACT_12345678.docx'
        )
      );
    }
  });
});

describe('repairedDocumentContent', () => {
  it('reprend numéro, date, bail et description de la ligne', () => {
    const { title, lines } = repairedDocumentContent(docRow({ id: 'd', description: 'Bail meublé' }));
    expect(title).toBe('Contrat de bail');
    expect(lines).toEqual(
      expect.arrayContaining([
        'Contrat de bail n° BAIL-2026-0052',
        "Date d'émission : 15/03/2026",
        'Bail : LOC-0052',
        'Bail meublé'
      ])
    );
  });
});

describe('repairTenantFiles — documents locatifs', () => {
  it('réécrit le fichier sur le volume, met à jour chemin et empreinte, puis ne fait plus rien', async () => {
    const row = docRow({ id: 'doc-1' });
    const { db, documentUpdates } = makeDb([row], []);

    const first = await repairTenantFiles(db, T1);

    expect(first.rentalDocuments).toMatchObject({ checked: 1, repaired: 1, healthy: 0, failed: 0 });
    // Le chemin stocké est celui que `getDocumentFile` accepte, et le fichier existe.
    expect(isInsideDir(row.file_path as string, getGeneratedDocumentsDir())).toBe(true);
    const buffer = await fs.readFile(row.file_path as string);
    const zip = new PizZip(buffer);
    expect(zip.file('word/document.xml')?.asText()).toContain('BAIL-2026-0052');
    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(documentUpdates.mock.calls[0][1]).toMatchObject({
      file_hash: createHash('sha256').update(buffer).digest('hex')
    });

    const second = await repairTenantFiles(db, T1);
    expect(second.rentalDocuments).toMatchObject({ checked: 1, repaired: 0, healthy: 1, failed: 0 });
    expect(documentUpdates).toHaveBeenCalledTimes(1);
  });

  it('ne touche pas une ligne saine (chemin sur le volume, fichier présent)', async () => {
    const healthyPath = path.join(uploadsDir, 'generated_documents', T1, 'LEASE_CONTRACT', '2026', '03', 'ok.docx');
    await fs.mkdir(path.dirname(healthyPath), { recursive: true });
    await fs.writeFile(healthyPath, 'CONTENU-ORIGINAL');
    const { db, documentUpdates } = makeDb([docRow({ id: 'ok', file_path: healthyPath })], []);

    const report = await repairTenantFiles(db, T1);

    expect(report.rentalDocuments).toMatchObject({ checked: 1, repaired: 0, healthy: 1 });
    expect(documentUpdates).not.toHaveBeenCalled();
    expect(await fs.readFile(healthyPath, 'utf8')).toBe('CONTENU-ORIGINAL');
  });

  it('répare un chemin du volume dont le fichier manque', async () => {
    const lost = path.join(uploadsDir, 'generated_documents', T1, 'LEASE_CONTRACT', '2026', '03', 'perdu.docx');
    const row = docRow({ id: 'lost', file_path: lost });
    const { db } = makeDb([row], []);

    const report = await repairTenantFiles(db, T1);

    expect(report.rentalDocuments.repaired).toBe(1);
    expect((await fs.stat(lost)).isFile()).toBe(true);
    expect(row.file_path).toBe(lost);
  });

  it("répare un chemin hors du volume même si un fichier s'y trouve (l'API ne le verrait pas)", async () => {
    const outside = path.join(
      workDir,
      'root',
      'assets',
      'generated_documents',
      T1,
      'LEASE_CONTRACT',
      '2026',
      '03',
      'x.docx'
    );
    await fs.mkdir(path.dirname(outside), { recursive: true });
    await fs.writeFile(outside, 'ANCIEN');
    const row = docRow({ id: 'outside', file_path: outside });
    const { db } = makeDb([row], []);

    const report = await repairTenantFiles(db, T1);

    expect(report.rentalDocuments.repaired).toBe(1);
    expect(isInsideDir(row.file_path as string, getGeneratedDocumentsDir())).toBe(true);
  });

  it("ne répare que l'agence demandée", async () => {
    const mine = docRow({ id: 'mine' });
    const other = docRow({
      id: 'other',
      tenant_id: T2,
      file_path: `${OLD_ROOT}/${T2}/LEASE_CONTRACT/2026/03/y.docx`,
      document_number: 'BAIL-AUTRE'
    });
    const { db } = makeDb([mine, other], []);

    await repairTenantFiles(db, T1);

    expect(isInsideDir(mine.file_path as string, getGeneratedDocumentsDir())).toBe(true);
    expect(other.file_path).toBe(`${OLD_ROOT}/${T2}/LEASE_CONTRACT/2026/03/y.docx`);
  });

  it("sans UPLOADS_DIR (développement) : l'ancien emplacement sous <racine>/assets est sain", async () => {
    delete envMock.UPLOADS_DIR;
    const legacy = path.join(
      rootMock.dir,
      'assets',
      'generated_documents',
      T1,
      'LEASE_CONTRACT',
      '2026',
      '03',
      'dev.docx'
    );
    await fs.mkdir(path.dirname(legacy), { recursive: true });
    await fs.writeFile(legacy, 'DEV');
    const { db } = makeDb([docRow({ id: 'dev', file_path: legacy })], []);

    const report = await repairTenantFiles(db, T1);

    expect(report.rentalDocuments).toMatchObject({ healthy: 1, repaired: 0 });
  });
});

describe("repairTenantFiles — modèles de l'agence", () => {
  it('copie le modèle livré sur le volume, met à jour storage_path, puis ne fait plus rien', async () => {
    const row = templateRow({ id: 'tpl-1' });
    const { db, templateUpdates } = makeDb([], [row]);

    const first = await repairTenantFiles(db, T1);

    const expected = path.join(getTemplatesWriteDir(), 'tenants', T1, 'LEASE_HABITATION_3_ACTIVE_0.docx');
    expect(first.templates).toMatchObject({ checked: 1, repaired: 1, healthy: 0, failed: 0 });
    expect(row.storage_path).toBe(expected);
    expect(row.file_size).toBe(Buffer.byteLength('MODELE-BAIL'));
    expect(await fs.readFile(expected, 'utf8')).toBe('MODELE-BAIL');
    // Les modèles livrés ne sont jamais modifiés.
    expect(await fs.readFile(path.join(shippedDir, 'contrat_bail_habitation.docx'), 'utf8')).toBe('MODELE-BAIL');

    const second = await repairTenantFiles(db, T1);
    expect(second.templates).toMatchObject({ checked: 1, repaired: 0, healthy: 1 });
    expect(templateUpdates).toHaveBeenCalledTimes(1);
  });

  it('modèle livré absent : échec compté par code, ligne intacte, les autres lignes sont réparées', async () => {
    const missing = templateRow({ id: 'tpl-missing', original_filename: 'inconnu.docx' });
    const fine = templateRow({ id: 'tpl-fine', stored_filename: 'LEASE_HABITATION_1_INACTIVE_1.docx' });
    const { db } = makeDb([], [missing, fine]);

    const report = await repairTenantFiles(db, T1);

    expect(report.templates).toMatchObject({ checked: 2, repaired: 1, failed: 1, failureCodes: { ENOENT: 1 } });
    expect(missing.storage_path).toContain('/repo/assets/');
    expect(isInsideDir(fine.storage_path, getTemplatesWriteDir())).toBe(true);
  });

  it('un nom de modèle venu de la base ne sort jamais du dossier des modèles livrés', async () => {
    await fs.writeFile(path.join(workDir, 'secret.txt'), 'SECRET');
    const row = templateRow({ id: 'tpl-evil', original_filename: '../../../secret.txt' });
    const { db } = makeDb([], [row]);

    const report = await repairTenantFiles(db, T1);

    expect(report.templates.failed).toBe(1);
    await expect(
      fs.stat(path.join(getTemplatesWriteDir(), 'tenants', T1, 'LEASE_HABITATION_3_ACTIVE_0.docx'))
    ).rejects.toThrow();
  });

  it('signale une agence de gestion locative sans aucun modèle propre (le seed normal les crée)', async () => {
    const withDocs = makeDb([docRow({ id: 'd1' })], []);
    expect((await repairTenantFiles(withDocs.db, T1)).withoutTemplates).toBe(true);

    const empty = makeDb([], []);
    expect((await repairTenantFiles(empty.db, T1)).withoutTemplates).toBe(false);

    const withTemplate = makeDb([docRow({ id: 'd2' })], [templateRow({ id: 't2' })]);
    expect((await repairTenantFiles(withTemplate.db, T1)).withoutTemplates).toBe(false);
  });
});

describe('repairTenantFiles — rien de sensible dans le compte rendu', () => {
  it('le rapport ne porte ni chemin, ni nom de fichier, ni contenu', async () => {
    const { db } = makeDb(
      [docRow({ id: 'doc-1', description: 'DONNEE-PRIVEE' })],
      [templateRow({ id: 'tpl-1' }), templateRow({ id: 'tpl-2', original_filename: 'absent.docx' })]
    );

    const report = JSON.stringify(await repairTenantFiles(db, T1));

    expect(report).not.toContain(uploadsDir);
    expect(report).not.toContain('/repo/');
    expect(report).not.toContain('.docx');
    expect(report).not.toContain('DONNEE-PRIVEE');
    expect(report).not.toContain('BAIL-2026-0052');
  });
});
