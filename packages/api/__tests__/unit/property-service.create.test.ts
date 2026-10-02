/**
 * Recette Syndic du 26/09 — agence en politique de quota « Bloquer », 110 lots
 * pour une capacite de 100, assistant de creation d'un appartement en mode
 * Location :
 *   1. l'enregistrement automatique de l'etape « Medias » envoie
 *      `address: ""` -> 409 QUOTA_EXCEEDED (correct) ;
 *   2. « Terminer » renvoie une creation SANS `address` (le front met
 *      `formData.address.trim() || undefined`, que JSON.stringify retire)
 *      -> 500 INTERNAL.
 *
 * Reproduit contre la vraie base (instance temporaire de l'API) : le 500 est
 * un `PrismaClientValidationError` leve par `tx.property.create()` —
 * « Argument `address` is missing. » — car la colonne `properties.address`
 * est `String` non nul sans valeur par defaut, alors que l'adresse n'est pas
 * obligatoire dans le formulaire. Le refus de quota n'y est pour rien : il
 * n'est evalue qu'apres l'insertion (`syncLotActivationsTx`), que ce corps
 * n'atteignait jamais. Deux requetes successives, pas concurrentes.
 *
 * Ce test monte la vraie route (`createPropertyHandler` + vrai
 * `errorHandler`) sur le vrai `createProperty`. Seul Prisma est simule, par
 * une transaction dont `property.create` applique la meme regle que le moteur
 * Prisma : tout champ scalaire requis sans valeur par defaut du modele
 * `Property` (lu dans le DMMF du client genere, donc du vrai schema) doit etre
 * present, sinon `PrismaClientValidationError`.
 */

import express from 'express';
import request from 'supertest';
import { Prisma, PropertyType, PropertyOwnershipType, PropertyTransactionMode } from '@prisma/client';

const transactionMock = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (...args: any[]) => transactionMock(...args),
    // Barriere « detenu en propre » : lu seulement si `ownerUserId` differe
    // de l'acteur — aucun cas de ce fichier ne l'atteint, mais un membre
    // absent garde le comportement sur (pas de proprietaire tiers accepte a tort).
    membership: { findFirst: jest.fn().mockResolvedValue(null) }
  }
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn(),
  recordAuditEvent: jest.fn()
}));

const generatePropertyReference = jest.fn();
jest.mock('../../src/utils/property-reference-generator', () => ({
  generatePropertyReference: (...args: any[]) => generatePropertyReference(...args)
}));

// property-template-service.ts porte des erreurs TypeScript preexistantes
// (AGENTS.md) : simule, comme dans __tests__/api/quota-exceeded-409.test.ts.
jest.mock('../../src/services/property-template-service', () => ({
  validatePropertyData: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
  getTemplateByType: jest.fn(),
  getAllTemplates: jest.fn()
}));

jest.mock('../../src/services/property-quality-service', () => ({
  getLatestQualityScore: jest.fn(),
  calculateQualityScore: jest.fn(),
  calculateAndStoreQualityScore: jest.fn().mockResolvedValue(undefined)
}));

const syncLotActivationsTx = jest.fn();
jest.mock('../../src/services/lot-registry-service', () => ({
  syncLotActivationsTx: (...args: any[]) => syncLotActivationsTx(...args)
}));

// Barriere « detenu en propre » (pack Patrimoine, lot P1) : hors sujet ici
// (couverte par own-assets-barrier.test.ts) — no-op pour ne pas lire les
// droits d'abonnement (getEntitlements) via le vrai Prisma simule au-dessus.
jest.mock('../../src/services/own-assets-barrier-service', () => ({
  assertThirdPartyAllowedForTenant: jest.fn(),
  isThirdPartyOwnershipInput: jest.fn().mockReturnValue(false)
}));

// Palier gratuit (lot 4) : la garde lit les droits d'abonnement en base ; hors sujet ici
// (voir property-service.free-tier.test.ts et personal-space.*.test.ts).
jest.mock('../../src/services/personal-space/free-tier', () => ({
  getAssetCapacityLimit: jest.fn(async () => null),
  lockTenantAssets: jest.fn(async () => undefined),
  assertFreeTierCapacityTx: jest.fn(async () => undefined)
}));

import { createProperty } from '../../src/services/property-service';
import { createPropertyHandler } from '../../src/controllers/property-controller';
import { errorHandler, QuotaExceededError, BadRequestError } from '../../src/middleware/error-middleware';

const TENANT_ID = 'ace199d3-0d8a-44f8-aa9e-15f795c7d3cf';
const QUOTA_DETAIL = { capacityKey: 'LOTS', limit: 100, used: 110, requested: 1 };

