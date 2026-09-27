/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lot S7 — construction de l'archive d'une agence, sans base.
 *
 * Deux agences simulees dans une petite base en memoire qui APPLIQUE les
 * filtres (egalite, relation imbriquee, `AND`/`OR`/`some`, curseur `gt`) :
 * l'archive de l'agence A ne doit contenir aucune ligne ni aucun fichier de B,
 * aucun champ sensible, et aucun fichier hors des racines autorisees.
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import JSZip from 'jszip';
import { Prisma } from '@prisma/client';
import { buildTenantArchive, type ExportDataSource } from '../../src/services/tenant-data-export/archive-builder';
import type { DmmfModel } from '../../src/services/tenant-data-export/model-registry';
import { csvCell, formatValue } from '../../src/services/tenant-data-export/csv';
import { parseFileReference } from '../../src/services/tenant-data-export/file-references';

const f = (name: string, type = 'String', extra: Record<string, unknown> = {}) => ({
  name,
  kind: 'scalar',
  type,
  isList: false,
  isRequired: true,
  ...extra
});
const id = f('id', 'String', { isId: true });
const rel = (name: string, type: string, isList = false) => ({
  name,
  kind: 'object',
  type,
  isList,
  isRequired: !isList
});

const MODELS: DmmfModel[] = [
  { name: 'Tenant', fields: [id, f('name'), f('slug'), f('logoUrl')] },
  {
    name: 'User',
    fields: [
      id,
      f('email'),
      f('fullName'),
      f('passwordHash'),
      f('googleId'),
      f('avatarUrl'),
      rel('memberships', 'Membership', true)
    ]
  },
  { name: 'Membership', fields: [id, f('tenantId'), f('userId')] },
  { name: 'Syndicate', fields: [id, f('tenantId'), f('name'), f('documentUrl'), f('apiSecret')] },
  {
    name: 'ChargeCall',
    fields: [
      id,
      f('syndicateId'),
      f('amount', 'Decimal'),
      f('dueDate', 'DateTime'),
      f('notes'),
      f('attachmentPath'),
      rel('syndicate', 'Syndicate')
    ]
  },
  { name: 'AuditLog', fields: [id, f('tenantId'), f('payload', 'Json')] }
];

function matches(row: any, where: any): boolean {
  for (const [key, expected] of Object.entries<any>(where)) {
    if (key === 'AND') {
      if (!expected.every((w: any) => matches(row, w))) return false;
      continue;
    }
    if (key === 'OR') {
      if (!expected.some((w: any) => matches(row, w))) return false;
      continue;
    }
    const cell = row[key];
    if (expected && typeof expected === 'object') {
      if ('gt' in expected) {
        if (!(cell > expected.gt)) return false;
      } else if ('some' in expected) {
        if (!(Array.isArray(cell) && cell.some((c: any) => matches(c, expected.some)))) return false;
      } else if (!cell || !matches(cell, expected)) return false;
      continue;
    }
    if (cell !== expected) return false;
  }
  return true;
}

function fakeDb(tables: Record<string, any[]>): { db: ExportDataSource; calls: any[] } {
  const calls: any[] = [];
  const db: ExportDataSource = {};
  for (const [delegate, rows] of Object.entries(tables)) {
    db[delegate] = {
      findMany: async (args: any) => {
        calls.push({ delegate, args });
        const found = rows
          .filter(r => matches(r, args.where))
          .sort((a, b) => (a.id < b.id ? -1 : 1))
          .slice(0, args.take);
        return found.map(r => Object.fromEntries(Object.keys(args.select).map(k => [k, r[k]])));
      }
    };
  }
  return { db, calls };
}

let root: string;

