import {
  AuditRowForHash,
  canonicalJson,
  GENESIS_HASH,
  merkleRoot,
  rowHash,
  SEAL_ALGORITHM,
  sealChainHash
} from '../../src/lib/audit/integrity';

const row = (overrides: Partial<AuditRowForHash> = {}): AuditRowForHash => ({
  id: 'a1',
  actorUserId: 'u1',
  tenantId: 't1',
  actionKey: 'PROPERTY_CREATED',
  entityType: 'PROPERTY',
  entityId: 'p1',
  ipAddress: '10.0.0.1',
  userAgent: 'ua',
  payload: { title: 'T', nested: { b: 2, a: 1 } },
  createdAt: new Date('2026-10-01T10:00:00.123Z'),
  scope: 'TENANT',
  visibility: 'TENANT',
  category: 'DATA',
  outcome: 'SUCCESS',
  actorType: 'USER',
  actorLabel: 'a@b.test',
  requestId: 'req-1',
  source: 'http',
  changes: null,
  ...overrides
});

describe('canonicalJson', () => {
  it('trie les clés à tous les niveaux : l’ordre d’un jsonb relu n’a pas d’effet', () => {
    expect(canonicalJson({ b: 1, a: { d: 1, c: 2 } })).toBe(canonicalJson({ a: { c: 2, d: 1 }, b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('distingue les types : 1, "1" et null ne se confondent pas', () => {
    expect(canonicalJson([1])).not.toBe(canonicalJson(['1']));
    expect(canonicalJson({ a: null })).not.toBe(canonicalJson({ a: 'null' }));
  });

  it('écrit les dates en ISO et ignore les clés undefined', () => {
    expect(canonicalJson({ at: new Date('2026-10-01T00:00:00.000Z'), x: undefined })).toBe(
      '{"at":"2026-10-01T00:00:00.000Z"}'
    );
  });
});

describe('rowHash', () => {
  it('est déterministe et indépendant de l’ordre des clés du payload', () => {
    const a = rowHash(row());
    const b = rowHash(row({ payload: { nested: { a: 1, b: 2 }, title: 'T' } }));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['actionKey', { actionKey: 'PROPERTY_DELETED' }],
    ['tenantId', { tenantId: 't2' }],
    ['entityId', { entityId: 'p2' }],
    ['ipAddress', { ipAddress: '10.0.0.2' }],
    ['payload', { payload: { title: 'X' } }],
    ['createdAt', { createdAt: new Date('2026-10-01T10:00:00.124Z') }],
    ['visibility', { visibility: 'PLATFORM_ONLY' }],
    ['outcome', { outcome: 'FAILURE' }],
    ['actorLabel', { actorLabel: 'autre@b.test' }],
    ['changes', { changes: { price: { before: 1, after: 2 } } }],
    ['actorUserId à null', { actorUserId: null }]
  ] as Array<[string, Partial<AuditRowForHash>]>)('change quand %s change', (_name, change) => {
    expect(rowHash(row(change))).not.toBe(rowHash(row()));
  });
});

describe('valeurs de référence figées (algorithme v1)', () => {
  it('le hash d’une ligne', () => {
    expect(rowHash(row())).toBe('c1eecd00ca1c46b907ed22120e24d86885b9f841e0cba3db59545b3bd6493611');
  });

  it('la racine de Merkle de trois lignes', () => {
    const leaves = [0, 1, 2].map(i => rowHash(row({ id: `r${i}` })));
    expect(merkleRoot(leaves)).toBe('5e8fbb2830f7f7f6d59f5dfd10067405a75c5432c04a83a182df8af8a18220d2');
  });
});

describe('merkleRoot', () => {
  const leaves = (n: number) => Array.from({ length: n }, (_, i) => rowHash(row({ id: `r${i}` })));

  it('une feuille : la racine est la feuille', () => {
    const [leaf] = leaves(1);
    expect(merkleRoot([leaf])).toBe(leaf);
  });

  it('est déterministe, et dépend de chaque feuille et de leur ordre', () => {
    const l = leaves(5);
    expect(merkleRoot(l)).toBe(merkleRoot([...l]));
    for (let i = 0; i < l.length; i++) {
      const altered = [...l];
      altered[i] = rowHash(row({ id: 'autre' }));
      expect(merkleRoot(altered)).not.toBe(merkleRoot(l));
    }
    expect(merkleRoot([l[1], l[0], ...l.slice(2)])).not.toBe(merkleRoot(l));
  });

  it('retirer ou ajouter une feuille change la racine (pour 1 à 9 feuilles)', () => {
    for (let n = 1; n <= 9; n++) {
      const l = leaves(n);
      const roots = new Set([merkleRoot(l), merkleRoot(leaves(n + 1)), merkleRoot(l.slice(0, -1) as string[])]);
      expect(roots.size).toBe(3);
    }
  });

  it('un nœud interne ne peut pas se faire passer pour une feuille (séparation de domaine)', () => {
    const [a, b] = leaves(2);
    // La racine de deux feuilles n'est pas un hash de feuille valide.
    expect(merkleRoot([a, b])).not.toBe(rowHash(row()));
    expect(merkleRoot([merkleRoot([a, b])])).toBe(merkleRoot([a, b]));
  });
});

describe('sealChainHash', () => {
  const seal = {
    sealDate: '2026-09-01',
    tenantKey: 'PLATFORM',
    visibility: 'PLATFORM_ONLY',
    rowCount: 3,
    rootHash: 'ab'.repeat(32),
    algorithm: SEAL_ALGORITHM
  };

  it('dépend du précédent : réécrire un scellé ancien change toute la suite', () => {
    const first = sealChainHash(GENESIS_HASH, seal);
    const second = sealChainHash(first, { ...seal, sealDate: '2026-09-02' });
    const tamperedFirst = sealChainHash(GENESIS_HASH, { ...seal, rowCount: 2 });
    expect(sealChainHash(tamperedFirst, { ...seal, sealDate: '2026-09-02' })).not.toBe(second);
  });

  it.each([
    ['sealDate', { sealDate: '2026-09-02' }],
    ['tenantKey', { tenantKey: 't1' }],
    ['visibility', { visibility: 'TENANT' }],
    ['rowCount', { rowCount: 4 }],
    ['rootHash', { rootHash: 'cd'.repeat(32) }],
    ['algorithm', { algorithm: 'sha256-merkle-v2' }]
  ] as Array<[string, Partial<typeof seal>]>)('change quand %s change', (_name, change) => {
    expect(sealChainHash(GENESIS_HASH, { ...seal, ...change })).not.toBe(sealChainHash(GENESIS_HASH, seal));
  });

  it('valeur de référence figée : l’algorithme v1 ne doit jamais changer', () => {
    // Si ce test échoue, un scellé déjà écrit ne se reverifiera plus.
    expect(sealChainHash(GENESIS_HASH, seal)).toBe('d9ade4abf2c527e286f7c2318c25c13e69c5a192fa7dac813395df89ae869762');
  });
});
