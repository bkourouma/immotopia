import {
  blankRoomsFrom,
  compareInspections,
  compareSummary,
  defaultRooms,
  findRemovedEntryItems,
  findUnevaluatedItems,
  freezeEntryFields,
  furnishedRooms,
  normalizeDeductions,
  normalizeRooms,
  parseMeterReading,
  type InspectionItem,
  type InspectionRoom
} from '../../src/lib/lease-inspections/inventory';

/**
 * Volet meublés de la spec 040 (M1 à M5) : règles pures du gabarit mobilier
 * des états des lieux — modèles, normalisation des documents anciens,
 * finalisation, comparaison et synthèse.
 */

function item(id: string, overrides: Partial<InspectionItem> = {}): InspectionItem {
  return { id, label: id, condition: null, comment: null, ...overrides };
}

function furniture(id: string, overrides: Partial<InspectionItem> = {}): InspectionItem {
  return item(id, { kind: 'FURNITURE', quantity: 1, replacementValue: null, ...overrides });
}

function room(id: string, items: InspectionItem[], name = id): InspectionRoom {
  return { id, name, items };
}

describe('defaultRooms — modèle « Bâti seulement »', () => {
  it('marque chaque élément en bâti, sans quantité ni valeur', () => {
    for (const r of defaultRooms()) {
      for (const i of r.items) {
        expect(i).toMatchObject({ kind: 'FIXTURE', quantity: null, replacementValue: null, condition: null });
      }
    }
  });
});

describe('furnishedRooms — modèle « Bâti, mobilier et équipements »', () => {
  it('crée six pièces : le bâti du modèle actuel, puis le mobilier, dans l’ordre M1', () => {
    const rooms = furnishedRooms({ withQuantities: true });
    expect(rooms.map(r => r.name)).toEqual([
      'Entrée/Séjour',
      'Cuisine',
      'Chambre 1',
      'Salle de bain',
      'WC',
      'Équipements et divers'
    ]);

    const standard = defaultRooms();
    rooms.slice(0, 5).forEach((r, index) => {
      const fixtures = r.items.filter(i => i.kind === 'FIXTURE').map(i => i.label);
      expect(fixtures).toEqual(standard[index].items.map(i => i.label));
      // Bâti d'abord, mobilier ensuite.
      const firstFurniture = r.items.findIndex(i => i.kind === 'FURNITURE');
      if (firstFurniture >= 0) {
        expect(r.items.slice(firstFurniture).every(i => i.kind === 'FURNITURE')).toBe(true);
      }
    });

    const sejour = rooms[0].items.filter(i => i.kind === 'FURNITURE').map(i => i.label);
    expect(sejour).toEqual([
      'Canapé',
      'Fauteuils',
      'Table basse',
      'Table à manger',
      'Chaises',
      'Téléviseur',
      'Télécommandes',
      'Climatiseur',
      'Ventilateur',
      'Rideaux',
      'Lampes'
    ]);
    expect(rooms[1].items.filter(i => i.kind === 'FURNITURE')).toHaveLength(11);
    expect(rooms[2].items.filter(i => i.kind === 'FURNITURE')).toHaveLength(11);
    expect(rooms[3].items.filter(i => i.kind === 'FURNITURE').map(i => i.label)).toEqual([
      'Serviettes',
      'Tapis de bain',
      'Miroir',
      'Chauffe-eau'
    ]);
    expect(rooms[4].items.every(i => i.kind === 'FIXTURE')).toBe(true);
    expect(rooms[5].items.map(i => i.label)).toEqual([
      'Fer à repasser',
      'Planche à repasser',
      'Balai et serpillière',
      'Extincteur',
      'Décodeur TV',
      'Box internet'
    ]);
  });

  it('met une quantité de 1 à l’entrée et aucune à la sortie, valeur vide', () => {
    const entry = furnishedRooms({ withQuantities: true }).flatMap(r => r.items);
    const exit = furnishedRooms({ withQuantities: false }).flatMap(r => r.items);
    for (const i of entry.filter(x => x.kind === 'FURNITURE')) {
      expect(i).toMatchObject({ quantity: 1, replacementValue: null, condition: null });
    }
    for (const i of exit.filter(x => x.kind === 'FURNITURE')) {
      expect(i.quantity).toBeNull();
    }
    for (const i of entry.filter(x => x.kind === 'FIXTURE')) {
      expect(i.quantity).toBeNull();
    }
  });

  it('donne des identifiants uniques, renouvelés à chaque appel', () => {
    const first = furnishedRooms({ withQuantities: true });
    const ids = [...first.map(r => r.id), ...first.flatMap(r => r.items.map(i => i.id))];
    expect(new Set(ids).size).toBe(ids.length);
    const second = furnishedRooms({ withQuantities: true });
    expect(second[0].items[0].id).not.toBe(first[0].items[0].id);
  });
});

