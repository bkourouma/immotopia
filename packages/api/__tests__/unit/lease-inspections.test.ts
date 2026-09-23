import { compareInspections, defaultRooms, InspectionRoom } from '../../src/lib/lease-inspections/service';

/**
 * États des lieux — lot 5 (section B) de la gestion locative.
 *
 * `defaultRooms` et `compareInspections` sont pures : pas de base, pas de
 * mock. Elles portent la règle la plus délicate du lot — les identifiants de
 * pièce et d'élément sont fournis par le client et doivent rester stables
 * entre l'entrée et la sortie pour que la comparaison ait un sens.
 */

describe('defaultRooms', () => {
  it("donne les pièces et éléments attendus, dans l'ordre du contrat", () => {
    const rooms = defaultRooms();
    expect(rooms.map(r => r.name)).toEqual(['Entrée/Séjour', 'Cuisine', 'Chambre 1', 'Salle de bain', 'WC']);

    const sejour = rooms.find(r => r.name === 'Entrée/Séjour')!;
    expect(sejour.items.map(i => i.label)).toEqual([
      'Sol',
      'Murs',
      'Plafond',
      'Portes',
      'Fenêtres',
      'Prises et interrupteurs',
      'Éclairage'
    ]);

    const cuisine = rooms.find(r => r.name === 'Cuisine')!;
    expect(cuisine.items.map(i => i.label)).toEqual([
      ...sejour.items.map(i => i.label),
      'Évier et robinetterie',
      'Placards'
    ]);

    const chambre = rooms.find(r => r.name === 'Chambre 1')!;
    expect(chambre.items.map(i => i.label)).toEqual([...sejour.items.map(i => i.label), 'Placards']);

    const sdb = rooms.find(r => r.name === 'Salle de bain')!;
    expect(sdb.items.map(i => i.label)).toEqual([
      'Sol',
      'Murs',
      'Douche ou baignoire',
      'Lavabo',
      'Robinetterie',
      'Ventilation'
    ]);

    const wc = rooms.find(r => r.name === 'WC')!;
    expect(wc.items.map(i => i.label)).toEqual(['Sol', 'Murs', "Cuvette et chasse d'eau"]);
  });

  it('donne à chaque pièce et chaque élément un identifiant unique', () => {
    const rooms = defaultRooms();
    const roomIds = rooms.map(r => r.id);
    expect(new Set(roomIds).size).toBe(roomIds.length);

    const itemIds = rooms.flatMap(r => r.items.map(i => i.id));
    expect(new Set(itemIds).size).toBe(itemIds.length);
  });

  it('part tous les états et commentaires vides', () => {
    const rooms = defaultRooms();
    for (const room of rooms) {
      for (const item of room.items) {
        expect(item.condition).toBeNull();
        expect(item.comment).toBeNull();
      }
    }
  });

  it('renvoie un nouveau jeu d’identifiants à chaque appel', () => {
    const first = defaultRooms();
    const second = defaultRooms();
    expect(first[0].id).not.toBe(second[0].id);
    expect(first[0].items[0].id).not.toBe(second[0].items[0].id);
  });
});

function room(id: string, name: string, items: InspectionRoom['items']): InspectionRoom {
  return { id, name, items };
}

describe('compareInspections', () => {
  it('marque dégradé seulement quand la sortie est strictement moins bonne', () => {
    const entry = {
      rooms: [
        room('room-1', 'Séjour', [
          { id: 'item-1', label: 'Sol', condition: 'GOOD' as const, comment: null },
          { id: 'item-2', label: 'Murs', condition: 'NEW' as const, comment: null }
        ])
      ]
    };
    const exit = {
      rooms: [
        room('room-1', 'Séjour', [
          { id: 'item-1', label: 'Sol', condition: 'POOR' as const, comment: null },
          { id: 'item-2', label: 'Murs', condition: 'NEW' as const, comment: null }
        ])
      ]
    };

    const rows = compareInspections(entry, exit);
    expect(rows).toEqual([
      {
        roomId: 'room-1',
        roomName: 'Séjour',
        itemId: 'item-1',
        label: 'Sol',
        entryCondition: 'GOOD',
        exitCondition: 'POOR',
        degraded: true
      },
      {
        roomId: 'room-1',
        roomName: 'Séjour',
        itemId: 'item-2',
        label: 'Murs',
        entryCondition: 'NEW',
        exitCondition: 'NEW',
        degraded: false
      }
    ]);
  });

  it("ne marque pas dégradé quand la sortie est meilleure ou égale, dans l'ordre NEW > GOOD > FAIR > POOR > BROKEN", () => {
    const entry = {
      rooms: [room('r', 'Chambre', [{ id: 'i', label: 'Sol', condition: 'POOR' as const, comment: null }])]
    };
    const better = {
      rooms: [room('r', 'Chambre', [{ id: 'i', label: 'Sol', condition: 'GOOD' as const, comment: null }])]
    };
    expect(compareInspections(entry, better)[0].degraded).toBe(false);
  });

  it("ne marque pas dégradé si l'un des deux états est manquant", () => {
    const entry = { rooms: [room('r', 'Chambre', [{ id: 'i', label: 'Sol', condition: null, comment: null }])] };
    const exit = {
      rooms: [room('r', 'Chambre', [{ id: 'i', label: 'Sol', condition: 'BROKEN' as const, comment: null }])]
    };
    expect(compareInspections(entry, exit)[0].degraded).toBe(false);
    expect(compareInspections(entry, exit)[0].entryCondition).toBeNull();
    expect(compareInspections(entry, exit)[0].exitCondition).toBe('BROKEN');
  });

  it("respecte l'ordre des pièces de l'entrée, puis ajoute ce qui n'existe que côté sortie", () => {
    const entry = {
      rooms: [
        room('r1', 'Séjour', [{ id: 'i1', label: 'Sol', condition: 'GOOD' as const, comment: null }]),
        room('r2', 'Cuisine', [{ id: 'i2', label: 'Sol', condition: 'GOOD' as const, comment: null }])
      ]
    };
    const exit = {
      rooms: [
        room('r1', 'Séjour', [{ id: 'i1', label: 'Sol', condition: 'GOOD' as const, comment: null }]),
        room('r2', 'Cuisine', [{ id: 'i2', label: 'Sol', condition: 'GOOD' as const, comment: null }]),
        room('r3', 'Balcon (ajouté avant finalisation)', [
          { id: 'i3', label: 'Sol', condition: 'FAIR' as const, comment: null }
        ])
      ]
    };

    const rows = compareInspections(entry, exit);
    expect(rows.map(r => r.itemId)).toEqual(['i1', 'i2', 'i3']);
    expect(rows[2]).toMatchObject({ entryCondition: null, exitCondition: 'FAIR', degraded: false });
  });

  it('renvoie un tableau vide quand aucun des deux états des lieux n’existe', () => {
    expect(compareInspections(null, null)).toEqual([]);
  });

  it("ne renvoie que les lignes de sortie quand il n'y a pas d'entrée", () => {
    const exit = {
      rooms: [room('r', 'Séjour', [{ id: 'i', label: 'Sol', condition: 'GOOD' as const, comment: null }])]
    };
    const rows = compareInspections(null, exit);
    expect(rows).toEqual([
      {
        roomId: 'r',
        roomName: 'Séjour',
        itemId: 'i',
        label: 'Sol',
        entryCondition: null,
        exitCondition: 'GOOD',
        degraded: false
      }
    ]);
  });
});
