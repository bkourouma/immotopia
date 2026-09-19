/**
 * Tests des associations (`lib/finance/partnerships.ts`) — lot 4, deuxième
 * sous-lot.
 *
 * `lib/finance/ledger.ts` (`appendThirdPartyMovementTx`) N'EST PAS mocké :
 * c'est le VRAI calcul de solde qui doit prouver que le compte du locataire
 * n'est jamais touché et que le compte de chaque associé monte exactement du
 * montant de sa part — même choix que `finance.land-leases.test.ts` pour les
 * mêmes raisons (simuler ce calcul à la main aurait surtout prouvé que la
 * simulation est juste, pas que le calcul réel l'est).
 *
 * Aucune écriture comptable n'existe dans ce sous-lot (voir l'en-tête de
 * `partnerships.ts`) : contrairement aux baux de terrain, `accounting.ts`
 * n'est donc ni appelé ni mocké ici.
 */

type Row = Record<string, any>;

const store = {
  partnerships: [] as Row[],
  shares: [] as Row[],
  distributions: [] as Row[],
  accounts: [] as Row[],
  movements: [] as Row[],
  properties: [] as Row[],
  installments: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

const mockPrisma: Row = {
  partnership: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('assoc'), createdAt: new Date(), ...data };
      store.partnerships.push(created);
      return created;
    }),
    findFirst: jest.fn(async ({ where }: Row) => {
      return store.partnerships.find(p => p.id === where.id && p.tenantId === where.tenantId) ?? null;
    }),
    findMany: jest.fn(async ({ where }: Row) => {
      let rows = store.partnerships.filter(p => p.tenantId === where.tenantId);
      if (where.isActive !== undefined) {
        rows = rows.filter(p => p.isActive === where.isActive);
      }
      return [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    })
  },

  partnershipShare: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('part'), createdAt: new Date(Date.now() + store.seq), ...data };
      store.shares.push(created);
      return created;
    }),
    findFirst: jest.fn(async ({ where }: Row) => {
      const row = store.shares.find(s => s.id === where.id);
      if (!row) return null;
      if (where.partnership?.tenantId) {
        const partnership = store.partnerships.find(p => p.id === row.partnershipId);
        if (!partnership || partnership.tenantId !== where.partnership.tenantId) return null;
      }
      return row;
    }),
    findMany: jest.fn(async ({ where }: Row) => {
      let rows = [...store.shares];
      if (where.partnershipId?.in) {
        rows = rows.filter(s => where.partnershipId.in.includes(s.partnershipId));
      } else if (typeof where.partnershipId === 'string') {
        rows = rows.filter(s => s.partnershipId === where.partnershipId);
      }
      if (where.id?.in) {
        rows = rows.filter(s => where.id.in.includes(s.id));
      }
      return [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }),
    delete: jest.fn(async ({ where }: Row) => {
      const index = store.shares.findIndex(s => s.id === where.id);
      const [removed] = store.shares.splice(index, 1);
      return removed;
    })
  },

  partnershipDistribution: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('vent'), createdAt: new Date(Date.now() + store.seq), ...data };
      store.distributions.push(created);
      return created;
    }),
    findFirst: jest.fn(async ({ where }: Row) => {
      let rows = [...store.distributions];
      if (where.partnershipShareId) rows = rows.filter(d => d.partnershipShareId === where.partnershipShareId);
      if (where.tenantId) rows = rows.filter(d => d.tenantId === where.tenantId);
      if (where.rentalInstallmentId) rows = rows.filter(d => d.rentalInstallmentId === where.rentalInstallmentId);
      return rows[0] ?? null;
    }),
    findMany: jest.fn(async ({ where }: Row) => {
      let rows = [...store.distributions];
      if (where.tenantId) rows = rows.filter(d => d.tenantId === where.tenantId);
      if (where.rentalInstallmentId) rows = rows.filter(d => d.rentalInstallmentId === where.rentalInstallmentId);
      if (where.partnershipShareId) rows = rows.filter(d => d.partnershipShareId === where.partnershipShareId);
      return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    })
  },

  thirdPartyAccount: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('cpt'), ...data };
      store.accounts.push(created);
      return created;
    }),
    findFirst: jest.fn(
      async ({ where }: Row) => store.accounts.find(a => a.id === where.id && a.tenantId === where.tenantId) ?? null
    ),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.accounts.find(a => a.id === where.id)!;
      Object.assign(row, data);
      return row;
    })
  },

  thirdPartyMovement: {
    findUnique: jest.fn(async ({ where }: Row) => {
      const key = where.sourceType_sourceId_type;
      return (
        store.movements.find(
          m => m.sourceType === key.sourceType && m.sourceId === key.sourceId && m.type === key.type
        ) ?? null
      );
    }),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('mvt'), createdAt: new Date(), ...data };
      store.movements.push(created);
      return created;
    }),
    aggregate: jest.fn(async ({ where }: Row) => {
      let rows = store.movements.filter(m => m.accountId === where.accountId && m.tenantId === where.tenantId);
      if (where.credit?.not === null) {
        rows = rows.filter(m => m.credit !== undefined && m.credit !== null);
      }
      if (where.movementDate?.gte) {
        rows = rows.filter(m => m.movementDate >= where.movementDate.gte);
      }
      if (where.movementDate?.lte) {
        rows = rows.filter(m => m.movementDate <= where.movementDate.lte);
      }
      const sum = rows.reduce((total, row) => total + (typeof row.credit === 'number' ? row.credit : 0), 0);
      return { _sum: { credit: rows.length ? sum : null } };
    })
  },

  property: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('bien'), createdAt: new Date(), ...data };
      store.properties.push(created);
      return created;
    }),
    findFirst: jest.fn(
      async ({ where }: Row) => store.properties.find(p => p.id === where.id && p.tenantId === where.tenantId) ?? null
    ),
    findMany: jest.fn(async ({ where }: Row) => {
      let rows = store.properties.filter(p => p.tenantId === where.tenantId);
      if (where.partnershipId?.in) {
        rows = rows.filter(p => where.partnershipId.in.includes(p.partnershipId));
      }
      return [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.properties.find(p => p.id === where.id)!;
      Object.assign(row, data);
      return row;
    })
  },

  rentalInstallment: {
    findMany: jest.fn(async ({ where }: Row) => {
      let rows = store.installments.filter(i => i.tenant_id === where.tenant_id);
      if (where.id?.in) {
        rows = rows.filter(i => where.id.in.includes(i.id));
      }
      return rows;
    })
  }
};

