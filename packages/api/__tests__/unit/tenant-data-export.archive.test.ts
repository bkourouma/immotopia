/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lot S7 — construction de l'archive d'une agence, sans base.
 *
 * Deux agences simulees dans une petite base en memoire qui APPLIQUE les
 * filtres (egalite, relation imbriquee, `AND`/`OR`/`some`, curseur `gt`) :
 * l'archive de l'agence A ne doit contenir aucune ligne ni aucun fichier de B,
 * aucun champ sensible, aucun fichier hors des dossiers prouvant l'agence, et
 * aucun chemin disque du serveur dans les CSV.
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import JSZip from 'jszip';
import { Prisma } from '@prisma/client';
import {
  InsufficientDiskSpaceError,
  buildTenantArchive,
  type ExportDataSource
} from '../../src/services/tenant-data-export/archive-builder';
import type { DmmfModel } from '../../src/services/tenant-data-export/model-registry';
import { csvCell, formatValue } from '../../src/services/tenant-data-export/csv';
import {
  FileReferenceCollector,
  parseFileReference,
  type FileRoots
} from '../../src/services/tenant-data-export/file-references';

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

/** Sous Windows, les noms dans l'archive sont normalises en minuscules. */
const n = (name: string) => (process.platform === 'win32' ? name.toLowerCase() : name);

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
      f('isActive', 'Boolean'),
      f('lastLoginAt', 'DateTime'),
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
  { name: 'Property', fields: [id, f('tenantId'), f('coverUrl'), f('photoPath')] },
  { name: 'RentalPenalty', fields: [id, f('tenantId'), f('justificationUrl')] },
  { name: 'RentalDocument', fields: [id, f('tenantId'), f('file_path')] },
  { name: 'PlatformInvoicePayment', fields: [id, f('tenantId'), f('proofPath')] },
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
let roots: FileRoots;

