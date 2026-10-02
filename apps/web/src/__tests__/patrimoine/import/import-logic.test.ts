import { describe, expect, it, vi } from 'vitest';
import {
  appliquerPolitiqueDoublons,
  calculerCompteurs,
  construireLignesRapport,
  creerCacheEvaluation,
  evaluerAvecCache,
  exclureLignes,
  fusionnerComptesRendus,
  lignesARelancer,
  modesDeLaLigne,
  normaliserModes,
  numerosDejaTraites,
  retirerLignesExemple,
  valeurInterpretee
} from '../../../pages/patrimoine/import/import-logic';
import type { CompteRenduImport } from '../../../lib/importation/execution';
import type { LigneEvaluee } from '../../../lib/importation/types';

function ligne(numero: number, extra: Partial<LigneEvaluee> = {}): LigneEvaluee {
  return {
    numero,
    selectionnee: true,
    cellules: { titre: { texte: `Bien ${numero}`, valeur: `Bien ${numero}` } },
    erreurs: [],
    doublon: null,
    ...extra
  };
}

function compteRendu(extra: Record<string, unknown> = {}): CompteRenduImport {
  return {
    total: 0,
    creees: 0,
    echouees: [],
    decochees: 0,
    enErreur: 0,
    lignesCreees: [],
    nonTraitees: [],
    interrompue: null,
    ...extra
  } as unknown as CompteRenduImport;
}

describe('retirerLignesExemple', () => {
  it('écarte la ligne marquée et rend son numéro', () => {
    const feuille = {
      colonnes: ['a'],
      lignes: [
        { numero: 2, cellules: ['[EXEMPLE] Villa'] },
        { numero: 3, cellules: ['Villa réelle'] }
      ]
    };
    const r = retirerLignesExemple(feuille);
    expect(r.retirees).toEqual([2]);
    expect(r.feuille.lignes.map(l => l.numero)).toEqual([3]);
    expect(feuille.lignes).toHaveLength(2);
  });
});

describe('appliquerPolitiqueDoublons', () => {
  const lignes = [ligne(2), ligne(3, { doublon: 'Déjà là' }), ligne(4, { doublon: 'x', erreurs: ['mauvais'] })];

  it('ignorer : décoche le doublon sans erreur, ne touche pas aux autres', () => {
    const r = appliquerPolitiqueDoublons(lignes, 'ignorer');
    expect(r.ignoreesDoublons).toEqual([3]);
    expect(r.lignes[1].selectionnee).toBe(false);
    expect(r.lignes[2].selectionnee).toBe(true);
    expect(lignes[1].selectionnee).toBe(true);
  });

  it('refuser : le doublon passe en erreur et reste coché', () => {
    const r = appliquerPolitiqueDoublons(lignes, 'refuser');
    expect(r.ignoreesDoublons).toEqual([]);
    expect(r.lignes[1].selectionnee).toBe(true);
    expect(r.lignes[1].erreurs).toHaveLength(1);
    expect(r.lignes[1].erreurs[0]).toContain('Déjà là');
    expect(r.lignes[2].erreurs).toEqual(['mauvais']);
  });
});

describe('compteurs et exclusion', () => {
  it('décompte les hors-quota des prêtes', () => {
    const base = [
      ligne(2),
      ligne(3),
      ligne(4, { erreurs: ['e'] }),
      ligne(5, { selectionnee: false }),
      ligne(6, { doublon: 'd' })
    ];
    expect(calculerCompteurs(base, [3])).toEqual({ pretes: 2, enErreur: 1, doublons: 1, ignorees: 1, horsQuota: 1 });
  });

  it('exclureLignes décoche sans muter', () => {
    const base = [ligne(2), ligne(3)];
    const r = exclureLignes(base, [3]);
    expect(r[1].selectionnee).toBe(false);
    expect(base[1].selectionnee).toBe(true);
  });
});

describe('modes', () => {
  it('normalise français et codes', () => {
    expect(normaliserModes('Location, Vente')).toEqual(['RENTAL', 'SALE']);
    expect(normaliserModes('saisonnier; SHORT_TERM')).toEqual(['SHORT_TERM']);
    expect(normaliserModes('')).toEqual([]);
  });

  it('lit la cellule des modes', () => {
    const l = ligne(2, { cellules: { modes: { texte: 'Location', valeur: null } } });
    expect(modesDeLaLigne(l)).toEqual(['RENTAL']);
    expect(modesDeLaLigne(ligne(3))).toEqual([]);
  });
});