async function runTransaction<T>(callback: (tx: Row) => Promise<T>): Promise<T> {
  const snapshot = {
    partnerships: structuredClone(store.partnerships),
    shares: structuredClone(store.shares),
    distributions: structuredClone(store.distributions),
    accounts: structuredClone(store.accounts),
    movements: structuredClone(store.movements),
    properties: structuredClone(store.properties),
    installments: structuredClone(store.installments),
    seq: store.seq
  };
  try {
    return await callback(mockPrisma);
  } catch (error) {
    store.partnerships = snapshot.partnerships;
    store.shares = snapshot.shares;
    store.distributions = snapshot.distributions;
    store.accounts = snapshot.accounts;
    store.movements = snapshot.movements;
    store.properties = snapshot.properties;
    store.installments = snapshot.installments;
    store.seq = snapshot.seq;
    throw error;
  }
}

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === '$transaction') {
          return (callback: any) => runTransaction(callback);
        }
        return (mockPrisma as any)[prop];
      }
    }
  )
}));

import {
  addPartnershipShareTx,
  attachPropertyToPartnershipTx,
  createPartnershipTx,
  distributeInstallmentToPartnersTx,
  getPartnership,
  getPartnerStatement,
  listPartnerships,
  removePartnershipShareTx
} from '../../src/lib/finance/partnerships';

const TENANT_ID = 'tenant-1';

function seedProperty(overrides: Partial<Row> = {}): Row {
  const property = {
    id: nextId('bien'),
    tenantId: TENANT_ID,
    title: `Bien ${store.properties.length + 1}`,
    partnershipId: null,
    createdAt: new Date(Date.now() + store.properties.length),
    ...overrides
  };
  store.properties.push(property);
  return property;
}