async function touch(relative: string, content = 'x'): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 's7-export-'));
  roots = {
    uploads: [path.join(root, 'uploads')],
    generated: path.join(root, 'generated'),
    templates: path.join(root, 'templates'),
    exports: path.join(root, 'uploads', 'exports')
  };
  await touch('uploads/properties/agency-logos/tA/logo.png', 'logo-A');
  await touch('uploads/properties/agency-logos/tB/logo.png', 'logo-B');
  await touch('uploads/syndics/sA1/documents/a.pdf', 'pdf-A');
  await touch('uploads/syndics/sB1/documents/b.pdf', 'pdf-B');
  await touch('uploads/properties/pA/photo.jpg', 'photo-A');
  await touch('uploads/rental/penalties/rpA/j.pdf', 'penalty-A');
  await touch('uploads/platform/invoice-payments/tA/p.pdf', 'proof-A');
  await touch('uploads/branding/tA/mandants/m1/logo-x.png', 'brand-A');
  // Lot 040 (B5-R9) : pieces jointes du stock de chantier.
  await touch('uploads/stock/tA/2026/photo-a.jpg', 'stock-A');
  await touch('uploads/stock/tB/2026/photo-b.jpg', 'stock-B');
  // Lot 041 (data-model §6) : photos de comptage par WhatsApp.
  await touch('uploads/stock-whatsapp/tA/2026/capture-a.jpg', 'capture-A');
  await touch('uploads/stock-whatsapp/tB/2026/capture-b.jpg', 'capture-B');
  await touch('uploads/maintenance/tA/t1/m.pdf', 'maint-A');
  await touch('uploads/docs/a.pdf', 'loose');
  await touch('uploads/exports/tA/old.zip', 'old');
  await touch('generated/tA/bail/x.docx', 'docx-A');
  await touch('generated/tB/bail/y.docx', 'docx-B');
  await touch('templates/tenants/tA/modele.docx', 'tpl-A');
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
      { id: 'tA', name: 'Agence A', slug: 'agence-a', logoUrl: '/uploads/properties/agency-logos/tA/logo.png' },
      { id: 'tB', name: 'Agence B', slug: 'agence-b', logoUrl: '/uploads/properties/agency-logos/tB/logo.png' }
    ],
    user: [
      {
        id: 'uA',
        email: 'a@x.ci',
        fullName: 'Awa',
        passwordHash: 'HASH-A',
        googleId: 'g',
        isActive: true,
        lastLoginAt: new Date(),
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
        documentUrl: '/uploads/syndics/sA1/documents/a.pdf',
        apiSecret: 'S'
      },
      { id: 'sA2', tenantId: 'tA', name: '=HYPERLINK("x")', documentUrl: '/uploads/../secret.txt' },
      { id: 'sA3', tenantId: 'tA', name: "-2+3+cmd|' /C calc'!A0", documentUrl: '/uploads/exports/tA/old.zip' },
      { id: 'sA4', tenantId: 'tA', name: '  =1', documentUrl: '/uploads/properties/agency-logos/tB/logo.png' },
      { id: 'sA5', tenantId: 'tA', name: '＝SUM(A1)', documentUrl: '/uploads/syndics/sB1/documents/b.pdf' },
      { id: 'sA6', tenantId: 'tA', name: 'A6', documentUrl: '/uploads/docs/a.pdf' },
      { id: 'sA7', tenantId: 'tA', name: 'A7', documentUrl: 'uploads/EXPORTS. /tA/old.zip' },
      { id: 'sA8', tenantId: 'tA', name: 'A8', documentUrl: 'file:///etc/passwd' },
      { id: 'sA9', tenantId: 'tA', name: 'A9', documentUrl: 'javascript:alert(1)' },
      { id: 'sB1', tenantId: 'tB', name: 'Résidence B', documentUrl: '/uploads/syndics/sB1/documents/b.pdf' }
    ],
    chargeCall: [
      {
        id: 'c1',
        syndicateId: 'sA1',
        syndicate: synA,
        amount: new Prisma.Decimal('1500.50'),
        dueDate: new Date('2026-10-01T00:00:00Z'),
        notes: '/uploads/syndics/sB1/documents/b.pdf',
        attachmentPath: null
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
        attachmentPath: '/uploads/syndics/sA1/documents/missing.pdf'
      },
      {
        id: 'c9',
        syndicateId: 'sB1',
        syndicate: synB,
        amount: new Prisma.Decimal('99'),
        dueDate: null,
        notes: null,
        attachmentPath: '/uploads/syndics/sB1/documents/b.pdf'
      }
    ],
    property: [
      // Deux graphies du meme fichier : il n'entre qu'une fois.
      {
        id: 'pA',
        tenantId: 'tA',
        coverUrl: '/uploads/properties/pA/photo.jpg',
        photoPath: 'uploads/properties/pA/photo.jpg'
      },
      { id: 'pB', tenantId: 'tB', coverUrl: null, photoPath: null }
    ],
    rentalPenalty: [{ id: 'rpA', tenantId: 'tA', justificationUrl: '/uploads/rental/penalties/rpA/j.pdf' }],
    rentalDocument: [
      { id: 'd1', tenantId: 'tA', file_path: 'D:\\srv\\immotopia\\assets\\generated_documents\\tA\\bail\\x.docx' },
      { id: 'd2', tenantId: 'tA', file_path: 'C:\\autre\\disque\\x.docx' }
    ],
    platformInvoicePayment: [{ id: 'pp1', tenantId: 'tA', proofPath: 'platform/invoice-payments/tA/p.pdf' }],
    auditLog: [{ id: 'l1', tenantId: 'tA', payload: {} }]
  };
}

function inputFor(overrides: Record<string, unknown> = {}) {
  const { db, calls } = fakeDb(tables());
  const exportId = (overrides.exportId as string) ?? 'e1';
  return {
    calls,
    input: {
      db,
      tenant: { id: 'tA', name: 'Agence A', slug: 'agence-a' },
      exportId,
      schemaVersion: '20260929160000_export_donnees_agence',
      roots,
      archivePath: path.join(root, 'uploads', 'exports', 'tA', `${exportId}.zip`),
      stagingDir: path.join(root, 'uploads', 'exports', 'tA', `${exportId}.staging`),
      models: MODELS,
      batchSize: 1,
      now: new Date('2026-09-29T16:00:00Z'),
      freeSpaceBytes: async () => 10 ** 12,
      ...overrides
    }
  };
}

async function buildFor() {
  const { input, calls } = inputFor();
  const result = await buildTenantArchive(input as any);
  const zip = await JSZip.loadAsync(await fs.readFile(input.archivePath));
  return { result, zip, calls, stagingDir: input.stagingDir };
}