async function touch(relative: string, content = 'x'): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 's7-export-'));
  await touch('uploads/logos/a.png', 'logo-A');
  await touch('uploads/docs/a.pdf', 'pdf-A');
  await touch('uploads/docs/b.pdf', 'pdf-B');
  await touch('uploads/exports/tA/old.zip', 'old');
  await touch('generated/tA/bail/x.docx', 'docx-A');
  await touch('generated/tB/bail/y.docx', 'docx-B');
  await touch('secret.txt', 'secret');
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function tables() {
  const synA = { tenantId: 'tA' };
  const synB = { tenantId: 'tB' };
  return {
    tenant: [
      { id: 'tA', name: 'Agence A', slug: 'agence-a', logoUrl: '/uploads/logos/a.png' },
      { id: 'tB', name: 'Agence B', slug: 'agence-b', logoUrl: '/uploads/docs/b.pdf' }
    ],
    user: [
      {
        id: 'uA',
        email: 'a@x.ci',
        fullName: 'Awa',
        passwordHash: 'HASH-A',
        googleId: 'g',
        memberships: [{ tenantId: 'tA' }],
        clientProfiles: [],
        userRoles: []
      },
      {
        id: 'uB',
        email: 'b@x.ci',
        fullName: 'Bintou',
        passwordHash: 'HASH-B',
        memberships: [{ tenantId: 'tB' }],
        clientProfiles: [],
        userRoles: []
      }
    ],
    membership: [
      { id: 'mA', tenantId: 'tA', userId: 'uA' },
      { id: 'mB', tenantId: 'tB', userId: 'uB' }
    ],
    syndicate: [
      {
        id: 'sA1',
        tenantId: 'tA',
        name: 'Résidence "Les Palmiers"; bât. A',
        documentUrl: '/uploads/docs/a.pdf',
        apiSecret: 'S'
      },
      { id: 'sA2', tenantId: 'tA', name: '=HYPERLINK("x")', documentUrl: '/uploads/../secret.txt' },
      { id: 'sA3', tenantId: 'tA', name: 'A3', documentUrl: '/uploads/exports/tA/old.zip' },
      { id: 'sB1', tenantId: 'tB', name: 'Résidence B', documentUrl: '/uploads/docs/b.pdf' }
    ],
    chargeCall: [
      {
        id: 'c1',
        syndicateId: 'sA1',
        syndicate: synA,
        amount: new Prisma.Decimal('1500.50'),
        dueDate: new Date('2026-10-01T00:00:00Z'),
        notes: '/uploads/docs/b.pdf',
        attachmentPath: 'D:\\srv\\assets\\generated_documents\\tA\\bail\\x.docx'
      },
      {
        id: 'c2',
        syndicateId: 'sA1',
        syndicate: synA,
        amount: new Prisma.Decimal('-20'),
        dueDate: null,
        notes: null,
        attachmentPath: '/assets/generated_documents/tB/bail/y.docx'
      },
      {
        id: 'c3',
        syndicateId: 'sA1',
        syndicate: synA,
        amount: new Prisma.Decimal('0'),
        dueDate: null,
        notes: null,
        attachmentPath: '/uploads/docs/missing.pdf'
      },
      {
        id: 'c9',
        syndicateId: 'sB1',
        syndicate: synB,
        amount: new Prisma.Decimal('99'),
        dueDate: null,
        notes: null,
        attachmentPath: '/uploads/docs/b.pdf'
      }
    ],
    auditLog: [{ id: 'l1', tenantId: 'tA', payload: {} }]
  };
}

async function buildFor(tenantId: 'tA') {
  const { db, calls } = fakeDb(tables());
  const archivePath = path.join(root, 'uploads', 'exports', tenantId, 'e1.zip');
  const stagingDir = path.join(root, 'uploads', 'exports', tenantId, 'e1.staging');
  const result = await buildTenantArchive({
    db,
    tenant: { id: tenantId, name: 'Agence A', slug: 'agence-a' },
    exportId: 'e1',
    schemaVersion: '20260929160000_export_donnees_agence',
    roots: { uploads: [path.join(root, 'uploads')], generated: path.join(root, 'generated') },
    archivePath,
    stagingDir,
    models: MODELS,
    batchSize: 1,
    now: new Date('2026-09-29T16:00:00Z')
  });
  const zip = await JSZip.loadAsync(await fs.readFile(archivePath));
  return { result, zip, calls, stagingDir };
}