function seedInstallment(overrides: Partial<Row> = {}): Row {
  const installment = {
    id: nextId('echeance'),
    tenant_id: TENANT_ID,
    amount_rent: 1_000_000,
    amount_service: 0,
    amount_other_fees: 0,
    amount_paid: 0,
    lease: { property: { title: 'Villa Kipe' } },
    ...overrides
  };
  store.installments.push(installment);
  return installment;
}

async function seedPartnership(label = 'Les Trois Palmiers'): Promise<Row> {
  return runTransaction((tx: any) => createPartnershipTx(tx, TENANT_ID, { label }));
}

async function seedShare(partnershipId: string, partnerName: string, sharePercent: number): Promise<Row> {
  return runTransaction((tx: any) =>
    addPartnershipShareTx(tx, TENANT_ID, { partnershipId, partnerName, sharePercent })
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  store.partnerships = [];
  store.shares = [];
  store.distributions = [];
  store.accounts = [];
  store.movements = [];
  store.properties = [];
  store.installments = [];
  store.seq = 0;
});

// ---------------------------------------------------------------------------
// A. Création de l'association
// ---------------------------------------------------------------------------

describe('createPartnershipTx', () => {
  it('crée une association sans associé, la part de l’entreprise à cent pour cent', async () => {
    const partnership = await seedPartnership();

    expect(partnership.shares).toEqual([]);
    expect(partnership.totalSharePercent).toBe(0);
    expect(partnership.companySharePercent).toBe(100);
    expect(partnership.properties).toEqual([]);
  });

  it('refuse un libellé vide', async () => {
    await expect(runTransaction((tx: any) => createPartnershipTx(tx, TENANT_ID, { label: '  ' }))).rejects.toThrow(
      /obligatoire/i
    );
  });
});

// ---------------------------------------------------------------------------
// B. Ajout d'un associé — LA SOMME DES QUOTES-PARTS NE PEUT PAS DÉPASSER CENT
// ---------------------------------------------------------------------------

describe('addPartnershipShareTx — quote-part et compte de tiers', () => {
  it('ouvre un compte de tiers PARTNER pour le nouvel associé', async () => {
    const partnership = await seedPartnership();

    const updated = await seedShare(partnership.id, 'Mariam Diallo', 40);

    expect(updated.shares).toHaveLength(1);
    expect(updated.shares[0].partnerName).toBe('Mariam Diallo');
    expect(updated.shares[0].sharePercent).toBe(40);
    expect(updated.totalSharePercent).toBe(40);
    expect(updated.companySharePercent).toBe(60);
    expect(store.accounts).toHaveLength(1);
    expect(store.accounts[0].kind).toBe('PARTNER');
    expect(store.accounts[0].balance).toBe(0);
  });

  it('accepte plusieurs associés tant que la somme ne dépasse pas cent', async () => {
    const partnership = await seedPartnership();
    await seedShare(partnership.id, 'Mariam Diallo', 40);
    const updated = await seedShare(partnership.id, 'Sekou Toure', 60);

    expect(updated.totalSharePercent).toBe(100);
    expect(updated.companySharePercent).toBe(0);
  });

  it(
    'refuse une quote-part qui ferait dépasser cent pour cent AU TOTAL, ' +
      'vérifié AVANT toute écriture — aucun compte ni aucune part ne doit rester',
    async () => {
      const partnership = await seedPartnership();
      await seedShare(partnership.id, 'Mariam Diallo', 60);

      await expect(seedShare(partnership.id, 'Sekou Toure', 50)).rejects.toThrow(/cent pour cent/i);

      // La transaction rejetée n'a rien laissé : toujours un seul compte, une
      // seule part (celle du premier associé).
      expect(store.accounts).toHaveLength(1);
      expect(store.shares).toHaveLength(1);
    }
  );

  it('refuse une quote-part nulle ou négative', async () => {
    const partnership = await seedPartnership();
    await expect(seedShare(partnership.id, 'Mariam Diallo', 0)).rejects.toThrow(/positive/i);
  });

  it('refuse une association introuvable', async () => {
    await expect(seedShare('assoc-inconnue', 'Mariam Diallo', 40)).rejects.toThrow(/introuvable/i);
  });
});

