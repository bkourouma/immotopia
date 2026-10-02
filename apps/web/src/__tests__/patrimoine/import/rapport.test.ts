import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveBlob = vi.fn();
vi.mock('../../../utils/save-blob', () => ({ saveBlob: (...args: unknown[]) => saveBlob(...args) }));

import {
  construireRapportCsv,
  libelleStatut,
  nomFichierRapport,
  telechargerRapportCsv,
  type LigneRapport
} from '../../../lib/importation/rapport';

const champs = [
  { cle: 'titre', libelle: 'Titre' },
  { cle: 'ville', libelle: 'Commune' }
];

function ligne(partiel: Partial<LigneRapport>): LigneRapport {
  return { numero: 2, statut: 'importee', motif: '', detail: null, textes: {}, ...partiel };
}

function corps(csv: string): string[] {
  return csv.replace('﻿', '').split('\r\n');
}

describe('construireRapportCsv', () => {
  it('commence par le BOM, sépare par « ; » et termine les lignes par CRLF', () => {
    const csv = construireRapportCsv(
      [ligne({ textes: { titre: 'Villa', ville: 'Cocody' }, detail: 'BIEN-1' })],
      champs
    );
    expect(csv.startsWith('﻿')).toBe(true);
    expect(corps(csv)).toEqual(['Ligne;Statut;Motif;Détail;Titre;Commune', '2;Importée;;BIEN-1;Villa;Cocody']);
  });

  it('une ligne partielle porte la référence du bien créé dans le détail', () => {
    const csv = construireRapportCsv(
      [ligne({ statut: 'partielle', motif: 'Valorisation refusée.', detail: 'IMM-0007', textes: { titre: 'Villa' } })],
      champs
    );
    expect(corps(csv)[1]).toBe('2;Partielle : bien créé, valorisation à ajouter;Valorisation refusée.;IMM-0007;Villa;');
  });

  it('trie par numéro croissant', () => {
    const csv = construireRapportCsv([ligne({ numero: 9 }), ligne({ numero: 3 }), ligne({ numero: 5 })], champs);
    expect(
      corps(csv)
        .slice(1)
        .map(l => l.split(';')[0])
    ).toEqual(['3', '5', '9']);
  });

  it('neutralise les formules dans le motif ET dans les textes d’origine', () => {
    const csv = construireRapportCsv(
      [
        ligne({
          statut: 'en_erreur',
          motif: '=HYPERLINK("http://x";"a")',
          detail: '@SUM(A1)',
          textes: { titre: '-2+3', ville: '\tcmd' }
        })
      ],
      champs
    );
    expect(csv).toContain(`"'=HYPERLINK(""http://x"";""a"")"`);
    expect(csv).toContain(`'@SUM(A1)`);
    expect(csv).toContain(`;'-2+3;`);
    expect(csv).toContain(`"'\tcmd"`);
  });

  it('laisse un nombre négatif pur intact', () => {
    const csv = construireRapportCsv([ligne({ textes: { titre: '-350000' } })], champs);
    expect(corps(csv)[1]).toContain(';-350000;');
  });

  it('échappe « ; », guillemets et sauts de ligne selon la RFC 4180', () => {
    const csv = construireRapportCsv([ligne({ motif: 'a;b "c"\nd' })], champs);
    expect(csv).toContain('"a;b ""c""\nd"');
  });

  it('conserve les accents', () => {
    const csv = construireRapportCsv([ligne({ textes: { titre: 'Résidence Élégance' } })], champs);
    expect(csv).toContain('Résidence Élégance');
  });

  it('complète les champs absents par une cellule vide', () => {
    const csv = construireRapportCsv([ligne({ textes: { titre: 'X' } })], champs);
    expect(corps(csv)[1]).toBe('2;Importée;;;X;');
  });
});

describe('libelleStatut', () => {
  it('libelle la ligne partielle', () => {
    expect(libelleStatut('partielle')).toBe('Partielle : bien créé, valorisation à ajouter');
  });

  it('libelle les six statuts', () => {
    expect(libelleStatut('importee')).toBe('Importée');
    expect(libelleStatut('ignoree')).toBe('Ignorée');
    expect(libelleStatut('en_erreur')).toBe('En erreur');
    expect(libelleStatut('refusee_serveur')).toBe('Refusée par le serveur');
    expect(libelleStatut('hors_quota')).toBe('Hors quota');
    expect(libelleStatut('non_traitee')).toBe('Non traitée');
  });
});

describe('nomFichierRapport', () => {
  const date = new Date(2026, 8, 5);

  it('retire l’extension et ajoute la date', () => {
    expect(nomFichierRapport('biens.xlsx', date)).toBe('rapport-import-biens-2026-09-05.csv');
  });

  it('assainit les séparateurs, « .. », espaces et accents', () => {
    const nom = nomFichierRapport('../..\\Mes biens été.2026.xlsx', date);
    expect(nom).not.toMatch(/[\\/\s]|\.\./);
    expect(nom).toBe('rapport-import-Mes-biens-ete-2026-2026-09-05.csv');
  });

  it('prévoit un nom de repli', () => {
    expect(nomFichierRapport('///.csv', date)).toBe('rapport-import-fichier-2026-09-05.csv');
  });
});

describe('telechargerRapportCsv', () => {
  beforeEach(() => saveBlob.mockClear());

  it('enregistre un Blob text/csv', () => {
    telechargerRapportCsv([ligne({})], champs, 'biens.xlsx');
    expect(saveBlob).toHaveBeenCalledTimes(1);
    const [blob, nom] = saveBlob.mock.calls[0] as [Blob, string];
    expect(blob.type).toBe('text/csv;charset=utf-8');
    expect(nom).toMatch(/^rapport-import-biens-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
