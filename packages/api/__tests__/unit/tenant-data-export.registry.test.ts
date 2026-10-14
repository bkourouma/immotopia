/**
 * Lot S7 — export complet d'une agence : classement des modeles et champs
 * sensibles.
 *
 * Meme esprit que `schema-tenant-coverage.test.ts` : chaque modele du schema
 * est soit EXPORTE (direct, par relation, agence, comptes), soit EXCLU avec une
 * raison. Un nouveau modele sans rattachement ni exclusion fait echouer ce
 * test. Aucune base : `Prisma.dmmf` suffit.
 */

import {
  EXCLUDED_MODELS,
  buildTenantWhere,
  classifyModels,
  schemaModels,
  type DmmfModel
} from '../../src/services/tenant-data-export/model-registry';
import {
  EXPLICIT_SENSITIVE_FIELDS,
  exportableFields,
  isSensitiveFieldName
} from '../../src/services/tenant-data-export/sensitive-fields';

const scalar = (name: string, type = 'String') => ({ name, kind: 'scalar', type, isList: false, isRequired: true });
const idField = { ...scalar('id'), isId: true };
const relation = (name: string, type: string, isRequired = true, isList = false) => ({
  name,
  kind: 'object',
  type,
  isList,
  isRequired
});

describe('Export agence — classement des modeles du schema', () => {
  const models = schemaModels();
  const { plans, excluded, unclassified } = classifyModels(models);
  const planOf = (name: string) => plans.find(p => p.model === name);

  it('classe chaque modele : exporte ou exclu avec une raison', () => {
    if (unclassified.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `Modele(s) non classe(s) pour l'export d'agence : ${unclassified.join(', ')}.\n` +
          'Ajoutez un tenantId, une relation OBLIGATOIRE vers un modele rattache, ou une ligne commentee ' +
          'dans EXCLUDED_MODELS (src/services/tenant-data-export/model-registry.ts).'
      );
    }
    expect(unclassified).toEqual([]);
    expect(plans.length + excluded.length).toBe(models.length);
  });

  it('chaque exclusion designe un modele reel et porte une raison', () => {
    const names = new Set(models.map(m => m.name));
    for (const [model, reason] of Object.entries(EXCLUDED_MODELS)) {
      expect(names.has(model) ? model : `INCONNU: ${model}`).toBe(model);
      expect(reason.length).toBeGreaterThan(10);
    }
  });

  it('exclut jetons de securite, catalogues plateforme, journal d’audit et les exports eux-memes', () => {
    for (const model of [
      'RefreshToken',
      'PasswordResetToken',
      'EmailVerificationToken',
      'CatalogItem',
      'AuditLog',
      'TenantDataExport'
    ]) {
      expect(planOf(model)).toBeUndefined();
    }
  });

  it('rattache directement, par relation, l’agence et ses comptes', () => {
    expect(planOf('Property')).toMatchObject({ kind: 'DIRECT', path: ['tenantId'] });
    expect(planOf('ChargeCall')).toMatchObject({
      kind: 'RELATION',
      path: ['syndicate', 'tenantId'],
      delegate: 'chargeCall'
    });
    expect(planOf('ChargePayment')?.path).toHaveLength(3);
    expect(planOf('GMVote')).toMatchObject({ kind: 'RELATION', delegate: 'gMVote' });
    expect(planOf('Tenant')).toMatchObject({ kind: 'TENANT', path: ['id'] });
    expect(planOf('User')).toMatchObject({ kind: 'USER' });
  });

  it('exporte les acces tiers de confiance (lot B3) : donnees de l’agence, sans jeton ni empreinte', () => {
    // Le grant porte l'e-mail du tiers (saisi par l'agence, qui en est responsable de traitement) :
    // c'est une donnee de l'agence, remise a l'agence, comme les contacts CRM. Le secret d'acces,
    // lui, vit dans SecureLink, qui reste exclu.
    for (const model of [
      'ExternalAccessGrant',
      'ExternalAccessGrantProperty',
      'ExternalAccessGrantEntity',
      'ExternalAccessGrantDocument'
    ]) {
      expect(planOf(model)).toMatchObject({ kind: 'DIRECT', path: ['tenantId'] });
      const fields = (models.find(m => m.name === model) as DmmfModel).fields.map(f => f.name);
      expect(fields.filter(isSensitiveFieldName)).toEqual([]);
    }
    expect(planOf('SecureLink')).toBeUndefined();
    expect(EXCLUDED_MODELS).toHaveProperty('SecureLink');
  });

  it('stock de chantier (lot 040, B5-R9) : cle d’idempotence exclue, bons et pieces jointes exportes', () => {
    expect(planOf('StockClientRequest')).toBeUndefined();
    expect(EXCLUDED_MODELS).toHaveProperty('StockClientRequest');
    for (const model of ['StockSlip', 'StockAttachment', 'StockTaker', 'StockAlert', 'StockMovement', 'StockCount']) {
      expect(planOf(model)).toMatchObject({ kind: 'DIRECT', path: ['tenantId'] });
    }
    // Le chemin du fichier sort dans le CSV (et le fichier dans l'archive) ; l'empreinte aussi.
    const attachmentFields = exportableFields(models.find(m => m.name === 'StockAttachment') as DmmfModel);
    expect(attachmentFields).toEqual(expect.arrayContaining(['fileUrl', 'sha256', 'uploadedByUserId']));
  });

  it('chaque modele exporte a une cle d’identifiant pour la pagination', () => {
    for (const plan of plans) {
      const model = models.find(m => m.name === plan.model) as DmmfModel;
      expect(model.fields.some(f => f.name === plan.idField && (f as { isId?: boolean }).isId)).toBe(true);
    }
  });

  it('aucun champ exporte ne porte un nom sensible, et User ne sort que ses champs surs', () => {
    for (const plan of plans) {
      const model = models.find(m => m.name === plan.model) as DmmfModel;
      const fields = exportableFields(model);
      expect(fields.filter(isSensitiveFieldName)).toEqual([]);
      for (const explicit of EXPLICIT_SENSITIVE_FIELDS[model.name] ?? []) expect(fields).not.toContain(explicit);
    }
    const user = exportableFields(models.find(m => m.name === 'User') as DmmfModel);
    expect(user).toEqual(expect.arrayContaining(['id', 'email', 'fullName']));
    for (const forbidden of ['passwordHash', 'googleId', 'globalRole']) expect(user).not.toContain(forbidden);
    const gateway = exportableFields(models.find(m => m.name === 'PaymentGatewayConfig') as DmmfModel);
    expect(gateway).not.toContain('apiKeyEncrypted');
    expect(gateway).toContain('provider');
  });
});