describe('blankRoomsFrom', () => {
  it('conserve identifiants, nature et valeur ; vide état, commentaire et quantité', () => {
    const source = [
      room('r1', [
        furniture('tv', { condition: 'GOOD', comment: 'Rayé', quantity: 2, replacementValue: 150000 }),
        item('sol', { condition: 'FAIR' })
      ])
    ];
    const blank = blankRoomsFrom(source);
    expect(blank[0].items[0]).toEqual({
      id: 'tv',
      label: 'tv',
      condition: null,
      comment: null,
      kind: 'FURNITURE',
      quantity: null,
      replacementValue: 150000
    });
    expect(blank[0].items[1]).toMatchObject({ id: 'sol', kind: 'FIXTURE', quantity: null, condition: null });
  });
});

describe('normalizeRooms / normalizeDeductions', () => {
  it('complète un document ancien sans les nouveaux champs', () => {
    const rooms = normalizeRooms([
      { id: 'r', name: 'Séjour', items: [{ id: 'i', label: 'Sol', condition: 'GOOD', comment: null }] }
    ]);
    expect(rooms[0].items[0]).toEqual({
      id: 'i',
      label: 'Sol',
      condition: 'GOOD',
      comment: null,
      kind: 'FIXTURE',
      quantity: null,
      replacementValue: null
    });
    expect(normalizeRooms(null)).toEqual([]);
  });

  it('complète les retenues : source MANUAL, montant proposé nul', () => {
    expect(normalizeDeductions([{ id: 'd', label: 'X', amount: 10, roomId: null, itemId: null }])).toEqual([
      { id: 'd', label: 'X', amount: 10, roomId: null, itemId: null, source: 'MANUAL', proposedAmount: null }
    ]);
  });
});

describe('findUnevaluatedItems', () => {
  it('relève un état vide', () => {
    const result = findUnevaluatedItems([room('r', [item('a'), item('b', { condition: 'GOOD' })], 'Séjour')]);
    expect(result).toEqual([{ roomId: 'r', roomName: 'Séjour', itemId: 'a', label: 'a', missing: 'CONDITION' }]);
  });

  it('relève un mobilier évalué sans quantité', () => {
    const result = findUnevaluatedItems([room('r', [furniture('c', { condition: 'GOOD', quantity: null })])]);
    expect(result).toEqual([expect.objectContaining({ itemId: 'c', missing: 'QUANTITY' })]);
  });

  it('accepte un mobilier manquant sans quantité', () => {
    expect(findUnevaluatedItems([room('r', [furniture('c', { condition: 'MISSING', quantity: null })])])).toEqual([]);
  });

  it('traite un élément ancien sans nature comme du bâti', () => {
    expect(findUnevaluatedItems([room('r', [item('s', { condition: 'GOOD' })])])).toEqual([]);
  });
});

describe('R4 — éléments repris de l’entrée', () => {
  const entryRooms = [room('r', [furniture('tv', { label: 'Téléviseur', replacementValue: 150000 }), item('sol')])];

  it('repère un élément de l’entrée retiré du corps reçu', () => {
    const saved = [room('r', [furniture('tv'), item('sol')])];
    const incoming = [room('r', [item('sol')])];
    expect(findRemovedEntryItems(entryRooms, saved, incoming)).toEqual([{ itemId: 'tv', label: 'Téléviseur' }]);
  });

  it('laisse passer un élément déjà absent de la sortie enregistrée', () => {
    const saved = [room('r', [item('sol')])];
    expect(findRemovedEntryItems(entryRooms, saved, saved)).toEqual([]);
  });

  it('fige libellé, nature et valeur de l’entrée', () => {
    const incoming = [
      room('r', [
        furniture('tv', { label: 'Carton vide', replacementValue: 1, condition: 'MISSING', quantity: 3 }),
        item('sol', { kind: 'FIXTURE' })
      ])
    ];
    const frozen = freezeEntryFields(incoming, entryRooms);
    expect(frozen[0].items[0]).toMatchObject({
      label: 'Téléviseur',
      kind: 'FURNITURE',
      replacementValue: 150000,
      quantity: 0
    });
  });
});

