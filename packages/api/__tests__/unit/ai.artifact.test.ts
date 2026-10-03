/**
 * Étape 2 du plan V2 — outil `show_artifact` : schéma (limites, clés, HTML),
 * troncature, événement SSE `artifact`, et bout en bout avec le faux
 * fournisseur. Aucune base : les services et l'audit sont simulés.
 */
const mockPrisma = { auditLog: { findFirst: jest.fn(), create: jest.fn() } };
const mockListProperties = jest.fn();
const mockListLeases = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/property-service', () => ({
  listProperties: (...a: unknown[]) => mockListProperties(...a)
}));
jest.mock('../../src/services/rental-lease-service', () => ({ listLeases: (...a: unknown[]) => mockListLeases(...a) }));
jest.mock('../../src/services/rental-document-service', () => ({ listDocuments: jest.fn() }));
jest.mock('../../src/services/property-document-service', () => ({ getDocuments: jest.fn() }));
jest.mock('../../src/utils/property-tenant-guard', () => ({ getPropertyForTenant: jest.fn() }));
jest.mock('../../src/services/document-template-service', () => ({ resolveTemplate: jest.fn() }));
jest.mock('../../src/services/document-generation-service', () => ({ generateDocument: jest.fn() }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));

import {
  COPILOT_ARTIFACT_MAX_CHART_POINTS,
  COPILOT_ARTIFACT_MAX_COLUMNS,
  COPILOT_ARTIFACT_MAX_MARKDOWN_CHARS,
  COPILOT_ARTIFACT_MAX_ROWS,
  COPILOT_ARTIFACT_MAX_SERIES,
  type CopilotSseEvent,
  type CopilotToolContext
} from '../../src/lib/ai/contracts';
import { ForbiddenError } from '../../src/middleware/error-middleware';
import { runChat } from '../../src/lib/ai/orchestrator';
import { FakeProvider } from '../../src/lib/ai/providers';
import { buildSystemPrompt } from '../../src/lib/ai/system-prompt';
import { toolsForUser } from '../../src/lib/ai/tools/registry';
import { showArtifactInputSchema, showArtifactTool } from '../../src/lib/ai/tools/show-artifact';

const parse = (input: unknown) => showArtifactInputSchema.safeParse(input);
const issuesOf = (input: unknown): string[] => {
  const result = parse(input);
  return result.success ? [] : result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
};

const table = (overrides: Record<string, unknown> = {}) => ({
  kind: 'table',
  title: 'Biens',
  columns: [
    { key: 'ref', label: 'Référence' },
    { key: 'price', label: 'Prix', type: 'currency' }
  ],
  rows: [
    { ref: 'B-1', price: 100 },
    { ref: 'B-2', price: null }
  ],
  ...overrides
});
const chart = (overrides: Record<string, unknown> = {}) => ({
  kind: 'chart',
  title: 'Loyers',
  chartType: 'bar',
  xKey: 'month',
  series: [{ key: 'rent', label: 'Loyer' }],
  data: [
    { month: 'jan', rent: 10 },
    { month: 'fév', rent: 12 }
  ],
  ...overrides
});