describe('Export agence — archive de l’agence A', () => {
  let built: Awaited<ReturnType<typeof buildFor>>;
  beforeAll(async () => {
    built = await buildFor();
  });

  const text = (name: string) => {
    const entry = built.zip.file(name);
    if (!entry) throw new Error(`Entree absente de l'archive : ${name}`);
    return entry.async('string');
  };

  it('contient un CSV par modele exporte, le manifeste et le classeur, sans modele exclu', () => {
    const names = Object.keys(built.zip.files);
    for (const model of ['Tenant', 'User', 'Membership', 'Syndicate', 'ChargeCall', 'RentalDocument']) {
      expect(names).toContain(`data/${model}.csv`);
    }
    expect(names).toContain('manifest.json');
    expect(names).toContain('recapitulatif.xlsx');
    expect(names).not.toContain('data/AuditLog.csv');
  });

  it("ne contient aucune ligne de l'agence B", async () => {
    const all = await Promise.all(
      Object.keys(built.zip.files)
        .filter(k => k.startsWith('data/'))
        .map(k => text(k))
    );
    const cells = all.join('\n').split(/[;\r\n]/);
    for (const foreign of ['tB', 'uB', 'mB', 'sB1', 'c9', 'pB', 'Bintou', 'Agence B'])
      expect(cells).not.toContain(foreign);
    expect(cells).toContain('sA1');
  });

  it('borne chaque requete a l’agence (filtre direct, imbrique, comptes)', () => {
    expect(built.calls.find(c => c.delegate === 'syndicate').args.where).toEqual({ tenantId: 'tA' });
    const charge = built.calls.filter(c => c.delegate === 'chargeCall');
    expect(charge[0].args.where).toEqual({ syndicate: { tenantId: 'tA' } });
    expect(charge[1].args.where).toEqual({ AND: [{ syndicate: { tenantId: 'tA' } }, { id: { gt: 'c1' } }] });
    expect(built.calls.find(c => c.delegate === 'tenant').args.where).toEqual({ id: 'tA' });
  });

  it('ne sort aucun champ sensible ni statut global du compte', async () => {
    const users = await text('data/User.csv');
    expect(users).not.toMatch(/passwordHash|HASH-A|googleId|isActive|lastLoginAt/);
    expect(await text('data/Syndicate.csv')).not.toContain('apiSecret');
  });

  it('neutralise les formules, y compris apres des espaces et en pleine chasse', async () => {
    const syndicates = await text('data/Syndicate.csv');
    expect(syndicates).toContain(`"'=HYPERLINK(""x"")"`);
    expect(syndicates).toContain(`'-2+3+cmd|' /C calc'!A0`);
    expect(syndicates).toContain(`'  =1`);
    expect(syndicates).toContain(`'＝SUM(A1)`);
    const calls = await text('data/ChargeCall.csv');
    expect(calls).toContain(';-20;');
    expect(calls).toContain('1500.5');
  });

  it("joint seulement les fichiers dont le dossier prouve l'agence, une seule fois chacun", async () => {
    const names = Object.keys(built.zip.files).filter(k => k.startsWith('fichiers/') && !built.zip.files[k].dir);
    expect(names.sort()).toEqual(
      [
        'fichiers/uploads/properties/agency-logos/tA/logo.png',
        'fichiers/uploads/syndics/sA1/documents/a.pdf',
        'fichiers/uploads/properties/pA/photo.jpg',
        'fichiers/uploads/rental/penalties/rpA/j.pdf',
        'fichiers/uploads/platform/invoice-payments/tA/p.pdf',
        'fichiers/generated_documents/tA/bail/x.docx'
      ]
        .map(n)
        .sort()
    );
  });

  it('ne laisse aucun chemin disque du serveur dans les CSV', async () => {
    const documents = await text('data/RentalDocument.csv');
    expect(documents).not.toMatch(/[A-Z]:\\/);
    expect(documents).toContain(`d1;tA;${n('fichiers/generated_documents/tA/bail/x.docx')}`);
    expect(documents).toContain('d2;tA;\r\n');
  });

  it('compte fichiers manquants et refuses ; les schemas et textes libres sont ignores', async () => {
    expect(built.result).toMatchObject({ fileCount: 6, missingFileCount: 1, refusedFileCount: 7, unclassified: [] });
    const manifest = JSON.parse(await text('manifest.json'));
    expect(manifest.totals).toMatchObject({ files: 6, missingFiles: 1, refusedFiles: 7 });
    expect(manifest.missingFiles).toEqual(['uploads:syndics/sA1/documents/missing.pdf']);
    expect(manifest.refusedFiles).toEqual(
      expect.arrayContaining([
        'uploads:../secret.txt',
        'uploads:exports/tA/old.zip',
        'uploads:properties/agency-logos/tB/logo.png',
        'uploads:syndics/sB1/documents/b.pdf',
        'uploads:docs/a.pdf',
        'generated:tB/bail/y.docx'
      ])
    );
    expect(JSON.stringify(manifest)).not.toContain(root);
    expect(JSON.stringify(manifest)).not.toContain('passwd');
  });

  it('supprime le dossier de travail', async () => {
    await expect(fs.stat(built.stagingDir)).rejects.toThrow();
  });
});

