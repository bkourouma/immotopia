import express from 'express';
import request from 'supertest';

/**
 * `GET /api/tenants/:tenantId/properties` — filtrage serveur et vignette (§8.4).
 *
 * Deux defauts sont corriges ici, et chacun a son test :
 *
 * 1. **Le filtrage se faisait dans le navigateur, sur une page deja recue.**
 *    `properties/Properties.tsx:153-206` filtrait `response.properties` — 20
 *    biens — pendant que `pagination` venait du serveur : le compteur annoncait
 *    le portefeuille entier alors que la liste ne montrait que les biens de la
 *    page courante qui passaient le filtre.
 *
 * 2. **Une requete `/media` par carte affichee**, soit jusqu'a 20 requetes pour
 *    une page. Remplacees par `thumbnailUrl`, resolu en une requete groupee.
 *
 * Le test le plus important est celui de l'isolation : la recherche libre porte
 * sur plusieurs colonnes, donc sur un `OR`, et `where.OR` est deja pris par
 * l'isolation par agence. Ecrire la recherche a la racine du `where` ecraserait
 * cette isolation et ouvrirait la liste a toutes les agences. Le test le
 * verifie sur la clause reellement transmise a Prisma.
 */

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', globalRole: 'USER' };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = { tenantId: req.params.tenantId, isCollaborator: true, isClient: false };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({
  enforcePropertyTenantIsolation: (_req: any, _res: any, next: any) => next()
}));

jest.mock('../../src/middleware/property-rbac-middleware', () => ({
  requireAnyPropertyPermission: () => (_req: any, _res: any, next: any) => next(),
  requirePropertyPermission: () => (_req: any, _res: any, next: any) => next()
}));

const TENANT_ID = 'tenant-1';

/** Dernier `where` transmis a Prisma : c'est lui que les tests inspectent. */
let lastWhere: any = null;

const PROPERTIES = [
  { id: 'prop-1', title: 'Villa Kipe', propertyType: 'MAISON', status: 'AVAILABLE' },
  { id: 'prop-2', title: 'Studio Matam', propertyType: 'APPARTEMENT', status: 'AVAILABLE' }
];

/**
 * Le bien 1 a une photo primaire ET une photo secondaire d'ordre inferieur :
 * si le tri sur `isPrimary` etait oublie, c'est la secondaire qui sortirait.
 * Le bien 2 n'a qu'un plan — pas une photo — donc pas de vignette.
 */
const MEDIA = [
  {
    propertyId: 'prop-1',
    mediaType: 'PHOTO',
    isPrimary: false,
    displayOrder: 0,
    fileUrl: null,
    filePath: '/uploads/secondaire.jpg'
  },
  {
    propertyId: 'prop-1',
    mediaType: 'PHOTO',
    isPrimary: true,
    displayOrder: 5,
    fileUrl: '/uploads/primaire.jpg',
    filePath: '/uploads/primaire-brut.jpg'
  },
  {
    propertyId: 'prop-2',
    mediaType: 'PLAN',
    isPrimary: true,
    displayOrder: 0,
    fileUrl: '/uploads/plan.pdf',
    filePath: '/uploads/plan.pdf'
  }
];

const mediaFindMany = jest.fn(async ({ where, orderBy }: any) => {
  const rows = MEDIA.filter(m => where.propertyId.in.includes(m.propertyId) && m.mediaType === where.mediaType);
  // Reproduit `orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }]`.
  void orderBy;
  return [...rows].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.displayOrder - b.displayOrder);
});

jest.mock('../../src/utils/database', () => ({
  prisma: {
    property: {
      findMany: jest.fn(async ({ where }: any) => {
        lastWhere = where;
        return PROPERTIES.map(p => ({ ...p, _count: { containerChildren: 0 }, rentalLeases: [] }));
      }),
      count: jest.fn(async ({ where }: any) => {
        lastWhere = where;
        return PROPERTIES.length;
      })
    },
    propertyMedia: { findMany: (...args: any[]) => mediaFindMany(args[0]) }
  }
}));

jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));

/**
 * Modules coupes volontairement : ils ne participent pas a la liste, mais ils
 * portent des erreurs de typage anterieures a ce lot (backlog AUDIT_CODE.md
 * §3.7). Les charger ferait echouer la COMPILATION du test pour des defauts
 * qui ne sont pas les siens. La fabrique passee a `jest.mock` empeche le
 * module reel d etre requis, donc transpile.
 */