describe('schéma de show_artifact', () => {
  it('accepte un tableau, un texte et un graphique valides', () => {
    expect(parse(table()).success).toBe(true);
    expect(parse({ kind: 'markdown', title: 'Synthèse', content: '## Titre\n\n- a < b' }).success).toBe(true);
    expect(parse(chart()).success).toBe(true);
  });

  it('refuse un id fourni par le modèle et toute clé inconnue (strict)', () => {
    expect(parse(table({ id: 'x' })).success).toBe(false);
    expect(parse(table({ tenantId: 't' })).success).toBe(false);
  });

  it('refuse un champ d’un autre type d’artefact et un champ requis manquant', () => {
    expect(issuesOf(table({ content: 'x' }))).toEqual([expect.stringContaining('content')]);
    expect(issuesOf({ kind: 'markdown', title: 'T' })).toEqual([expect.stringContaining('content')]);
    expect(issuesOf({ kind: 'table', title: 'T', rows: [] })).toEqual([expect.stringContaining('columns')]);
  });

  describe('limites', () => {
    it(`refuse plus de ${COPILOT_ARTIFACT_MAX_COLUMNS} colonnes`, () => {
      const columns = Array.from({ length: COPILOT_ARTIFACT_MAX_COLUMNS + 1 }, (_, i) => ({
        key: `c${i}`,
        label: `C${i}`
      }));
      const row = Object.fromEntries(columns.slice(0, COPILOT_ARTIFACT_MAX_COLUMNS).map(c => [c.key, 1]));
      expect(parse(table({ columns, rows: [{ ...row, c20: 1 }] })).success).toBe(false);
      expect(parse(table({ columns: columns.slice(0, COPILOT_ARTIFACT_MAX_COLUMNS), rows: [row] })).success).toBe(true);
    });

    it(`refuse un Markdown de plus de ${COPILOT_ARTIFACT_MAX_MARKDOWN_CHARS} caractères`, () => {
      const content = 'a'.repeat(COPILOT_ARTIFACT_MAX_MARKDOWN_CHARS);
      expect(parse({ kind: 'markdown', title: 'T', content }).success).toBe(true);
      expect(parse({ kind: 'markdown', title: 'T', content: `${content}a` }).success).toBe(false);
    });

    it(`refuse plus de ${COPILOT_ARTIFACT_MAX_CHART_POINTS} points et ${COPILOT_ARTIFACT_MAX_SERIES} séries`, () => {
      const data = Array.from({ length: COPILOT_ARTIFACT_MAX_CHART_POINTS + 1 }, (_, i) => ({
        month: `m${i}`,
        rent: i
      }));
      expect(parse(chart({ data })).success).toBe(false);
      expect(parse(chart({ data: data.slice(0, COPILOT_ARTIFACT_MAX_CHART_POINTS) })).success).toBe(true);
      const keys = Array.from({ length: COPILOT_ARTIFACT_MAX_SERIES + 1 }, (_, i) => `s${i}`);
      const wide = chart({
        series: keys.map(key => ({ key, label: key })),
        data: [{ month: 'jan', ...Object.fromEntries(keys.map(key => [key, 1])) }]
      });
      expect(parse(wide).success).toBe(false);
    });

    it('refuse un nombre non fini et une cellule trop longue', () => {
      expect(parse(table({ rows: [{ ref: 'a', price: Infinity }] })).success).toBe(false);
      expect(parse(table({ rows: [{ ref: 'a'.repeat(1001), price: 1 }] })).success).toBe(false);
    });
  });

  describe('clés', () => {
    it('refuse une colonne absente des lignes', () => {
      expect(issuesOf(table({ rows: [{ ref: 'B-1' }] }))).toEqual([expect.stringContaining('« price »')]);
    });
    it('refuse des clés de colonnes en double', () => {
      const columns = [
        { key: 'ref', label: 'A' },
        { key: 'ref', label: 'B' }
      ];
      expect(issuesOf(table({ columns, rows: [{ ref: 'x' }] }))).toEqual([expect.stringContaining('en double')]);
    });
    it('refuse xKey ou une série absents des données', () => {
      expect(issuesOf(chart({ xKey: 'absent' }))).toEqual([expect.stringContaining('« absent »')]);
      expect(issuesOf(chart({ series: [{ key: 'absent', label: 'A' }] }))).toEqual([
        expect.stringContaining('« absent »')
      ]);
    });
    it('refuse une série non numérique, un camembert à plusieurs séries et __proto__', () => {
      expect(parse(chart({ data: [{ month: 'jan', rent: 'beaucoup' }] })).success).toBe(false);
      const two = chart({
        chartType: 'pie',
        series: [
          { key: 'rent', label: 'A' },
          { key: 'cost', label: 'B' }
        ],
        data: [{ month: 'jan', rent: 1, cost: 2 }]
      });
      expect(parse(two).success).toBe(false);
      expect(parse(table({ columns: [{ key: '__proto__', label: 'x' }], rows: [{}] })).success).toBe(false);
    });
  });

  describe('HTML refusé', () => {
    it.each([
      ['titre', table({ title: '<b>Biens</b>' })],
      [
        'libellé',
        table({
          columns: [
            { key: 'ref', label: '<img src=x>' },
            { key: 'price', label: 'P' }
          ]
        })
      ],
      ['cellule', table({ rows: [{ ref: '<script>alert(1)</script>', price: 1 }] })],
      ['Markdown', { kind: 'markdown', title: 'T', content: 'texte <iframe src="x"></iframe>' }],
      ['commentaire HTML', { kind: 'markdown', title: 'T', content: '<!-- x -->' }],
      ['lien javascript', { kind: 'markdown', title: 'T', content: '[clic](javascript:alert(1))' }]
    ])('refuse du HTML dans %s', (_name, input) => {
      expect(parse(input).success).toBe(false);
    });
  });
});

