/**
 * BUG-089 — ImmoCopilot par pack d'abonnement : la liste des outils, le prompt
 * système et le texte d'accueil du faux fournisseur ne citent que les
 * fonctionnalités possédées ; un appel d'outil hors pack est refusé.
 */
const mockPrisma = { auditLog: { findFirst: jest.fn(), create: jest.fn() } };
const mockLogAudit = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/property-service', () => ({ listProperties: jest.fn() }));
jest.mock('../../src/services/rental-lease-service', () => ({ listLeases: jest.fn() }));
jest.mock('../../src/services/rental-document-service', () => ({ listDocuments: jest.fn() }));
jest.mock('../../src/services/property-document-service', () => ({ getDocuments: jest.fn() }));
jest.mock('../../src/utils/property-tenant-guard', () => ({ getPropertyForTenant: jest.fn() }));
jest.mock('../../src/services/document-template-service', () => ({ resolveTemplate: jest.fn() }));
jest.mock('../../src/services/document-generation-service', () => ({ generateDocument: jest.fn() }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: (...a: unknown[]) => mockLogAudit(...a) }));

import type { CopilotSseEvent, LlmMessage } from '../../src/lib/ai/contracts';
import { runChat } from '../../src/lib/ai/orchestrator';
import { FakeProvider } from '../../src/lib/ai/providers';
import { buildSystemPrompt } from '../../src/lib/ai/system-prompt';
import { toolsForUser, type ToolFeature } from '../../src/lib/ai/tools/registry';
import { evaluateFeatureAccess } from '../../src/lib/subscription/feature-access';
import type { ModuleKeyCode } from '../../src/lib/subscription/catalog';

const ALL_PERMS = ['PROPERTIES_VIEW', 'RENTAL_LEASES_VIEW', 'RENTAL_DOCUMENTS_VIEW', 'RENTAL_DOCUMENTS_GENERATE'];
const TOOL_FEATURES: ToolFeature[] = ['CORE', 'RENTAL'];

type Access = 'FULL' | 'READ_ONLY' | 'NONE';
const PACKS: Record<string, ModuleKeyCode[]> = {
  AGENCE: ['MODULE_AGENCY'],
  SYNDIC: ['MODULE_SYNDIC'],
  PROMOTEUR: ['MODULE_PROMOTER'],
  PATRIMOINE: ['MODULE_PATRIMOINE'],
  INTEGRE: ['MODULE_AGENCY', 'MODULE_SYNDIC', 'MODULE_PROMOTER', 'MODULE_PATRIMOINE']
};

function packView(modules: ModuleKeyCode[], readOnly = false) {
  const moduleAccess = Object.fromEntries(
    (['MODULE_AGENCY', 'MODULE_SYNDIC', 'MODULE_PROMOTER', 'MODULE_PATRIMOINE'] as ModuleKeyCode[]).map(key => [
      key,
      (modules.includes(key) ? 'FULL' : 'NONE') as Access
    ])
  );
  return { moduleAccess, readOnly } as Parameters<typeof evaluateFeatureAccess>[0];
}

function toolsOfPack(modules: ModuleKeyCode[], readOnly = false) {
  const view = packView(modules, readOnly);
  const allowed = (write: boolean) =>
    new Set(TOOL_FEATURES.filter(feature => evaluateFeatureAccess(view, feature, write).allowed));
  const read = allowed(false);
  const write = allowed(true);
  return toolsForUser(ALL_PERMS, read).filter(tool => tool.kind !== 'proposal' || write.has(tool.feature));
}

const RENTAL_TOOLS = [
  'search_leases',
  'list_lease_documents',
  'propose_rental_document',
  'lease_portfolio',
  'prepare_lease_expiry_alert'
];
const CORE_TOOLS = [
  'search_properties',
  'list_property_documents',
  'show_artifact',
  'property_portfolio',
  'chart_analysis',
  'pivot_analysis',
  'show_indicators',
  'compose_report',
  'list_capabilities',
  'call_read',
  'plan_write',
  'propose_follow_up'
];