/** Champs que Prisma exige a la creation d'un `Property` (requis, sans defaut). */
const CHAMPS_REQUIS = (Prisma.dmmf.datamodel.models.find(model => model.name === 'Property')?.fields ?? [])
  .filter(
    field =>
      (field.kind === 'scalar' || field.kind === 'enum') &&
      field.isRequired &&
      !field.hasDefaultValue &&
      !field.isUpdatedAt &&
      !field.isList
  )
  .map(field => field.name);

it('le DMMF du client genere expose bien les champs requis du modele Property', () => {
  expect(CHAMPS_REQUIS).toEqual(expect.arrayContaining(['title', 'description', 'address']));
});

/** Imite `PrismaClientValidationError` (classe classee 500 par errorHandler). */
class FakePrismaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrismaClientValidationError';
  }
}

/** Imite `PrismaClientKnownRequestError` sans le moteur Prisma. */
class FakePrismaKnownRequestError extends Error {
  code: string;
  meta?: Record<string, unknown>;
  constructor(code: string, message: string, meta?: Record<string, unknown>) {
    super(message);
    this.name = 'PrismaClientKnownRequestError';
    this.code = code;
    this.meta = meta;
  }
}

const propertyCreate = jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
  const manquant = CHAMPS_REQUIS.find(champ => data[champ] === undefined || data[champ] === null);
  if (manquant) {
    throw new FakePrismaValidationError(
      `Invalid \`tx.property.create()\` invocation: Argument \`${manquant}\` is missing.`
    );
  }
  return { id: 'bien-cree', containerParentId: null, owner: null, ...data };
});

/** `$transaction(callback)` : execute le callback sur un client de transaction simule. */
function transactionReelle() {
  transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({ property: { create: propertyCreate } })
  );
}

function appCreation() {
  const app = express();
  app.use(express.json());
  app.post('/api/tenants/:tenantId/properties', createPropertyHandler);
  app.use(errorHandler);
  return app;
}

/** Corps de l'enregistrement automatique (PropertyFormWizard, `autoSaveForMedia`). */
const corpsAutoSave = {
  propertyType: 'APPARTEMENT',
  ownershipType: 'TENANT',
  title: 'Appartement en location',
  description: '',
  address: '',
  transactionModes: ['RENTAL'],
  currency: 'CFA',
  furnishingStatus: 'UNFURNISHED',
  availability: 'AVAILABLE',
  typeSpecificData: { country: "Côte d'Ivoire", region: 'Abidjan', commune: 'Cocody', commissionMode: '' }
};

/** Corps de « Terminer » (`handleFinish`) : identique, mais sans `address`. */
const { address: _adresseVide, ...corpsTerminer } = corpsAutoSave;

beforeEach(() => {
  jest.clearAllMocks();
  // `clearAllMocks` ne vide pas les files `mock*Once` : reset explicite.
  transactionMock.mockReset();
  syncLotActivationsTx.mockReset();
  generatePropertyReference.mockResolvedValue('PROP-20260926-ACE1-0001');
  transactionReelle();
});

describe('POST /api/tenants/:tenantId/properties — agence au quota, politique Bloquer', () => {
  beforeEach(() => {
    syncLotActivationsTx.mockRejectedValue(new QuotaExceededError(QUOTA_DETAIL));
  });

  it('l\'enregistrement automatique (address: "") repond 409 QUOTA_EXCEEDED', async () => {
    const res = await request(appCreation()).post(`/api/tenants/${TENANT_ID}/properties`).send(corpsAutoSave);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('QUOTA_EXCEEDED');
    expect(res.body.data).toMatchObject(QUOTA_DETAIL);
  });

  it('« Terminer », sans adresse, repond le meme 409 QUOTA_EXCEEDED — plus jamais 500', async () => {
    const res = await request(appCreation()).post(`/api/tenants/${TENANT_ID}/properties`).send(corpsTerminer);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('QUOTA_EXCEEDED');
    expect(res.body.data).toMatchObject(QUOTA_DETAIL);
    // L'adresse facultative est enregistree vide, comme le fait l'auto-save.
    expect(propertyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ address: '', description: '' }) })
    );
  });
});

describe('POST /api/tenants/:tenantId/properties — corps sans adresse ni description, hors quota', () => {
  it('cree le bien (201) avec une adresse et une description vides', async () => {
    syncLotActivationsTx.mockResolvedValue(undefined);
    const { description: _description, ...sansDescription } = corpsTerminer;

    const res = await request(appCreation()).post(`/api/tenants/${TENANT_ID}/properties`).send(sansDescription);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ id: 'bien-cree', address: '', description: '' });
  });
});