// ---------------------------------------------------------------------------
// C. Retrait d'un associé
// ---------------------------------------------------------------------------

describe('removePartnershipShareTx', () => {
  it('retire un associé sans ventilation constatée', async () => {
    const partnership = await seedPartnership();
    const updated = await seedShare(partnership.id, 'Mariam Diallo', 40);
    const shareId = updated.shares[0].id;

    const result = await runTransaction((tx: any) => removePartnershipShareTx(tx, TENANT_ID, shareId));

    expect(result.shares).toEqual([]);
    expect(store.shares).toHaveLength(0);
  });

  it('refuse de retirer un associé qui a déjà une ventilation constatée', async () => {
    const partnership = await seedPartnership();
    const updated = await seedShare(partnership.id, 'Mariam Diallo', 100);
    const shareId = updated.shares[0].id;
    const property = seedProperty({ partnershipId: partnership.id });

    await runTransaction((tx: any) =>
      distributeInstallmentToPartnersTx(tx, TENANT_ID, {
        rentalInstallmentId: 'echeance-1',
        propertyId: property.id,
        amount: 500_000,
        periodYear: 2026,
        periodMonth: 3
      })
    );

    await expect(runTransaction((tx: any) => removePartnershipShareTx(tx, TENANT_ID, shareId))).rejects.toThrow(
      /historique/i
    );
    expect(store.shares).toHaveLength(1);
  });

  it('refuse une quote-part introuvable', async () => {
    await expect(runTransaction((tx: any) => removePartnershipShareTx(tx, TENANT_ID, 'part-inconnue'))).rejects.toThrow(
      /introuvable/i
    );
  });
});

// ---------------------------------------------------------------------------
// D. Rattachement (ou détachement) d'un bien
// ---------------------------------------------------------------------------

describe('attachPropertyToPartnershipTx', () => {
  it('rattache un bien et le fait apparaître dans l’association', async () => {
    const partnership = await seedPartnership();
    const property = seedProperty();

    const updated = await runTransaction((tx: any) =>
      attachPropertyToPartnershipTx(tx, TENANT_ID, property.id, partnership.id)
    );

    expect(updated).not.toBeNull();
    expect(updated!.properties).toEqual([{ propertyId: property.id, propertyLabel: property.title }]);
  });

  it('détache un bien et renvoie null', async () => {
    const partnership = await seedPartnership();
    const property = seedProperty({ partnershipId: partnership.id });

    const result = await runTransaction((tx: any) => attachPropertyToPartnershipTx(tx, TENANT_ID, property.id, null));

    expect(result).toBeNull();
    expect(store.properties.find(p => p.id === property.id)!.partnershipId).toBeNull();
  });

  it('remplace le lien sans erreur quand le bien appartenait déjà à une autre association', async () => {
    const partnershipA = await seedPartnership('Association A');
    const partnershipB = await seedPartnership('Association B');
    const property = seedProperty({ partnershipId: partnershipA.id });

    const updated = await runTransaction((tx: any) =>
      attachPropertyToPartnershipTx(tx, TENANT_ID, property.id, partnershipB.id)
    );

    expect(updated!.id).toBe(partnershipB.id);
    expect(store.properties.find(p => p.id === property.id)!.partnershipId).toBe(partnershipB.id);
  });

  it('refuse un bien introuvable', async () => {
    const partnership = await seedPartnership();
    await expect(
      runTransaction((tx: any) => attachPropertyToPartnershipTx(tx, TENANT_ID, 'bien-inconnu', partnership.id))
    ).rejects.toThrow(/introuvable/i);
  });

  it('refuse une association introuvable', async () => {
    const property = seedProperty();
    await expect(
      runTransaction((tx: any) => attachPropertyToPartnershipTx(tx, TENANT_ID, property.id, 'assoc-inconnue'))
    ).rejects.toThrow(/introuvable/i);
  });
});

// ---------------------------------------------------------------------------
// E/F. Lectures
// ---------------------------------------------------------------------------