const ctx = (permissions: string[] = ['PROPERTIES_VIEW']): CopilotToolContext => ({
  tenantId: 'tenant-a',
  userId: 'user-1',
  permissions: new Set(permissions),
  requestId: 'req-1',
  conversationId: 'conv-1',
  signal: new AbortController().signal,
  seenLeaseIds: new Set()
});

describe('outil show_artifact', () => {
  it('est en lecture, sur le socle CORE, et exige PROPERTIES_VIEW', async () => {
    expect(showArtifactTool.kind).toBe('read');
    expect(showArtifactTool.feature).toBe('CORE');
    expect(showArtifactTool.requiredPermission).toBe('PROPERTIES_VIEW');
    await expect(showArtifactTool.execute(parse(table()).data!, ctx([]))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('émet l’événement artifact avec un id serveur et ne renvoie au modèle que {shown,id,rows}', async () => {
    const result = await showArtifactTool.execute(parse(table()).data!, ctx());
    const event = result.uiEvent as Extract<CopilotSseEvent, { type: 'artifact' }>;
    expect(event.type).toBe('artifact');
    expect(event.artifact.kind).toBe('table');
    expect(event.artifact.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.modelResult).toEqual({ shown: true, id: event.artifact.id, rows: 2 });
  });

  it('génère un id différent à chaque appel', async () => {
    const a = await showArtifactTool.execute(parse(table()).data!, ctx());
    const b = await showArtifactTool.execute(parse(table()).data!, ctx());
    expect((a.modelResult as { id: string }).id).not.toBe((b.modelResult as { id: string }).id);
  });

  it(`tronque à ${COPILOT_ARTIFACT_MAX_ROWS} lignes avec truncated:true`, async () => {
    const rows = Array.from({ length: COPILOT_ARTIFACT_MAX_ROWS + 25 }, (_, i) => ({ ref: `B-${i}`, price: i }));
    const result = await showArtifactTool.execute(parse(table({ rows })).data!, ctx());
    const artifact = (result.uiEvent as { artifact: { rows: unknown[]; truncated?: boolean } }).artifact;
    expect(artifact.rows).toHaveLength(COPILOT_ARTIFACT_MAX_ROWS);
    expect(artifact.truncated).toBe(true);
    expect(result.modelResult.rows).toBe(COPILOT_ARTIFACT_MAX_ROWS);
  });

  it('ne pose pas truncated sous la limite, écarte les clés non déclarées et complète par null', async () => {
    const input = table({
      rows: [
        { ref: 'B-1', price: 5, secret: 'x' },
        { ref: 'B-2', price: 6 }
      ]
    });
    const result = await showArtifactTool.execute(parse(input).data!, ctx());
    const artifact = (result.uiEvent as { artifact: { rows: unknown[]; truncated?: boolean } }).artifact;
    expect(artifact.truncated).toBeUndefined();
    expect(artifact.rows).toEqual([
      { ref: 'B-1', price: 5 },
      { ref: 'B-2', price: 6 }
    ]);
    const partial = await showArtifactTool.execute(
      parse(table({ rows: [{ ref: 'B-1', price: 1 }, { ref: 'B-2' }] })).data!,
      ctx()
    );
    expect((partial.uiEvent as { artifact: { rows: unknown[] } }).artifact.rows[1]).toEqual({
      ref: 'B-2',
      price: null
    });
  });

  it('un graphique renvoie le nombre de points', async () => {
    const result = await showArtifactTool.execute(parse(chart()).data!, ctx());
    expect(result.modelResult.rows).toBe(2);
    expect((result.uiEvent as { artifact: { kind: string } }).artifact.kind).toBe('chart');
  });
});

describe('registre et invite', () => {
  it('show_artifact n’apparaît jamais sans PROPERTIES_VIEW', () => {
    expect(toolsForUser(new Set(['RENTAL_LEASES_VIEW'])).map(t => t.name)).not.toContain('show_artifact');
    expect(toolsForUser(new Set(['PROPERTIES_VIEW'])).map(t => t.name)).toContain('show_artifact');
  });

  it('l’invite décrit l’usage des artefacts seulement quand l’outil est offert', () => {
    const withTool = buildSystemPrompt('fr', toolsForUser(new Set(['PROPERTIES_VIEW'])));
    expect(withTool).toContain('show_artifact');
    expect(withTool).toMatch(/plus de 5 lignes/);
    expect(withTool).toMatch(/jamais de secret/);
    expect(withTool).toMatch(/Ne recopie pas dans le texte du chat/);
    const without = buildSystemPrompt('fr', []);
    expect(without).not.toContain('show_artifact');
  });
});

describe('de bout en bout avec le faux fournisseur', () => {
  const run = async (question: string, perms = ['PROPERTIES_VIEW', 'RENTAL_LEASES_VIEW']) => {
    const events: CopilotSseEvent[] = [];
    const permissions = new Set(perms);
    const text = await runChat({
      provider: new FakeProvider(),
      tenantId: 'tenant-a',
      userId: 'user-1',
      permissions,
      tools: toolsForUser(permissions),
      messages: [{ role: 'user', content: question }],
      pageContext: null,
      conversationId: 'conv-1',
      requestId: 'req-1',
      signal: new AbortController().signal,
      emit: event => events.push(event)
    });
    return { events, text };
  };

  const property = (i: number) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    internalReference: `BIEN-${i}`,
    title: `Villa <${i}>`,
    propertyType: 'VILLA',
    status: 'AVAILABLE',
    ownershipType: 'OWN',
    tenantId: 'tenant-a',
    locationZone: 'Cocody',
    address: 'Rue 1',
    price: 1000 * i,
    currency: 'FCFA',
    bedrooms: 2,
    surfaceArea: 60
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockListProperties.mockResolvedValue({ properties: [1, 2, 3].map(property), total: 3 });
  });

  it('« tableau » : search_properties puis show_artifact, événement artifact émis', async () => {
    const { events } = await run('Fais-moi un tableau des biens à Cocody');
    const artifact = events.find(event => event.type === 'artifact') as Extract<CopilotSseEvent, { type: 'artifact' }>;
    expect(artifact).toBeDefined();
    expect(artifact.artifact.kind).toBe('table');
    if (artifact.artifact.kind === 'table') {
      expect(artifact.artifact.rows).toHaveLength(3);
      expect(artifact.artifact.rows[0].title).toBe('Villa 1');
    }
    const order = events.map(event => (event.type === 'tool_status' ? `${event.tool}:${event.status}` : event.type));
    expect(order.indexOf('property_results')).toBeLessThan(order.indexOf('artifact'));
    expect(order).toContain('show_artifact:succeeded');
    expect(events[events.length - 1]).toEqual({ type: 'done', reason: 'end_turn' });
  });

  it('« graphique » : un graphique à barres sur les prix', async () => {
    const { events } = await run('Un graphique des prix des biens');
    const artifact = events.find(event => event.type === 'artifact') as Extract<CopilotSseEvent, { type: 'artifact' }>;
    expect(artifact.artifact).toMatchObject({ kind: 'chart', chartType: 'bar', xKey: 'reference' });
  });

  it('« synthèse » : un artefact Markdown sans recherche', async () => {
    const { events } = await run('Prépare une synthèse');
    expect(mockListProperties).not.toHaveBeenCalled();
    const artifact = events.find(event => event.type === 'artifact') as Extract<CopilotSseEvent, { type: 'artifact' }>;
    expect(artifact.artifact.kind).toBe('markdown');
  });

  it('sans la permission de l’outil, aucun artefact n’est émis', async () => {
    const { events } = await run('Un tableau des baux', ['RENTAL_LEASES_VIEW']);
    expect(events.some(event => event.type === 'artifact')).toBe(false);
  });
});