describe('construireLignesRapport', () => {
  it('donne exactement un statut par ligne', () => {
    const lignes = [
      ligne(2),
      ligne(3),
      ligne(4, { selectionnee: false }),
      ligne(5, { doublon: 'dup', selectionnee: false }),
      ligne(6, { erreurs: ['Prix invalide', 'Titre vide'] }),
      ligne(7),
      ligne(8),
      ligne(9)
    ];
    const rapport = construireLignesRapport({
      lignes,
      ignoreesDoublons: [5],
      horsQuota: [8],
      compteRendu: compteRendu({
        lignesCreees: [{ numero: 2, detail: 'REF-1' }],
        echouees: [{ numero: 3, motif: 'Refusé par le serveur' }]
      })
    });
    expect(rapport).toHaveLength(lignes.length);
    expect(rapport.map(r => [r.numero, r.statut])).toEqual([
      [2, 'importee'],
      [3, 'refusee_serveur'],
      [4, 'ignoree'],
      [5, 'ignoree'],
      [6, 'en_erreur'],
      [7, 'non_traitee'],
      [8, 'hors_quota'],
      [9, 'non_traitee']
    ]);
    expect(rapport[0].detail).toBe('REF-1');
    expect(rapport[1].motif).toBe('Refusé par le serveur');
    expect(rapport[3].motif).toBe('dup');
    expect(rapport[4].motif).toBe('Prix invalide ; Titre vide');
    expect(rapport[0].textes).toEqual({ titre: 'Bien 2' });
  });

  it('sans compte rendu, les lignes prêtes sont non traitées', () => {
    const r = construireLignesRapport({ lignes: [ligne(2)], ignoreesDoublons: [], horsQuota: [], compteRendu: null });
    expect(r[0].statut).toBe('non_traitee');
  });
});

describe('lignesARelancer', () => {
  const lignes = [ligne(2), ligne(3), ligne(4), ligne(5), ligne(6, { selectionnee: false })];
  const cr = compteRendu({
    creees: 1,
    lignesCreees: [{ numero: 2, detail: null }],
    echouees: [
      { numero: 3, motif: 'timeout' },
      { numero: 4, motif: 'bien créé, valorisation à ajouter', relancable: false }
    ],
    nonTraitees: [5, 6]
  });

  it('rejoue les refus relançables et les non traitées, jamais les créées ni les non relançables', () => {
    const r = lignesARelancer(lignes, cr);
    expect(r.map(l => l.numero)).toEqual([3, 5, 6]);
    expect(r.every(l => l.selectionnee)).toBe(true);
  });

  it('fusionne le résultat de la relance dans le précédent', () => {
    const relance = compteRendu({
      creees: 2,
      lignesCreees: [
        { numero: 3, detail: null },
        { numero: 5, detail: null }
      ],
      echouees: [{ numero: 6, motif: 'encore' }]
    });
    const f = fusionnerComptesRendus(cr, relance, [3, 5, 6]);
    expect(f.creees).toBe(3);
    expect(f.echouees.map(e => e.numero)).toEqual([4, 6]);
    expect(f.lignesCreees.map(l => l.numero)).toEqual([2, 3, 5]);
    expect(f.nonTraitees).toEqual([]);
  });
});

describe('rapport : lignes partielles et réponses incertaines', () => {
  it('une ligne refusée portant une référence est « partielle » et affiche la référence', () => {
    const rapport = construireLignesRapport({
      lignes: [ligne(2), ligne(3)],
      ignoreesDoublons: [],
      horsQuota: [],
      compteRendu: compteRendu({
        echouees: [
          { numero: 2, motif: 'Valorisation refusée', relancable: false, reference: 'IMM-0042' },
          { numero: 3, motif: 'Réponse du serveur non reçue', relancable: false, code: 'REPONSE_INCERTAINE' }
        ]
      })
    });
    expect(rapport[0]).toMatchObject({ statut: 'partielle', motif: 'Valorisation refusée', detail: 'IMM-0042' });
    // Sans référence : un refus serveur ordinaire, avec son motif.
    expect(rapport[1]).toMatchObject({
      statut: 'refusee_serveur',
      motif: 'Réponse du serveur non reçue',
      detail: null
    });
  });

  it('numerosDejaTraites : les créées et les non relançables, jamais les refus ordinaires', () => {
    const cr = compteRendu({
      lignesCreees: [{ numero: 2, detail: null }],
      echouees: [
        { numero: 3, motif: 'refus' },
        { numero: 4, motif: 'partielle', relancable: false, reference: 'IMM-1' },
        { numero: 5, motif: 'incertaine', relancable: false, code: 'REPONSE_INCERTAINE' }
      ]
    });
    expect(numerosDejaTraites(cr).sort()).toEqual([2, 4, 5]);
    expect(numerosDejaTraites(null)).toEqual([]);
  });
});