describe('compareInspections — manquants et quantités (M4)', () => {
  it('CA-M4.1 — entrée GOOD, sortie MISSING : manquant, pas dégradé', () => {
    const rows = compareInspections(
      { rooms: [room('r', [item('sol', { condition: 'GOOD' })])] },
      { rooms: [room('r', [item('sol', { condition: 'MISSING' })])] }
    );
    expect(rows[0]).toMatchObject({ missing: true, degraded: false, missingQuantity: 1, kind: 'FIXTURE' });
  });

  it('CA-M4.2 — mobilier 6 → 4 en bon état : baisse de 2', () => {
    const rows = compareInspections(
      { rooms: [room('r', [furniture('ch', { condition: 'GOOD', quantity: 6, replacementValue: 15000 })])] },
      { rooms: [room('r', [furniture('ch', { condition: 'GOOD', quantity: 4 })])] }
    );
    expect(rows[0]).toMatchObject({
      quantityDecrease: 2,
      missingQuantity: 2,
      missing: false,
      entryQuantity: 6,
      exitQuantity: 4,
      missingValue: 30000
    });
  });

  it('CA-M4.3 — manquant à l’entrée et à la sortie : ni manquant ni baisse', () => {
    const rows = compareInspections(
      { rooms: [room('r', [furniture('x', { condition: 'MISSING', quantity: 0 })])] },
      { rooms: [room('r', [furniture('x', { condition: 'MISSING', quantity: 0 })])] }
    );
    expect(rows[0]).toMatchObject({ missing: false, quantityDecrease: 0, missingQuantity: 0, degraded: false });
  });

  it('CA-M4.4 — valeur des manquants : entrée d’abord, sortie à défaut, sinon nulle', () => {
    const fromEntry = compareInspections(
      { rooms: [room('r', [furniture('tv', { condition: 'GOOD', quantity: 2, replacementValue: 100 })])] },
      { rooms: [room('r', [furniture('tv', { condition: 'MISSING', replacementValue: 999 })])] }
    );
    expect(fromEntry[0]).toMatchObject({ missingQuantity: 2, replacementValue: 100, missingValue: 200 });

    const fromExit = compareInspections(
      { rooms: [room('r', [furniture('tv', { condition: 'GOOD', quantity: 1 })])] },
      { rooms: [room('r', [furniture('tv', { condition: 'MISSING', replacementValue: 50 })])] }
    );
    expect(fromExit[0].missingValue).toBe(50);

    const none = compareInspections(
      { rooms: [room('r', [furniture('tv', { condition: 'GOOD', quantity: 1 })])] },
      { rooms: [room('r', [furniture('tv', { condition: 'MISSING' })])] }
    );
    expect(none[0].missingValue).toBeNull();
  });

  it('CA-M4.5 — absent de la sortie seulement quand une sortie existe', () => {
    const entry = { rooms: [room('r', [item('a', { condition: 'GOOD' })])] };
    expect(compareInspections(entry, { rooms: [room('r', [])] })[0].absentFromExit).toBe(true);
    expect(compareInspections(entry, null)[0].absentFromExit).toBe(false);
  });

  it('CA-M4.6 — rapproche un élément déplacé d’une pièce à l’autre', () => {
    const rows = compareInspections(
      { rooms: [room('r1', [item('lampe', { condition: 'GOOD' })]), room('r2', [])] },
      { rooms: [room('r1', []), room('r2', [item('lampe', { condition: 'POOR' })])] }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ itemId: 'lampe', entryCondition: 'GOOD', exitCondition: 'POOR', degraded: true });
    expect(rows[0].absentFromExit).toBe(false);
  });
});

describe('compareSummary (R7)', () => {
  const noRows = compareInspections(null, null);

  it('CA-M4.7 — clés manquantes', () => {
    expect(compareSummary({ keysCount: 3 }, { keysCount: 2 }, noRows).keys).toEqual({ entry: 3, exit: 2, missing: 1 });
    expect(compareSummary({ keysCount: 3 }, { keysCount: 3 }, noRows).keys.missing).toBe(0);
    expect(compareSummary({ keysCount: 3 }, { keysCount: null }, noRows).keys.missing).toBeNull();
    expect(compareSummary({ keysCount: 2 }, { keysCount: 4 }, noRows).keys.missing).toBe(0);
  });

  it('CA-M4.8 — différence des compteurs, espaces insécables et virgule', () => {
    const up = compareSummary(
      { meters: { electricity: '12 345' } },
      { meters: { electricity: '12\u00a0980' } },
      noRows
    );
    expect(up.meters.electricity).toEqual({ entry: '12 345', exit: '12\u00a0980', difference: 635 });
    const down = compareSummary({ meters: { electricity: '12 980' } }, { meters: { electricity: '12 345' } }, noRows);
    expect(down.meters.electricity.difference).toBe(-635);
    const text = compareSummary({ meters: { water: 'illisible' } }, { meters: { water: '10' } }, noRows);
    expect(text.meters.water.difference).toBeNull();
    expect(text.meters.gas).toEqual({ entry: null, exit: null, difference: null });
    expect(parseMeterReading('1 234,5')).toBe(1234.5);
    expect(parseMeterReading('12\u202f000')).toBe(12000);
  });

  it('compte manquants, baisses, dégradés, absents et valeurs', () => {
    const rows = compareInspections(
      {
        rooms: [
          room('r', [
            furniture('tv', { condition: 'GOOD', quantity: 1, replacementValue: 150000 }),
            furniture('ch', { condition: 'GOOD', quantity: 6 }),
            item('sol', { condition: 'GOOD' }),
            item('mur', { condition: 'GOOD' })
          ])
        ]
      },
      {
        rooms: [
          room('r', [
            furniture('tv', { condition: 'MISSING' }),
            furniture('ch', { condition: 'GOOD', quantity: 4 }),
            item('sol', { condition: 'POOR' })
          ])
        ]
      }
    );
    const summary = compareSummary(null, null, rows);
    expect(summary).toMatchObject({
      missingCount: 1,
      quantityDecreaseCount: 1,
      degradedCount: 1,
      absentFromExitCount: 1,
      missingValueTotal: 150000,
      missingWithoutValueCount: 1
    });
  });
});