describe('listPartnerships / getPartnership', () => {
  it('renvoie les associations avec leurs parts et leurs biens, résolus par lot', async () => {
    const partnership = await seedPartnership();
    await seedShare(partnership.id, 'Mariam Diallo', 40);
    const property = seedProperty({ partnershipId: partnership.id });

    const list = await listPartnerships(TENANT_ID, {});
    expect(list).toHaveLength(1);
    expect(list[0].properties).toEqual([{ propertyId: property.id, propertyLabel: property.title }]);

    const detail = await getPartnership(TENANT_ID, partnership.id);
    expect(detail.shares).toHaveLength(1);
    expect(detail.totalSharePercent).toBe(40);
  });

  it('filtre sur onlyActive', async () => {
    await seedPartnership('Active');
    const inactive = await seedPartnership('Inactive');
    store.partnerships.find(p => p.id === inactive.id)!.isActive = false;

    const list = await listPartnerships(TENANT_ID, { onlyActive: true });
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe('Active');
  });

  it('refuse une association introuvable', async () => {
    await expect(getPartnership(TENANT_ID, 'assoc-inconnue')).rejects.toThrow(/introuvable/i);
  });
});

// ---------------------------------------------------------------------------
// G. La ventilation — cœur du sous-lot
// ---------------------------------------------------------------------------