describe('Export agence — espace disque', () => {
  it("echoue proprement s'il manque deux fois la taille des fichiers", async () => {
    const { input } = inputFor({ exportId: 'e2', freeSpaceBytes: async () => 10 });
    await expect(buildTenantArchive(input as any)).rejects.toBeInstanceOf(InsufficientDiskSpaceError);
    await expect(fs.stat(input.archivePath)).rejects.toThrow();
    await expect(fs.stat(input.stagingDir)).rejects.toThrow();
  });
});

describe('Export agence — collecteur de fichiers', () => {
  const owned = () => ({ Property: new Set(['pA']), Syndicate: new Set(['sA1']), RentalPenalty: new Set(['rpA']) });

  it('refuse au-dela du plafond de fichiers, avec compte', async () => {
    const collector = new FileReferenceCollector('tA', roots, owned(), { maxFiles: 1, maxTotalBytes: 10 ** 9 });
    await collector.inspectField('fileUrl', '/uploads/syndics/sA1/documents/a.pdf');
    await collector.inspectField('fileUrl', '/uploads/properties/pA/photo.jpg');
    expect(collector.files.size).toBe(1);
    expect(collector.refusedCount).toBe(1);
  });

  it('refuse au-dela du plafond d’octets cumules', async () => {
    const collector = new FileReferenceCollector('tA', roots, owned(), { maxFiles: 10, maxTotalBytes: 6 });
    await collector.inspectField('fileUrl', '/uploads/syndics/sA1/documents/a.pdf');
    await collector.inspectField('fileUrl', '/uploads/properties/pA/photo.jpg');
    expect(collector.files.size).toBe(1);
    expect(collector.refusedCount).toBe(1);
  });

  it('ne sert jamais un fichier sous la racine des exports, meme resolu ailleurs', async () => {
    const collector = new FileReferenceCollector(
      'tA',
      { ...roots, exports: path.join(root, 'uploads', 'maintenance') },
      owned()
    );
    await collector.inspectField('fileUrl', '/uploads/maintenance/tA/t1/m.pdf');
    expect(collector.files.size).toBe(0);
    expect(collector.refusedCount).toBe(1);
  });

  it.each([
    ['maintenance/tA/t1/m.pdf', true],
    ['maintenance/tB/t1/m.pdf', false],
    ['portal/payments/tA/p.pdf', true],
    ['lease-inspections/tB/i1/p.jpg', false],
    ['whatsapp/group-broadcast/tA/i.jpg', true],
    ['properties/agency-logos/tA/l.png', true],
    ['properties/agency-logos/tB/l.png', false],
    ['platform/invoice-payments/tB/p.pdf', false],
    ['branding/tA/mandants/m1/logo-x.png', true],
    ['branding/tA/syndics/s1/signature-x.png', true],
    ['branding/tA/agence/cachet-x.png', true],
    ['branding/tB/mandants/m1/logo-x.png', false],
    ['branding/tA', false],
    ['stock/tA/2026/photo-a.jpg', true],
    ['stock/tB/2026/photo-b.jpg', false],
    ['stock/tA', false],
    ['stock-whatsapp/tA/2026/capture-a.jpg', true],
    ['stock-whatsapp/tB/2026/capture-b.jpg', false],
    ['stock-whatsapp/tA', false],
    ['properties/pA/photo.jpg', true],
    ['properties/pB/photo.jpg', false],
    ['syndics/sA1/documents/a.pdf', true],
    ['syndics/sB1/documents/b.pdf', false],
    ['rental/penalties/rpA/j.pdf', true],
    ['rental/penalties/rpB/j.pdf', false],
    ['maintenance/tA', false],
    ['docs/a.pdf', false],
    ['Exports/tA/x.zip', false]
  ])('regle de dossier uploads/%s → %s', (relative, allowed) => {
    const collector = new FileReferenceCollector('tA', roots, owned());
    expect(collector.allowedForTenant({ kind: 'uploads', relative, absolute: false })).toBe(allowed);
  });

  it('joint une image de marque presente et compte celle absente comme manquante', async () => {
    const collector = new FileReferenceCollector('tA', roots, owned());
    await collector.inspectField('logoPath', 'branding/tA/mandants/m1/logo-x.png');
    await collector.inspectField('signaturePath', 'branding/tA/mandants/m1/signature-absente.png');
    expect(collector.files.size).toBe(1);
    expect(collector.missingCount).toBe(1);
    expect([...collector.files.keys()]).toEqual([n('fichiers/uploads/branding/tA/mandants/m1/logo-x.png')]);
  });

  it("joint la piece jointe de stock de l'agence et refuse celle d'une autre agence (lot 040, B5-R9)", async () => {
    const collector = new FileReferenceCollector('tA', roots, owned());
    await collector.inspectField('fileUrl', '/uploads/stock/tA/2026/photo-a.jpg');
    await collector.inspectField('fileUrl', '/uploads/stock/tB/2026/photo-b.jpg');
    expect([...collector.files.keys()]).toEqual([n('fichiers/uploads/stock/tA/2026/photo-a.jpg')]);
    expect(collector.refusedCount).toBe(1);
  });

  it("joint la photo de comptage WhatsApp de l'agence et refuse celle d'une autre agence (lot 041)", async () => {
    const collector = new FileReferenceCollector('tA', roots, owned());
    await collector.inspectField('fileUrl', '/uploads/stock-whatsapp/tA/2026/capture-a.jpg');
    await collector.inspectField('fileUrl', '/uploads/stock-whatsapp/tB/2026/capture-b.jpg');
    expect([...collector.files.keys()]).toEqual([n('fichiers/uploads/stock-whatsapp/tA/2026/capture-a.jpg')]);
    expect(collector.refusedCount).toBe(1);
  });

  it('refuse une image de marque dont le dossier appartient a une autre agence', async () => {
    const collector = new FileReferenceCollector('tA', roots, owned());
    await collector.inspectField('logoPath', 'branding/tB/mandants/m1/logo-x.png');
    expect(collector.files.size).toBe(0);
    expect(collector.refusedCount).toBe(1);
  });

  it('regles generated_documents et modeles', () => {
    const collector = new FileReferenceCollector('tA', roots, owned());
    expect(collector.allowedForTenant({ kind: 'generated', relative: 'tA/bail/x.docx', absolute: false })).toBe(true);
    expect(collector.allowedForTenant({ kind: 'generated', relative: 'tB/bail/x.docx', absolute: false })).toBe(false);
    expect(collector.allowedForTenant({ kind: 'templates', relative: 'tenants/tA/m.docx', absolute: true })).toBe(true);
    expect(collector.allowedForTenant({ kind: 'templates', relative: 'default/m.docx', absolute: true })).toBe(false);
  });
});