describe('ImmoCopilot — outils et prompt par pack', () => {
  it('exige les droits des trois jeux de données pour le bilan locatif complet', () => {
    const permissions = ['RENTAL_INSTALLMENTS_VIEW', 'RENTAL_PAYMENTS_VIEW', 'RENTAL_LEASES_VIEW', 'PROPERTIES_VIEW'];
    expect(toolsForUser(permissions, ['RENTAL']).map(tool => tool.name)).toContain('rental_monthly_review');
    for (const missing of permissions) {
      const names = toolsForUser(
        permissions.filter(permission => permission !== missing),
        ['RENTAL']
      ).map(tool => tool.name);
      expect(names).not.toContain('rental_monthly_review');
    }
    expect(toolsForUser(['RENTAL_INSTALLMENTS_VIEW'], ['RENTAL']).map(tool => tool.name)).toContain(
      'rental_due_comparison'
    );
  });
  it('garde les relevés et les reversements séparés selon les permissions locatives', () => {
    expect(toolsForUser(['OWNER_STATEMENTS_VIEW'], ['RENTAL']).map(tool => tool.name)).toEqual(['owner_statements']);
    expect(toolsForUser(['FINANCE_ACCOUNTS_READ'], ['RENTAL']).map(tool => tool.name)).toEqual([
      'owner_payouts',
      'owner_balances'
    ]);
    expect(toolsForUser(['OWNER_STATEMENTS_VIEW', 'FINANCE_ACCOUNTS_READ'], ['CORE'])).toEqual([]);
  });
  it('réserve les valorisations du patrimoine à son droit personnel et à son module', () => {
    expect(toolsForUser(['PATRIMOINE_PERSONAL_VIEW'], ['PATRIMOINE']).map(tool => tool.name)).toEqual([
      'patrimony_net_worth',
      'patrimony_history'
    ]);
    expect(toolsForUser(['PROPERTIES_VIEW'], ['PATRIMOINE']).map(tool => tool.name)).toEqual(['maintenance_log']);
    expect(toolsForUser(['PATRIMOINE_PERSONAL_VIEW'], ['CORE'])).toEqual([]);
  });
  it('exige le module Ventes pour les biens réservés à la vente', () => {
    expect(toolsForUser(['PROPERTIES_VIEW'], ['SALES']).map(tool => tool.name)).toEqual(['reserved_sale_properties']);
    expect(toolsForUser(['CRM_DEALS_VIEW'], ['SALES']).map(tool => tool.name)).not.toContain(
      'reserved_sale_properties'
    );
  });
  it('expose chaque analyse commerciale uniquement avec son module et son droit de lecture', () => {
    const permissions = ['CRM_DEALS_VIEW', 'FINANCE_REPORTS_READ'];
    expect(toolsForUser(permissions, ['CRM']).map(tool => tool.name)).toEqual(['crm_pipeline']);
    expect(toolsForUser(permissions, ['SALES']).map(tool => tool.name)).toEqual([
      'search_sale_mandates',
      'sale_mandates',
      'sale_commitments'
    ]);
    expect(toolsForUser(permissions, ['CONSTRUCTION']).map(tool => tool.name)).toEqual(['construction_budget']);
    expect(toolsForUser([], ['CRM', 'SALES', 'CONSTRUCTION'])).toEqual([]);
  });
  it('réserve la préparation des alertes budgétaires au module Construction et aux gestionnaires de chantier', () => {
    const permissions = ['FINANCE_SITES_MANAGE', 'FINANCE_ACCOUNTS_READ'];
    expect(toolsForUser(permissions, ['CONSTRUCTION']).map(tool => tool.name)).toContain('prepare_budget_alert');
    expect(toolsForUser(permissions, ['CORE']).map(tool => tool.name)).not.toContain('prepare_budget_alert');
    expect(toolsForUser(['FINANCE_ACCOUNTS_READ'], ['CONSTRUCTION']).map(tool => tool.name)).not.toContain(
      'prepare_budget_alert'
    );
  });
  it.each([
    ['AGENCE', [...CORE_TOOLS, ...RENTAL_TOOLS]],
    ['PATRIMOINE', [...CORE_TOOLS, ...RENTAL_TOOLS]],
    ['INTEGRE', [...CORE_TOOLS, ...RENTAL_TOOLS]],
    ['SYNDIC', CORE_TOOLS],
    ['PROMOTEUR', CORE_TOOLS]
  ])('pack %s : outils exposés', (pack, expected) => {
    expect(
      toolsOfPack(PACKS[pack])
        .map(tool => tool.name)
        .sort()
    ).toEqual([...expected].sort());
  });

  it.each(['SYNDIC', 'PROMOTEUR'])('pack %s : le prompt ne cite ni baux ni quittances', pack => {
    const prompt = buildSystemPrompt('fr', toolsOfPack(PACKS[pack]));
    expect(prompt).toContain('des biens');
    expect(prompt).not.toMatch(/bail|baux|quittance|relevé de compte|propose_rental_document/);
  });

  it.each(['AGENCE', 'PATRIMOINE', 'INTEGRE'])('pack %s : le prompt cite baux et quittances', pack => {
    const prompt = buildSystemPrompt('fr', toolsOfPack(PACKS[pack]));
    expect(prompt).toMatch(/des baux/);
    expect(prompt).toMatch(/quittances de loyer/);
    expect(prompt).toContain('propose_rental_document');
  });

  it('lecture seule : aucun outil de proposition, prompt en lecture seule', () => {
    const tools = toolsOfPack(PACKS.AGENCE, true);
    expect(tools.map(tool => tool.name)).not.toContain('propose_rental_document');
    expect(tools.map(tool => tool.name)).not.toContain('propose_follow_up');
    expect(tools.map(tool => tool.name)).toContain('search_leases');
    expect(buildSystemPrompt('fr', tools)).toContain('lecture seule');
  });

  it.each([
    ['SYNDIC', /biens/, /bail|baux|quittance/],
    ['PROMOTEUR', /biens/, /bail|baux|quittance/],
    ['AGENCE', /baux/, /^$/]
  ])('pack %s : texte d’accueil du faux fournisseur', async (pack, present, absent) => {
    const tools = toolsOfPack(PACKS[pack]).map(tool => ({ name: tool.name, description: '', inputSchema: {} }));
    const provider = new FakeProvider();
    const deltas: string[] = [];
    await provider.runTurn(
      {
        system: '',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Bonjour' }] }],
        tools,
        maxOutputTokens: 100
      },
      d => deltas.push(d),
      new AbortController().signal
    );
    const text = deltas.join('');
    expect(text).toMatch(present);
    expect(text).not.toMatch(absent);
  });
});