describe('POST /api/tenants/:tenantId/properties — corps invalide : 400 VALIDATION_ERROR, jamais 500', () => {
  /**
   * `assertCreatePropertyRequest` levait une `BadRequestError` avec le message
   * en `res.body.message` (code `BAD_REQUEST`). Le schema Zod
   * (`lib/properties/schemas.ts`) qui l'a remplace laisse le `ZodError`
   * remonter nu jusqu'a `errorHandler`, classe en 400 `VALIDATION_ERROR` — le
   * message precis vit desormais dans `errors[].message`, par champ.
   */
  it.each([
    ['sans titre', { ...corpsTerminer, title: undefined }, 'title', 'Le titre du bien est requis.'],
    ['titre blanc', { ...corpsTerminer, title: '   ' }, 'title', 'Le titre du bien est requis.'],
    [
      'sans type de bien',
      { ...corpsTerminer, propertyType: undefined },
      'propertyType',
      'Le type de bien est absent ou inconnu.'
    ],
    [
      'type de bien inconnu',
      { ...corpsTerminer, propertyType: 'CHATEAU' },
      'propertyType',
      'Le type de bien est absent ou inconnu.'
    ],
    [
      'type de detention inconnu',
      { ...corpsTerminer, ownershipType: 'LOCATAIRE' },
      'ownershipType',
      'Le type de détention du bien est absent ou inconnu.'
    ],
    [
      'mode de transaction inconnu',
      { ...corpsTerminer, transactionModes: ['LEASING'] },
      'transactionModes.0',
      'Les modes de transaction du bien sont invalides.'
    ],
    ['adresse non textuelle', { ...corpsTerminer, address: 12 }, 'address', "L'adresse du bien doit être un texte."],
    [
      'prix mal type (chaine non numerique)',
      { ...corpsTerminer, price: 'abc' },
      'price',
      'Type invalide : number attendu, string reçu.'
    ],
    [
      'nombre de chambres mal type (chaine non numerique)',
      { ...corpsTerminer, bedrooms: 'x' },
      'bedrooms',
      'Type invalide : number attendu, string reçu.'
    ],
    [
      'proprietaire qui n’est pas un uuid',
      { ...corpsTerminer, ownerUserId: 'pas-un-uuid' },
      'ownerUserId',
      'Identifiant invalide.'
    ],
    [
      'devise mal typee (nombre au lieu de texte)',
      { ...corpsTerminer, currency: 123 },
      'currency',
      'Type invalide : string attendu, number reçu.'
    ]
  ])('%s -> 400 VALIDATION_ERROR', async (_cas, corps, field, message) => {
    const res = await request(appCreation()).post(`/api/tenants/${TENANT_ID}/properties`).send(corps);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field, message })]));
    expect(transactionMock).not.toHaveBeenCalled();
  });
});

describe('createProperty — reessais', () => {
  const donnees = () => ({
    propertyType: PropertyType.APPARTEMENT,
    ownershipType: PropertyOwnershipType.TENANT,
    title: 'Bel appartement',
    description: '',
    address: '',
    transactionModes: [PropertyTransactionMode.RENTAL],
    currency: 'CFA'
  });

  it('une QuotaExceededError ne declenche aucun reessai', async () => {
    transactionMock.mockReset();
    transactionMock.mockRejectedValueOnce(new QuotaExceededError(QUOTA_DETAIL));

    await expect(createProperty(TENANT_ID, null, donnees())).rejects.toBeInstanceOf(QuotaExceededError);

    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it('une collision de reference (P2002 internal_reference) se reessaie', async () => {
    transactionMock.mockReset();
    transactionMock.mockRejectedValueOnce(
      new FakePrismaKnownRequestError('P2002', 'Unique constraint failed', { target: ['internal_reference'] })
    );
    transactionMock.mockResolvedValueOnce({ id: 'prop-1', internalReference: 'PROP-20260926-ACE1-0002' });

    const result = await createProperty(TENANT_ID, null, donnees());

    expect(result).toMatchObject({ id: 'prop-1' });
    expect(transactionMock).toHaveBeenCalledTimes(2);
  });

  it("n'importe quelle autre erreur remonte telle quelle, sans reessai", async () => {
    transactionMock.mockReset();
    transactionMock.mockRejectedValueOnce(new BadRequestError('Refus metier'));

    await expect(createProperty(TENANT_ID, null, donnees())).rejects.toThrow('Refus metier');

    expect(transactionMock).toHaveBeenCalledTimes(1);
  });
});