describe('evaluerAvecCache', () => {
  const brouillon = (numero: number, titre = `Bien ${numero}`, selectionnee = true) => ({
    numero,
    textes: { titre },
    selectionnee
  });

  it('1 000 lignes : une frappe ne réévalue que la ligne modifiée', () => {
    const evaluer = vi.fn((b: ReturnType<typeof brouillon>) => ligne(b.numero));
    const cache = creerCacheEvaluation();
    const dependances = [{}, {}];
    let brouillons = Array.from({ length: 1000 }, (_v, i) => brouillon(i + 2));

    evaluerAvecCache(cache, dependances, brouillons, evaluer);
    expect(evaluer).toHaveBeenCalledTimes(1000);

    evaluer.mockClear();
    // Comme modifierCellule : seule la ligne touchée reçoit de nouveaux textes.
    brouillons = brouillons.map(b => (b.numero === 500 ? { ...b, textes: { titre: 'Autre' } } : b));
    const resultat = evaluerAvecCache(cache, dependances, brouillons, evaluer);
    expect(evaluer).toHaveBeenCalledTimes(1);
    expect(evaluer.mock.calls[0][0].numero).toBe(500);
    expect(resultat).toHaveLength(1000);

    // Une case cochée ou décochée réévalue aussi sa ligne, et elle seule.
    evaluer.mockClear();
    brouillons = brouillons.map(b => (b.numero === 7 ? { ...b, selectionnee: false } : b));
    evaluerAvecCache(cache, dependances, brouillons, evaluer);
    expect(evaluer).toHaveBeenCalledTimes(1);
  });

  it('un changement de contexte (référentiel, date) invalide tout', () => {
    const evaluer = vi.fn((b: ReturnType<typeof brouillon>) => ligne(b.numero));
    const cache = creerCacheEvaluation();
    const brouillons = [brouillon(2), brouillon(3)];
    const descripteur = {};
    evaluerAvecCache(cache, [descripteur, { referentiel: 1 }], brouillons, evaluer);
    evaluer.mockClear();
    evaluerAvecCache(cache, [descripteur, { referentiel: 1 }], brouillons, evaluer);
    expect(evaluer).toHaveBeenCalledTimes(2); // contexte recréé : nouvelle identité
    evaluer.mockClear();
    const contexte = { referentiel: 2 };
    evaluerAvecCache(cache, [descripteur, contexte], brouillons, evaluer);
    evaluer.mockClear();
    evaluerAvecCache(cache, [descripteur, contexte], brouillons, evaluer);
    expect(evaluer).not.toHaveBeenCalled();
  });
});

describe('valeurInterpretee', () => {
  const cellule = (texte: string, valeur: string | number | null, erreur?: string) => ({ texte, valeur, erreur });

  it('montre le nombre réellement lu quand il diffère du texte saisi', () => {
    expect(valeurInterpretee('montant', cellule('10 000 FCFA', 10000))).toBe((10000).toLocaleString('fr-FR'));
    expect(valeurInterpretee('montant', cellule('1,5', 1.5))).toBeNull();
    expect(valeurInterpretee('montant', cellule('85 000 000', 85000000))).toBeNull();
    expect(valeurInterpretee('quantite', cellule('1250.5', 1250.5))).toBeNull();
    expect(valeurInterpretee('entier', cellule('3 pièces', 3))).toBe('3');
  });

  it('formate une date en JJ/MM/AAAA quand le texte est autre', () => {
    expect(valeurInterpretee('date', cellule('2022-03-15', '2022-03-15'))).toBe('15/03/2022');
    expect(valeurInterpretee('date', cellule('15/03/2022', '2022-03-15'))).toBeNull();
  });

  it('ne dit rien d’une cellule vide, en erreur ou d’un champ texte', () => {
    expect(valeurInterpretee('montant', cellule('', null))).toBeNull();
    expect(valeurInterpretee('montant', cellule('abc', null, 'pas un nombre'))).toBeNull();
    expect(valeurInterpretee('texte', cellule('Villa', 'Villa'))).toBeNull();
    expect(valeurInterpretee('montant', undefined)).toBeNull();
  });
});