describe('Export agence — reconnaissance des references de fichier', () => {
  it.each([
    ['/uploads/docs/a.pdf', { kind: 'uploads', relative: 'docs/a.pdf', absolute: false }],
    ['uploads/docs/a.pdf', { kind: 'uploads', relative: 'docs/a.pdf', absolute: false }],
    ['C:\\app\\assets\\generated_documents\\t1\\x.docx', { kind: 'generated', relative: 't1/x.docx', absolute: true }],
    [
      '/srv/app/assets/modeles_documents/tenants/t1/m.docx',
      { kind: 'templates', relative: 'tenants/t1/m.docx', absolute: true }
    ],
    [
      'platform/invoice-payments/t1/p.pdf',
      { kind: 'uploads', relative: 'platform/invoice-payments/t1/p.pdf', absolute: false }
    ],
    [
      'branding/t1/mandants/m1/logo-x.png',
      { kind: 'uploads', relative: 'branding/t1/mandants/m1/logo-x.png', absolute: false }
    ],
    ['https://cdn.example.com/uploads/a.png', null],
    ['file:///srv/uploads/maintenance/t1/x.pdf', null],
    ['file:/srv/uploads/a.pdf', null],
    ['javascript:alert(1)//uploads/a', null],
    ['data:text/html,uploads/a', null],
    ['Loyer de septembre', null]
  ])('%s', (value, expected) => {
    expect(parseFileReference(value)).toEqual(expected);
  });

  it('formate les valeurs simples', () => {
    expect(formatValue(null)).toBe('');
    expect(formatValue(true)).toBe('true');
    expect(formatValue(BigInt(12))).toBe('12');
    expect(formatValue({ a: 1 })).toBe('{"a":1}');
    expect(csvCell('-x')).toBe("'-x");
    expect(csvCell('\tcmd')).toBe("'\tcmd");
    expect(csvCell(' @SUM(1)')).toBe("' @SUM(1)");
    expect(csvCell('Texte normal')).toBe('Texte normal');
  });
});