jest.mock('../../src/services/property-template-service', () => ({
  validatePropertyData: jest.fn(async () => ({ valid: true, errors: [] })),
  getAllTemplates: jest.fn(async () => []),
  getTemplateByType: jest.fn(async () => null)
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listPropertiesHandler } = require('../../src/controllers/property-controller');

/**
 * Le gestionnaire est monte seul, et non via `property-routes`. Ce routeur
 * agrege une dizaine de controleurs sans rapport avec la liste, dont certains
 * portent des erreurs de typage anterieures a ce lot : les charger ferait
 * echouer la COMPILATION du test pour des defauts qui ne sont pas les siens.
 * Les intergiciels de la vraie route sont de toute facon simules plus haut ;
 * ce qui se joue ici, c'est la lecture des parametres de requete et la clause
 * effectivement envoyee a la base.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.get('/api/tenants/:tenantId/properties', listPropertiesHandler);
  return app;
}

/** Retrouve, dans le `where`, la clause `OR` portant sur la colonne donnee. */
function orClauseOn(where: any, column: string): any {
  return (where?.AND || []).find((clause: any) => (clause.OR || []).some((c: any) => column in c));
}

describe('GET /api/tenants/:tenantId/properties — filtrage serveur', () => {
  const app = buildApp();

  beforeEach(() => {
    lastWhere = null;
    mediaFindMany.mockClear();
  });

  it('n’ecrase jamais l’isolation par agence avec la recherche libre', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_ID}/properties?q=villa`);
    expect(res.status).toBe(200);

    // L'isolation reste a la racine, intacte…
    expect(Array.isArray(lastWhere.OR)).toBe(true);
    expect(JSON.stringify(lastWhere.OR)).toContain(TENANT_ID);

    // …et la recherche vit dans `AND`, jamais a cote d'elle.
    const search = orClauseOn(lastWhere, 'title');
    expect(search).toBeDefined();
    expect(search.OR).toHaveLength(3);
    expect(JSON.stringify(search)).toContain('villa');
  });

  it('cherche sur le titre, l’adresse et la reference interne', async () => {
    await request(app).get(`/api/tenants/${TENANT_ID}/properties?q=KIPE`);
    const columns = orClauseOn(lastWhere, 'title').OR.flatMap((c: any) => Object.keys(c));
    expect(columns.sort()).toEqual(['address', 'internalReference', 'title']);
  });

  it('filtre la commune sur l’adresse et la zone de localisation', async () => {
    await request(app).get(`/api/tenants/${TENANT_ID}/properties?city=Ratoma`);
    const clause = orClauseOn(lastWhere, 'locationZone');
    expect(clause).toBeDefined();
    expect(JSON.stringify(clause)).toContain('Ratoma');
  });

  it('transmet les bornes numeriques a la base', async () => {
    await request(app).get(
      `/api/tenants/${TENANT_ID}/properties?minPrice=100&maxPrice=500&minSurface=30&maxRooms=4&minBedrooms=2`
    );
    expect(lastWhere.price).toEqual({ gte: 100, lte: 500 });
    // Borne basse seule : l'intervalle reste ouvert vers le haut.
    expect(lastWhere.surfaceArea).toEqual({ gte: 30 });
    expect(lastWhere.rooms).toEqual({ lte: 4 });
    expect(lastWhere.bedrooms).toEqual({ gte: 2 });
  });

  it('traite un parametre vide comme absent, et non comme zero', async () => {
    // `?minPrice=` arrive quand l'utilisateur vide le champ. Le lire comme 0
    // reviendrait a appliquer un filtre que personne n'a demande.
    await request(app).get(`/api/tenants/${TENANT_ID}/properties?minPrice=&q=&city=`);
    expect(lastWhere.price).toBeUndefined();
    expect(lastWhere.AND).toBeUndefined();
  });

  it('ignore une borne illisible plutot que de renvoyer une erreur', async () => {
    await request(app).get(`/api/tenants/${TENANT_ID}/properties?minRooms=beaucoup`);
    expect(lastWhere.rooms).toBeUndefined();
  });
});

describe('GET /api/tenants/:tenantId/properties — vignette', () => {
  const app = buildApp();

  beforeEach(() => {
    mediaFindMany.mockClear();
  });

  it('rend la photo primaire, meme si une autre a un ordre inferieur', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_ID}/properties`);
    const prop1 = res.body.data.find((p: any) => p.id === 'prop-1');
    expect(prop1.thumbnailUrl).toBe('/uploads/primaire.jpg');
  });

  it('rend null quand le bien n’a aucune photo', async () => {
    // Le bien 2 n'a qu'un PLAN : un media primaire, mais pas une photo.
    const res = await request(app).get(`/api/tenants/${TENANT_ID}/properties`);
    const prop2 = res.body.data.find((p: any) => p.id === 'prop-2');
    expect(prop2.thumbnailUrl).toBeNull();
  });

  it('resout toutes les vignettes en une seule requete', async () => {
    // C'est la propriete qui remplace le N+1 : le nombre de requetes ne depend
    // plus du nombre de biens affiches.
    await request(app).get(`/api/tenants/${TENANT_ID}/properties`);
    expect(mediaFindMany).toHaveBeenCalledTimes(1);
    expect(mediaFindMany.mock.calls[0][0].where.propertyId.in).toEqual(['prop-1', 'prop-2']);
  });
});