describe('Export agence — regles de classement sur un schema fabrique', () => {
  const base: DmmfModel[] = [
    { name: 'Tenant', fields: [idField] },
    { name: 'User', fields: [idField, scalar('passwordHash')] },
    { name: 'Syndicate', fields: [idField, scalar('tenantId')] },
    { name: 'Lot', fields: [idField, relation('syndicate', 'Syndicate')] },
    { name: 'Vote', fields: [idField, relation('lot', 'Lot'), relation('syndicate', 'Syndicate')] },
    { name: 'Loose', fields: [idField, relation('syndicate', 'Syndicate', false)] }
  ];

  it('prend le chemin le plus court et ignore une relation facultative', () => {
    const { plans, unclassified } = classifyModels(base);
    expect(plans.find(p => p.model === 'Vote')?.path).toEqual(['syndicate', 'tenantId']);
    expect(plans.find(p => p.model === 'Lot')?.path).toEqual(['syndicate', 'tenantId']);
    expect(unclassified).toEqual(['Loose']);
  });

  it('signale un nouveau modele non classe', () => {
    const { unclassified } = classifyModels([...base, { name: 'Orphan', fields: [idField, scalar('label')] }]);
    expect(unclassified).toContain('Orphan');
  });

  it('construit un filtre imbrique borne a l’agence', () => {
    const { plans } = classifyModels(base);
    const vote = {
      model: 'X',
      delegate: 'x',
      kind: 'RELATION' as const,
      path: ['lot', 'syndicate', 'tenantId'],
      idField: 'id'
    };
    expect(buildTenantWhere(vote, 't1')).toEqual({ lot: { syndicate: { tenantId: 't1' } } });
    const tenantPlan = plans.find(p => p.model === 'Tenant');
    if (!tenantPlan) throw new Error('Plan Tenant absent');
    expect(buildTenantWhere(tenantPlan, 't1')).toEqual({ id: 't1' });
    expect(() => buildTenantWhere(vote, '')).toThrow();
  });
});

describe('Export agence — noms de champs sensibles', () => {
  it.each([
    'passwordHash',
    'tokenHash',
    'apiKeyEncrypted',
    'api_key',
    'clientSecret',
    'providerToken',
    'iv',
    'encryption_iv',
    'passwordSalt',
    'credentials'
  ])('%s est sensible', name => expect(isSensitiveFieldName(name)).toBe(true));
  it.each(['isActive', 'activity', 'archivedAt', 'representativeName', 'waived', 'exclusiveGroup', 'fileUrl'])(
    '%s ne l’est pas',
    name => expect(isSensitiveFieldName(name)).toBe(false)
  );
});
