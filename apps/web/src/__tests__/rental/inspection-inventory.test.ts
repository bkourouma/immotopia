import { describe, it, expect } from 'vitest';
import type { InspectionItem, InspectionRoom } from '../../services/lease-inspections-service';
import {
  CONDITION_ORDER,
  compareItemPair,
  conditionColor,
  conditionLabel,
  countUnevaluated,
  isDegraded,
  isItemEvaluated,
  isMissing,
  itemKind
} from '../../components/rental/inspections/inspection-constants';
import {
  countMissingWithoutDeduction,
  EntryLookup,
  missingKeys,
  proposeDeductions
} from '../../components/rental/inspections/deduction-proposals';

/**
 * Spec 040, volet meublés — règles pures de l'écran des états des lieux :
 * statut « Manquant », élément évalué, proposition des retenues (M5).
 */

function item(id: string, overrides: Partial<InspectionItem> = {}): InspectionItem {
  return { id, label: id, condition: null, comment: null, ...overrides };
}

function furniture(id: string, overrides: Partial<InspectionItem> = {}): InspectionItem {
  return item(id, { kind: 'FURNITURE', quantity: 1, replacementValue: null, ...overrides });
}

function lookup(rooms: InspectionRoom[]): Map<string, EntryLookup> {
  const map = new Map<string, EntryLookup>();
  for (const room of rooms) for (const i of room.items) map.set(i.id, { item: i, roomName: room.name });
  return map;
}

describe('inspection-constants — statut « Manquant »', () => {
  it('ajoute « Manquant » en dernier, avec sa propre couleur violette', () => {
    expect(CONDITION_ORDER).toEqual(['NEW', 'GOOD', 'FAIR', 'POOR', 'BROKEN', 'MISSING']);
    expect(conditionLabel('MISSING')).toBe('Manquant');
    expect(conditionColor('MISSING')).toBe('#722ed1');
    expect(conditionColor('MISSING')).not.toBe(conditionColor('BROKEN'));
  });

  it('ne compte jamais un manquant comme dégradé', () => {
    expect(isDegraded('GOOD', 'MISSING')).toBe(false);
    expect(isDegraded('MISSING', 'BROKEN')).toBe(false);
    expect(isDegraded('GOOD', 'POOR')).toBe(true);
    expect(isMissing('GOOD', 'MISSING')).toBe(true);
    expect(isMissing('MISSING', 'MISSING')).toBe(false);
  });

  it('traite un élément sans nature comme du bâti', () => {
    expect(itemKind(item('a'))).toBe('FIXTURE');
    expect(itemKind(furniture('b'))).toBe('FURNITURE');
  });

  it('évalue : état requis ; quantité requise pour un mobilier non manquant', () => {
    expect(isItemEvaluated(item('a'))).toBe(false);
    expect(isItemEvaluated(item('a', { condition: 'GOOD' }))).toBe(true);
    expect(isItemEvaluated(furniture('b', { condition: 'GOOD', quantity: null }))).toBe(false);
    expect(isItemEvaluated(furniture('b', { condition: 'MISSING', quantity: null }))).toBe(true);
    const rooms = [
      {
        id: 'r',
        name: 'Séjour',
        items: [item('a'), item('b', { condition: 'NEW' }), furniture('c', { condition: 'FAIR', quantity: null })]
      }
    ];
    expect(countUnevaluated(rooms)).toBe(2);
  });

  it('calcule manquant et baisse de quantité comme l’API', () => {
    expect(
      compareItemPair(
        furniture('c', { condition: 'GOOD', quantity: 6 }),
        furniture('c', { condition: 'GOOD', quantity: 4 })
      )
    ).toMatchObject({
      missing: false,
      quantityDecrease: 2,
      missingQuantity: 2
    });
    expect(compareItemPair(item('s', { condition: 'GOOD' }), item('s', { condition: 'MISSING' }))).toMatchObject({
      missing: true,
      missingQuantity: 1
    });
  });
});