describe('Export agence — archive de l’agence A', () => {
  let built: Awaited<ReturnType<typeof buildFor>>;
  beforeAll(async () => {
    built = await buildFor('tA');
  });

  const text = (name: string) => {
    const entry = built.zip.file(name);
    if (!entry) throw new Error(`Entree absente de l'archive : ${name}`);
    return entry.async('string');
  };

  it('contient un CSV par modele exporte, le manifeste et le classeur, sans modele exclu', () => {
    const names = Object.keys(built.zip.files);
    for (const model of ['Tenant', 'User', 'Membership', 'Syndicate', 'ChargeCall']) {
      expect(names).toContain(`data/${model}.csv`);
    }
    expect(names).toContain('manifest.json');
    expect(names).toContain('recapitulatif.xlsx');
    expect(names).not.toContain('data/AuditLog.csv');
  });

  it("ne contient aucune ligne de l'agence B", async () => {
    const all = await Promise.all(
      Object.keys(built.zip.files)
        .filter(n => n.startsWith('data/'))
        .map(n => text(n))
    );
    const joined = all.join('\n');
    // `tB` figure legitimement dans un chemin saisi sur une ligne de A : on
    // cherche la valeur en tant que CELLULE, pas en sous-chaine.
    const cells = joined.split(/[;\r\n]/);
    for (const foreign of ['tB', 'uB', 'mB', 'sB1', 'c9', 'Bintou', 'Agence B']) expect(cells).not.toContain(foreign);
    expect(joined).toContain('sA1');
    expect(joined).toContain('c3');
  });

  it('borne chaque requete a l’agence (filtre direct, imbrique, comptes)', () => {
    const syndicateCall = built.calls.find(c => c.delegate === 'syndicate');
    expect(syndicateCall.args.where).toEqual({ tenantId: 'tA' });
    const chargeCall = built.calls.find(c => c.delegate === 'chargeCall');
    expect(chargeCall.args.where).toEqual({ syndicate: { tenantId: 'tA' } });
    const paged = built.calls.filter(c => c.delegate === 'chargeCall');
    expect(paged.length).toBeGreaterThan(1);
    expect(paged[1].args.where).toEqual({ AND: [{ syndicate: { tenantId: 'tA' } }, { id: { gt: 'c1' } }] });
    expect(built.calls.find(c => c.delegate === 'tenant').args.where).toEqual({ id: 'tA' });
  });

  it('ne sort aucun champ sensible (passwordHash, googleId, secret)', async () => {
    const users = await text('data/User.csv');
    expect(users).not.toMatch(/passwordHash|HASH-A|googleId/);
    expect(users.split('\r\n')[0]).toBe('\uFEFFid;email;fullName;avatarUrl');
    expect(await text('data/Syndicate.csv')).not.toContain('apiSecret');
  });

  it('met en forme dates, montants, guillemets et formules', async () => {
    const calls = await text('data/ChargeCall.csv');
    expect(calls.startsWith('\uFEFF')).toBe(true);
    expect(calls).toContain('1500.5');
    expect(calls).toContain('2026-10-01T00:00:00.000Z');
    expect(calls).toContain(';-20;');
    const syndicates = await text('data/Syndicate.csv');
    expect(syndicates).toContain('"Résidence ""Les Palmiers""; bât. A"');
    expect(syndicates).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it("joint seulement les fichiers de l'agence, sous les racines autorisees", async () => {
    const names = Object.keys(built.zip.files).filter(n => n.startsWith('fichiers/') && !built.zip.files[n].dir);
    expect(names.sort()).toEqual(
      [
        'fichiers/generated_documents/tA/bail/x.docx',
        'fichiers/uploads/docs/a.pdf',
        'fichiers/uploads/logos/a.png'
      ].sort()
    );
    expect(await text('fichiers/uploads/docs/a.pdf')).toBe('pdf-A');
  });

  it('compte fichiers manquants et refuses dans le manifeste et le resultat', async () => {
    expect(built.result).toMatchObject({ fileCount: 3, missingFileCount: 1, refusedFileCount: 3, unclassified: [] });
    const manifest = JSON.parse(await text('manifest.json'));
    expect(manifest.schemaVersion).toBe('20260929160000_export_donnees_agence');
    expect(manifest.totals).toMatchObject({ files: 3, missingFiles: 1, refusedFiles: 3 });
    expect(manifest.missingFiles).toEqual(['uploads:docs/missing.pdf']);
    expect(manifest.models.find((m: any) => m.model === 'ChargeCall').rows).toBe(3);
    expect(manifest.excludedModels.map((m: any) => m.model)).toContain('AuditLog');
    expect(JSON.stringify(manifest)).not.toContain(root);
  });

  it('supprime le dossier de travail', async () => {
    await expect(fs.stat(built.stagingDir)).rejects.toThrow();
  });
});

describe('Export agence — reconnaissance des references de fichier', () => {
  it.each([
    ['/uploads/docs/a.pdf', { kind: 'uploads', relative: 'docs/a.pdf' }],
    ['uploads/docs/a.pdf', { kind: 'uploads', relative: 'docs/a.pdf' }],
    ['C:\\app\\assets\\generated_documents\\t1\\x.docx', { kind: 'generated', relative: 't1/x.docx' }],
    ['https://cdn.example.com/uploads/a.png', null],
    ['Loyer de septembre', null]
  ])('%s', (value, expected) => {
    expect(parseFileReference(value)).toEqual(expected);
  });

  it('formate les valeurs simples', () => {
    expect(formatValue(null)).toBe('');
    expect(formatValue(true)).toBe('true');
    expect(formatValue(BigInt(12))).toBe('12');
    expect(formatValue({ a: 1 })).toBe('{"a":1}');
    expect(csvCell('-12')).toBe('-12');
    expect(csvCell('-x')).toBe("'-x");
  });
});