describe('distributeInstallmentToPartnersTx', () => {
  it('ne fait rien quand le bien n’appartient à aucune association', async () => {
    const property = seedProperty();

    const result = await runTransaction((tx: any) =>
      distributeInstallmentToPartnersTx(tx, TENANT_ID, {
        rentalInstallmentId: 'echeance-1',
        propertyId: property.id,
        amount: 500_000,
        periodYear: 2026,
        periodMonth: 3
      })
    );

    expect(result).toEqual([]);
    expect(store.distributions).toHaveLength(0);
    expect(store.movements).toHaveLength(0);
  });

  it('ne fait rien, sans lever, quand l’association n’a aucun associé', async () => {
    const partnership = await seedPartnership();
    const property = seedProperty({ partnershipId: partnership.id });

    const result = await runTransaction((tx: any) =>
      distributeInstallmentToPartnersTx(tx, TENANT_ID, {
        rentalInstallmentId: 'echeance-1',
        propertyId: property.id,
        amount: 500_000,
        periodYear: 2026,
        periodMonth: 3
      })
    );

    expect(result).toEqual([]);
  });

  it('crédite chaque associé de sa part, SANS JAMAIS toucher un compte du locataire', async () => {
    const partnership = await seedPartnership();
    const shareA = await seedShare(partnership.id, 'Mariam Diallo', 40);
    const partnerAccountA = shareA.shares[0].partnerAccountId;
    const shareB = await seedShare(partnership.id, 'Sekou Toure', 30);
    const partnerAccountB = shareB.shares[1].partnerAccountId;
    const property = seedProperty({ partnershipId: partnership.id });

    const result = await runTransaction((tx: any) =>
      distributeInstallmentToPartnersTx(tx, TENANT_ID, {
        rentalInstallmentId: 'echeance-1',
        propertyId: property.id,
        amount: 1_000_000,
        periodYear: 2026,
        periodMonth: 3
      })
    );

    expect(result).toHaveLength(2);
    expect(result.find(r => r.partnerName === 'Mariam Diallo')!.amount).toBe(400_000);
    expect(result.find(r => r.partnerName === 'Sekou Toure')!.amount).toBe(300_000);
    expect(result.every(r => r.propertyLabel === property.title)).toBe(true);

    expect(store.accounts.find(a => a.id === partnerAccountA)!.balance).toBe(400_000);
    expect(store.accounts.find(a => a.id === partnerAccountB)!.balance).toBe(300_000);

    // Aucune chaîne renvoyée ne prononce « débit » ni « crédit ».
    const serialised = JSON.stringify(result).toLowerCase();
    expect(serialised).not.toMatch(/débit|debit|crédit|credit/);
  });

  it(
    'IDEMPOTENCE : un second appel sur la même échéance ne crée rien et ne bouge aucun solde ' +
      '(la campagne de facturation se rejoue sans redoubler ce que l’agence doit à ses associés)',
    async () => {
      const partnership = await seedPartnership();
      const created = await seedShare(partnership.id, 'Mariam Diallo', 40);
      const partnerAccountId = created.shares[0].partnerAccountId;
      const property = seedProperty({ partnershipId: partnership.id });

      const first = await runTransaction((tx: any) =>
        distributeInstallmentToPartnersTx(tx, TENANT_ID, {
          rentalInstallmentId: 'echeance-1',
          propertyId: property.id,
          amount: 1_000_000,
          periodYear: 2026,
          periodMonth: 3
        })
      );
      const balanceAfterFirst = store.accounts.find(a => a.id === partnerAccountId)!.balance;
      const distributionCountAfterFirst = store.distributions.length;
      const movementCountAfterFirst = store.movements.length;

      const second = await runTransaction((tx: any) =>
        distributeInstallmentToPartnersTx(tx, TENANT_ID, {
          rentalInstallmentId: 'echeance-1',
          propertyId: property.id,
          amount: 1_000_000,
          periodYear: 2026,
          periodMonth: 3
        })
      );

      expect(second).toEqual(first);
      expect(store.distributions).toHaveLength(distributionCountAfterFirst);
      expect(store.movements).toHaveLength(movementCountAfterFirst);
      expect(store.accounts.find(a => a.id === partnerAccountId)!.balance).toBe(balanceAfterFirst);
    }
  );

  it(
    'LE RELIQUAT D’ARRONDI VA AU PREMIER ASSOCIÉ : trois associés à 33,33 % sur un loyer de 1 000 000, ' +
      'la somme versée aux associés vaut EXACTEMENT le produit réparti (999 900), jamais le loyer entier',
    async () => {
      const partnership = await seedPartnership();
      await seedShare(partnership.id, 'Associé 1', 33.33);
      await seedShare(partnership.id, 'Associé 2', 33.33);
      const s3 = await seedShare(partnership.id, 'Associé 3', 33.33);
      const property = seedProperty({ partnershipId: partnership.id });

      const result = await runTransaction((tx: any) =>
        distributeInstallmentToPartnersTx(tx, TENANT_ID, {
          rentalInstallmentId: 'echeance-1',
          propertyId: property.id,
          amount: 1_000_000,
          periodYear: 2026,
          periodMonth: 3
        })
      );

      const total = result.reduce((sum, r) => sum + r.amount, 0);
      // 99,99 % de 1 000 000 — jamais 1 000 000, qui serait ce que produirait
      // une normalisation fautive sur la somme des quotes-parts (voir le
      // commentaire de `splitAmountAcrossShares`).
      expect(total).toBe(999_900);
      // Les trois associés existent bel et bien (aucune fusion, aucune perte
      // de part en route) : la dernière lecture de l'association en compte
      // trois, dans l'ordre de création.
      expect(s3.shares.map((s: Row) => s.partnerName)).toEqual(['Associé 1', 'Associé 2', 'Associé 3']);
    }
  );

  it(
    "LE RELIQUAT D'ARRONDI VA AU PREMIER ASSOCIÉ, PAR ORDRE DE CRÉATION — cas où l'arrondi individuel " +
      'ne tombe pas juste : un loyer non multiple de 10 000 force un écart que seul le premier associé absorbe',
    async () => {
      const partnership = await seedPartnership();
      const first = await seedShare(partnership.id, 'Premier créé', 33.33);
      await seedShare(partnership.id, 'Deuxième créé', 33.33);
      await seedShare(partnership.id, 'Troisième créé', 33.33);
      const property = seedProperty({ partnershipId: partnership.id });
      const firstShareId = first.shares[0].id;

      // 1 000 001 × 33,33 % = 333 300,3333 → arrondi à 333 300 pour chacun
      // (999 900 au total), alors que 1 000 001 × 99,99 % = 999 900,9999 →
      // arrondi à 999 901. L'écart d'un franc revient au premier associé créé.
      const result = await runTransaction((tx: any) =>
        distributeInstallmentToPartnersTx(tx, TENANT_ID, {
          rentalInstallmentId: 'echeance-1',
          propertyId: property.id,
          amount: 1_000_001,
          periodYear: 2026,
          periodMonth: 3
        })
      );

      const total = result.reduce((sum, r) => sum + r.amount, 0);
      expect(total).toBe(999_901);
      const byShareId = new Map(result.map(r => [r.partnershipShareId, r.amount]));
      expect(byShareId.get(firstShareId)).toBe(333_301);
      const others = result.filter(r => r.partnershipShareId !== firstShareId);
      expect(others.every(r => r.amount === 333_300)).toBe(true);
    }
  );

  it('ne lève jamais, même si une écriture échoue en cours de route — journalise et renvoie une liste vide', async () => {
    const partnership = await seedPartnership();
    await seedShare(partnership.id, 'Mariam Diallo', 40);
    const property = seedProperty({ partnershipId: partnership.id });

    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockPrisma.partnershipDistribution.create.mockImplementationOnce(() => {
      throw new Error('panne simulée');
    });

    const result = await runTransaction((tx: any) =>
      distributeInstallmentToPartnersTx(tx, TENANT_ID, {
        rentalInstallmentId: 'echeance-1',
        propertyId: property.id,
        amount: 1_000_000,
        periodYear: 2026,
        periodMonth: 3
      })
    );

    expect(result).toEqual([]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// H. État de quote-part — lecture seule
// ---------------------------------------------------------------------------

describe('getPartnerStatement', () => {
  it('construit le relevé avec loyer facturé/encaissé par ligne, et le total reversé', async () => {
    const partnership = await seedPartnership();
    const created = await seedShare(partnership.id, 'Mariam Diallo', 50);
    const shareId = created.shares[0].id;
    const partnerAccountId = created.shares[0].partnerAccountId;
    const property = seedProperty({ partnershipId: partnership.id, title: 'Villa Kipe 12' });

    const installment = seedInstallment({
      id: 'echeance-mars',
      amount_rent: 900_000,
      amount_service: 100_000,
      amount_paid: 500_000,
      lease: { property: { title: 'Villa Kipe 12' } }
    });

    await runTransaction((tx: any) =>
      distributeInstallmentToPartnersTx(tx, TENANT_ID, {
        rentalInstallmentId: installment.id,
        propertyId: property.id,
        amount: 1_000_000,
        periodYear: 2026,
        periodMonth: 3
      })
    );

    // Un règlement partiel à l'associé, postérieur à la ventilation.
    await mockPrisma.thirdPartyMovement.create({
      data: {
        accountId: partnerAccountId,
        tenantId: TENANT_ID,
        movementDate: new Date('2026-03-15'),
        type: 'PAYMENT',
        credit: 200_000,
        balanceAfter: 300_000,
        label: 'Reversement',
        sourceType: 'MANUAL',
        sourceId: 'manuel-1'
      }
    });

    const statement = await getPartnerStatement(TENANT_ID, shareId);

    expect(statement.partnerName).toBe('Mariam Diallo');
    expect(statement.sharePercent).toBe(50);
    expect(statement.lines).toEqual([
      {
        propertyLabel: 'Villa Kipe 12',
        periodYear: 2026,
        periodMonth: 3,
        rentBilled: 1_000_000,
        rentCollected: 500_000,
        partnerShare: 500_000
      }
    ]);
    expect(statement.totalShare).toBe(500_000);
    expect(statement.totalPaidOut).toBe(200_000);
    // Le règlement manuel ci-dessus est injecté directement dans le grand
    // livre (sans passer par `appendThirdPartyMovementTx`, pour isoler le
    // test) : il n'a donc pas touché le solde du compte, qui ne reflète que
    // la ventilation. `accountBalance` doit refléter le VRAI solde stocké,
    // jamais un recalcul depuis `totalShare`/`totalPaidOut`.
    expect(statement.accountBalance).toBe(500_000);
    expect(statement.currency).toBe('XOF');
  });

  it('filtre les lignes par période (from/to)', async () => {
    const partnership = await seedPartnership();
    const created = await seedShare(partnership.id, 'Mariam Diallo', 50);
    const shareId = created.shares[0].id;
    const property = seedProperty({ partnershipId: partnership.id });

    seedInstallment({ id: 'echeance-mars' });
    seedInstallment({ id: 'echeance-avril' });

    await runTransaction((tx: any) =>
      distributeInstallmentToPartnersTx(tx, TENANT_ID, {
        rentalInstallmentId: 'echeance-mars',
        propertyId: property.id,
        amount: 1_000_000,
        periodYear: 2026,
        periodMonth: 3
      })
    );
    await runTransaction((tx: any) =>
      distributeInstallmentToPartnersTx(tx, TENANT_ID, {
        rentalInstallmentId: 'echeance-avril',
        propertyId: property.id,
        amount: 1_000_000,
        periodYear: 2026,
        periodMonth: 4
      })
    );

    const statement = await getPartnerStatement(TENANT_ID, shareId, { from: new Date('2026-04-01') });

    expect(statement.lines).toHaveLength(1);
    expect(statement.lines[0].periodMonth).toBe(4);
  });

  it(
    "accountBalance N'EST PAS totalShare − totalPaidOut : un relevé borné sur une période plus courte " +
      "que l'historique du compte doit montrer les deux valeurs DIFFÉRENTES",
    async () => {
      const partnership = await seedPartnership();
      const created = await seedShare(partnership.id, 'Mariam Diallo', 50);
      const shareId = created.shares[0].id;
      const partnerAccountId = created.shares[0].partnerAccountId;
      const property = seedProperty({ partnershipId: partnership.id });

      // Deux ventilations, mars puis avril : chacune fait monter le solde du
      // compte de 500 000 (billed), jamais un règlement.
      await runTransaction((tx: any) =>
        distributeInstallmentToPartnersTx(tx, TENANT_ID, {
          rentalInstallmentId: 'echeance-mars',
          propertyId: property.id,
          amount: 1_000_000,
          periodYear: 2026,
          periodMonth: 3
        })
      );
      await runTransaction((tx: any) =>
        distributeInstallmentToPartnersTx(tx, TENANT_ID, {
          rentalInstallmentId: 'echeance-avril',
          propertyId: property.id,
          amount: 1_000_000,
          periodYear: 2026,
          periodMonth: 4
        })
      );
      // Solde après les deux ventilations : 500 000 + 500 000 = 1 000 000.
      expect(store.accounts.find(a => a.id === partnerAccountId)!.balance).toBe(1_000_000);

      // Un règlement de 400 000 à l'associé, en MAI — après la période que le
      // relevé ci-dessous va interroger. Il fait baisser le solde COURANT du
      // compte, mais ne doit apparaître dans AUCUNE ligne ni dans
      // `totalPaidOut` d'un relevé borné à mars.
      await mockPrisma.thirdPartyMovement.create({
        data: {
          accountId: partnerAccountId,
          tenantId: TENANT_ID,
          movementDate: new Date('2026-05-05'),
          type: 'PAYMENT',
          credit: 400_000,
          balanceAfter: 600_000,
          label: 'Reversement de mai',
          sourceType: 'MANUAL',
          sourceId: 'manuel-mai'
        }
      });
      store.accounts.find(a => a.id === partnerAccountId)!.balance = 600_000;

      const statement = await getPartnerStatement(TENANT_ID, shareId, {
        from: new Date('2026-03-01'),
        to: new Date('2026-03-31')
      });

      // Le relevé de mars seul : une ligne, aucun règlement dans la fenêtre.
      expect(statement.lines).toHaveLength(1);
      expect(statement.totalShare).toBe(500_000);
      expect(statement.totalPaidOut).toBe(0);
      // `totalShare − totalPaidOut` vaudrait 500 000 : ce N'EST PAS le solde
      // du compte, qui porte sur TOUTE l'histoire (les deux ventilations et
      // le règlement de mai), pas sur la seule fenêtre de mars.
      expect(statement.totalShare - statement.totalPaidOut).toBe(500_000);
      expect(statement.accountBalance).toBe(600_000);
      expect(statement.accountBalance).not.toBe(statement.totalShare - statement.totalPaidOut);
    }
  );

  it('refuse une quote-part introuvable', async () => {
    await expect(getPartnerStatement(TENANT_ID, 'part-inconnue')).rejects.toThrow(/introuvable/i);
  });
});