describe('proposeDeductions (M5)', () => {
  const entryRooms: InspectionRoom[] = [
    {
      id: 'r',
      name: 'Entrée/Séjour',
      items: [
        furniture('tv', { label: 'Téléviseur', condition: 'GOOD', quantity: 1, replacementValue: 150000 }),
        furniture('ch', { label: 'Chaises', condition: 'GOOD', quantity: 6, replacementValue: 15000 }),
        furniture('lampe', { label: 'Lampes', condition: 'GOOD', quantity: 2 }),
        item('sol', { label: 'Sol', condition: 'GOOD' }),
        item('mur', { label: 'Murs', condition: 'GOOD' })
      ]
    }
  ];
  const exitRooms: InspectionRoom[] = [
    {
      id: 'r',
      name: 'Entrée/Séjour',
      items: [
        furniture('tv', { label: 'Téléviseur', condition: 'MISSING', quantity: 0, replacementValue: 150000 }),
        furniture('ch', { label: 'Chaises', condition: 'GOOD', quantity: 4, replacementValue: 15000 }),
        furniture('lampe', { label: 'Lampes', condition: 'MISSING', quantity: 0 }),
        item('sol', { label: 'Sol', condition: 'POOR' }),
        item('mur', { label: 'Murs', condition: 'GOOD' })
      ]
    }
  ];

  function propose(existing = [] as Parameters<typeof proposeDeductions>[0]['existing']) {
    return proposeDeductions({
      rooms: exitRooms,
      entryItemsById: lookup(entryRooms),
      entryKeysCount: 3,
      exitKeysCount: 2,
      existing
    });
  }

  it('CA-M5.1 — manquant : valeur de remplacement × quantité', () => {
    const tv = propose().find(line => line.itemId === 'tv');
    expect(tv).toMatchObject({
      label: 'Entrée/Séjour — Téléviseur : 1 manquant(s)',
      amount: 150000,
      proposedAmount: 150000,
      source: 'MISSING',
      roomId: 'r'
    });
  });

  it('CA-M5.2 — baisse de quantité : 2 sur 6 à 15 000', () => {
    expect(propose().find(line => line.itemId === 'ch')).toMatchObject({
      label: 'Entrée/Séjour — Chaises : 2 manquant(s) sur 6',
      amount: 30000,
      proposedAmount: 30000,
      source: 'MISSING'
    });
  });

  it('CA-M5.3 — manquant sans valeur : montant 0, proposition nulle', () => {
    expect(propose().find(line => line.itemId === 'lampe')).toMatchObject({
      label: 'Entrée/Séjour — Lampes : 2 manquant(s)',
      amount: 0,
      proposedAmount: null,
      source: 'MISSING'
    });
  });

  it('CA-M5.4 — dégradé : ligne à 0 FCFA, source DEGRADED', () => {
    expect(propose().find(line => line.itemId === 'sol')).toMatchObject({
      label: 'Entrée/Séjour — Sol (dégradé)',
      amount: 0,
      source: 'DEGRADED'
    });
    expect(propose().find(line => line.itemId === 'mur')).toBeUndefined();
  });

  it('CA-M5.5 — clés : une ligne à 0 FCFA, sans élément', () => {
    const keys = propose().filter(line => line.source === 'KEYS');
    expect(keys).toEqual([expect.objectContaining({ label: 'Clés manquantes : 1', amount: 0, itemId: null })]);
    expect(missingKeys(3, 3)).toBe(0);
    expect(missingKeys(3, null)).toBeNull();
  });

  it('CA-M5.6 — un second clic n’ajoute aucun doublon', () => {
    const first = propose();
    expect(first).toHaveLength(5);
    expect(propose(first)).toEqual([]);
  });

  it('CA-M5.8 — compte les manquants sans retenue', () => {
    expect(countMissingWithoutDeduction(exitRooms, lookup(entryRooms), [])).toBe(3);
    const withTv = [{ id: 'd', label: 'x', amount: 1, itemId: 'tv' }];
    expect(countMissingWithoutDeduction(exitRooms, lookup(entryRooms), withTv)).toBe(2);
  });

  it('ignore un élément ajouté seulement à la sortie et marqué Manquant, comme la synthèse de l’API', () => {
    const exitWithAddition: InspectionRoom[] = [
      {
        ...exitRooms[0],
        items: [
          ...exitRooms[0].items,
          furniture('micro', {
            label: 'Four à micro-ondes',
            condition: 'MISSING',
            quantity: 0,
            replacementValue: 40000
          }),
          item('store', { label: 'Store', condition: 'MISSING' })
        ]
      }
    ];
    const proposals = proposeDeductions({
      rooms: exitWithAddition,
      entryItemsById: lookup(entryRooms),
      entryKeysCount: 3,
      exitKeysCount: 3,
      existing: []
    });
    expect(proposals.map(line => line.itemId)).toEqual(['tv', 'ch', 'lampe', 'sol']);
    expect(countMissingWithoutDeduction(exitWithAddition, lookup(entryRooms), [])).toBe(3);
  });
});