describe('ImmoCopilot — appel d’un outil hors pack', () => {
  it('est refusé sans exécution, avec un message poli, et audité', async () => {
    const permissions = new Set(ALL_PERMS);
    const events: CopilotSseEvent[] = [];
    const requests: LlmMessage[][] = [];
    const inner = new FakeProvider();
    const provider = {
      id: inner.id,
      runTurn: (req: Parameters<typeof inner.runTurn>[0], onText: (t: string) => void, signal: AbortSignal) => {
        requests.push(JSON.parse(JSON.stringify(req.messages)) as LlmMessage[]);
        return inner.runTurn(req, onText, signal);
      }
    };
    await runChat({
      provider,
      tenantId: 'tenant-a',
      userId: 'user-1',
      permissions,
      tools: toolsOfPack(PACKS.PROMOTEUR),
      unavailableFeatures: new Set<ToolFeature>(['RENTAL']),
      messages: [{ role: 'user', content: 'Montre-moi les baux en cours' }],
      pageContext: null,
      conversationId: 'c1',
      requestId: 'r1',
      signal: new AbortController().signal,
      emit: e => events.push(e)
    });

    expect(events).toContainEqual({ type: 'tool_status', tool: 'search_leases', status: 'forbidden' });
    const result = requests[1][2].content[0] as { content: string; isError?: boolean };
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content)).toMatchObject({ error: 'MODULE_NOT_INCLUDED' });
    const answer = events
      .filter((e): e is Extract<CopilotSseEvent, { type: 'text_delta' }> => e.type === 'text_delta')
      .map(e => e.text)
      .join('');
    expect(answer).toBe("La gestion locative n'est pas comprise dans votre abonnement.");
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ reason: 'MODULE_NOT_INCLUDED' }) })
    );
  });
});
