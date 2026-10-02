import { describe, expect, it } from 'vitest';
import {
  ErreurFichier,
  LIMITES_IMPORT,
  detecterSeparateur,
  inspecterArchiveXlsx,
  lireFichier,
  messageErreurFichier,
  parserCsv,
  type CodeErreurFichier
} from '../../../lib/importation/fichier';

const csv = (contenu: string | Uint8Array, nom = 'biens.csv') => new File([contenu as BlobPart], nom);

async function code(promesse: Promise<unknown>): Promise<ErreurFichier> {
  try {
    await promesse;
  } catch (e) {
    expect(e).toBeInstanceOf(ErreurFichier);
    return e as ErreurFichier;
  }
  throw new Error('une ErreurFichier était attendue');
}

async function xlsx(lignes: unknown[][], nom = 'biens.xlsx'): Promise<File> {
  const ExcelJS = await import('exceljs');
  const classeur = new ExcelJS.Workbook();
  const feuille = classeur.addWorksheet('Biens');
  lignes.forEach(ligne => feuille.addRow(ligne));
  const tampon = await classeur.xlsx.writeBuffer();
  return new File([tampon as ArrayBuffer], nom);
}

/** Un zip minimal : seulement le répertoire central, avec les tailles déclarées. */
function zip(
  entrees: Array<{ nom: string; taille: number }>,
  falsification: { declarees?: number; tailleRepertoire?: number } = {}
): Uint8Array {
  const noms = entrees.map(e => new TextEncoder().encode(e.nom));
  const total = 4 + noms.reduce((s, n) => s + 46 + n.length, 0) + 22;
  const octets = new Uint8Array(total);
  const vue = new DataView(octets.buffer);
  octets.set([0x50, 0x4b, 3, 4]); // en-tête de fichier local (le répertoire central suit)
  let p = 4;
  entrees.forEach((e, i) => {
    vue.setUint32(p, 0x02014b50, true);
    vue.setUint32(p + 24, e.taille, true);
    vue.setUint16(p + 28, noms[i].length, true);
    octets.set(noms[i], p + 46);
    p += 46 + noms[i].length;
  });
  vue.setUint32(p, 0x06054b50, true);
  vue.setUint16(p + 10, falsification.declarees ?? entrees.length, true);
  vue.setUint32(p + 12, falsification.tailleRepertoire ?? p - 4, true);
  vue.setUint32(p + 16, 4, true);
  return octets;
}

describe('lireFichier — CSV', () => {
  it.each([
    [';', 'Titre;Prix\nVilla;100\n'],
    [',', 'Titre,Prix\nVilla,100\n'],
    ['\t', 'Titre\tPrix\nVilla\t100\n']
  ])('lit le séparateur %j', async (separateur, contenu) => {
    const lu = await lireFichier(csv(contenu));
    expect(lu.format).toBe('csv');
    expect(lu.separateur).toBe(separateur);
    expect(lu.colonnes).toEqual(['Titre', 'Prix']);
    expect(lu.lignes).toEqual([{ numero: 2, cellules: ['Villa', '100'] }]);
    expect(lu.nomFeuille).toBe('biens');
    expect(lu.ligneEntetes).toBe(1);
  });

  it('lit les accents UTF-8 et retire le BOM', async () => {
    const lu = await lireFichier(csv('﻿Titre;Ville\nVilla;Abidjan Cocody é\n'));
    expect(lu.encodage).toBe('utf-8');
    expect(lu.colonnes[0]).toBe('Titre');
    expect(lu.lignes[0].cellules[1]).toBe('Abidjan Cocody é');
  });

  it('se replie sur windows-1252', async () => {
    const octets = new Uint8Array([...'Titre;Ville\nVilla;Bouak'].map(c => c.charCodeAt(0)).concat([0xe9]));
    const lu = await lireFichier(csv(octets));
    expect(lu.encodage).toBe('windows-1252');
    expect(lu.lignes[0].cellules[1]).toBe('Bouaké');
  });

  it('gère guillemets, séparateur, guillemet doublé et saut de ligne dans un champ', async () => {
    const lu = await lireFichier(csv('Titre;Note\r\n"A;B";"il dit ""oui""\nsuite"\r\nVilla;x\r\n'));
    expect(lu.lignes[0].cellules).toEqual(['A;B', 'il dit "oui"\nsuite']);
    // Le champ multi-ligne occupe les lignes 2 et 3 : la suivante est la 4.
    expect(lu.lignes[1].numero).toBe(4);
  });

  it('ignore les lignes vides mais compte leur numéro', async () => {
    const lu = await lireFichier(csv('Titre;Prix\nA;1\n\n;;\nB;2\n'));
    expect(lu.lignes.map(l => l.numero)).toEqual([2, 5]);
  });

  it('saute les lignes vides avant les en-têtes et nomme les colonnes sans titre', async () => {
    const lu = await lireFichier(csv('\n\nTitre;;Prix\nA;b;1\n'));
    expect(lu.ligneEntetes).toBe(3);
    expect(lu.colonnes).toEqual(['Titre', 'Colonne 2', 'Prix']);
  });

  it('aligne les lignes courtes et rogne les cellules', async () => {
    const lu = await lireFichier(csv('A;B;C\n  x  ;y\n'));
    expect(lu.lignes[0].cellules).toEqual(['x', 'y', '']);
  });

  it('accepte les fins de ligne CR seules', () => {
    expect(parserCsv('a;b\rc;d', ';')).toEqual([
      ['a', 'b'],
      ['c', 'd']
    ]);
  });

  it('détecte le séparateur hors guillemets, égalité et absence vers « ; »', () => {
    expect(detecterSeparateur('"a;b;c",d,e\n')).toBe(',');
    expect(detecterSeparateur('a;b,c\n')).toBe(';');
    expect(detecterSeparateur('abc\n')).toBe(';');
  });

  it('ne rend jamais une formule ou une injection autrement que comme du texte', async () => {
    const lu = await lireFichier(csv("Titre;Prix\n=1+1;=cmd|' /C calc'!A0\n"));
    expect(lu.lignes[0].cellules).toEqual(['=1+1', "=cmd|' /C calc'!A0"]);
  });
});

describe('lireFichier — refus', () => {
  it('refuse un fichier vide', async () => {
    expect((await code(lireFichier(csv('')))).code).toBe('FICHIER_VIDE');
  });

  it('refuse plus de 5 Mo avant de lire', async () => {
    const gros = csv(new Uint8Array(LIMITES_IMPORT.tailleMaxOctets + 1));
    expect((await code(lireFichier(gros))).code).toBe('FICHIER_TROP_GROS');
  });

  it('refuse un classeur à macros', async () => {
    expect((await code(lireFichier(csv('x', 'a.xlsm')))).code).toBe('MACRO_REFUSEE');
    expect((await code(lireFichier(csv('x', 'a.XLTM')))).code).toBe('MACRO_REFUSEE');
  });

  it('refuse une extension inconnue', async () => {
    expect((await code(lireFichier(csv('x', 'a.xls')))).code).toBe('FORMAT_NON_SUPPORTE');
    expect((await code(lireFichier(csv('x', 'a.txt')))).code).toBe('FORMAT_NON_SUPPORTE');
  });

  it('refuse un fichier sans ligne de données', async () => {
    expect((await code(lireFichier(csv('Titre;Prix\n')))).code).toBe('CLASSEUR_VIDE');
  });

  it('refuse plus de 1000 lignes en CSV', async () => {
    const contenu = 'A\n' + 'x\n'.repeat(LIMITES_IMPORT.lignesMax + 1);
    const e = await code(lireFichier(csv(contenu)));
    expect(e.code).toBe('TROP_DE_LIGNES');
    expect(e.details).toEqual({ lignes: 1001, max: 1000, auMoins: 1 });
    expect(messageErreurFichier(e)).toContain('plus de 1 000 lignes');
  });

  it('accepte exactement 1000 lignes', async () => {
    const lu = await lireFichier(csv('A\n' + 'x\n'.repeat(LIMITES_IMPORT.lignesMax)));
    expect(lu.lignes).toHaveLength(1000);
  });

  it('refuse plus de 60 colonnes', async () => {
    const entetes = Array.from({ length: 61 }, (_, i) => `c${i}`).join(';');
    expect((await code(lireFichier(csv(`${entetes}\n1\n`)))).code).toBe('TROP_DE_COLONNES');
  });

  it('refuse une cellule trop longue, avec sa ligne et sa colonne', async () => {
    const e = await code(lireFichier(csv(`Titre;Note\nA;${'x'.repeat(2001)}\n`)));
    expect(e.code).toBe('CELLULE_TROP_LONGUE');
    expect(e.details).toMatchObject({ ligne: 2, colonne: 'Note' });
  });
});

describe('lireFichier — xlsx', () => {
  it('lit un classeur nominal, formule rendue par son résultat', async () => {
    const ExcelJS = await import('exceljs');
    const classeur = new ExcelJS.Workbook();
    const feuille = classeur.addWorksheet('Biens');
    feuille.addRow(['Titre', 'Prix', 'Total']);
    feuille.addRow(['Villa', 100, { formula: 'B2*2', result: 200 }]);
    const fichier = new File([(await classeur.xlsx.writeBuffer()) as ArrayBuffer], 'biens.xlsx');

    const lu = await lireFichier(fichier);
    expect(lu.format).toBe('xlsx');
    expect(lu.nomFeuille).toBe('Biens');
    expect(lu.colonnes).toEqual(['Titre', 'Prix', 'Total']);
    expect(lu.lignes).toEqual([{ numero: 2, cellules: ['Villa', '100', '200'] }]);
  });

  it('garde du texte brut pour une cellule d’injection', async () => {
    const lu = await lireFichier(await xlsx([['Titre'], ["=cmd|' /C calc'!A0"]]));
    expect(lu.lignes[0].cellules[0]).toBe("=cmd|' /C calc'!A0");
  });

  it('refuse plus de 1000 lignes et plus de 60 colonnes', async () => {
    const lignes = [['A'], ...Array.from({ length: 1001 }, () => ['x'])];
    expect((await code(lireFichier(await xlsx(lignes)))).code).toBe('TROP_DE_LIGNES');
    const large = [Array.from({ length: 61 }, (_, i) => `c${i}`), Array.from({ length: 61 }, () => 'x')];
    expect((await code(lireFichier(await xlsx(large)))).code).toBe('TROP_DE_COLONNES');
  });

  it('refuse un classeur sans donnée', async () => {
    expect((await code(lireFichier(await xlsx([['Titre']])))).code).toBe('CLASSEUR_VIDE');
  });

  it('refuse un xlsx corrompu', async () => {
    const faux = csv(new Uint8Array([1, 2, 3, 4, 5, 6]), 'a.xlsx');
    expect((await code(lireFichier(faux))).code).toBe('FICHIER_ILLISIBLE');
    const tronque = csv(new Uint8Array([0x50, 0x4b, 3, 4, 9, 9, 9, 9]), 'a.xlsx');
    expect((await code(lireFichier(tronque))).code).toBe('FICHIER_ILLISIBLE');
  });

  it('refuse une archive qui déclare une taille décompressée énorme', async () => {
    const bombe = zip([{ nom: 'xl/worksheets/sheet1.xml', taille: 0xfffffff0 }]);
    const e = await code(lireFichier(csv(bombe, 'bombe.xlsx')));
    expect(e.code).toBe('FICHIER_ILLISIBLE');
    expect(e.details).toMatchObject({ octetsDecompresses: 0xfffffff0 });
  });
});

describe('inspecterArchiveXlsx', () => {
  it('compte les entrées et additionne les tailles déclarées', () => {
    const r = inspecterArchiveXlsx(
      zip([
        { nom: 'a.xml', taille: 10 },
        { nom: 'b.xml', taille: 20 }
      ])
    );
    expect(r).toMatchObject({ entrees: 2, tailleDecompressee: 30, noms: ['a.xml', 'b.xml'] });
  });

  it('refuse une somme au-delà de 50 Mo', () => {
    const demi = LIMITES_IMPORT.zipDecompresseMaxOctets / 2 + 1;
    const e = (() => {
      try {
        inspecterArchiveXlsx(
          zip([
            { nom: 'a', taille: demi },
            { nom: 'b', taille: demi }
          ])
        );
      } catch (x) {
        return x as ErreurFichier;
      }
      return undefined;
    })();
    expect(e?.code).toBe('FICHIER_ILLISIBLE');
  });

  it('refuse trop d’entrées', () => {
    const entrees = Array.from({ length: LIMITES_IMPORT.entreesZipMax + 1 }, (_, i) => ({ nom: `f${i}`, taille: 1 }));
    expect(() => inspecterArchiveXlsx(zip(entrees))).toThrow(ErreurFichier);
  });

  it('refuse une archive sans EOCD', () => {
    expect(() => inspecterArchiveXlsx(new Uint8Array(100))).toThrow(ErreurFichier);
  });

  it('refuse vbaProject.bin', () => {
    const bin = zip([{ nom: 'xl/vbaProject.bin', taille: 5 }]);
    expect(() => inspecterArchiveXlsx(bin)).toThrow(expect.objectContaining({ code: 'MACRO_REFUSEE' }));
  });
});

describe('inspecterArchiveXlsx — archive falsifiée', () => {
  it('la limite de taille décompressée est de 20 Mo', () => {
    expect(LIMITES_IMPORT.zipDecompresseMaxOctets).toBe(20 * 1024 * 1024);
  });

  it('refuse un compteur d’entrées inférieur au nombre réel', () => {
    const faux = zip(
      [
        { nom: 'a.xml', taille: 1 },
        { nom: 'b.xml', taille: 1 }
      ],
      { declarees: 1 }
    );
    expect(() => inspecterArchiveXlsx(faux)).toThrow(expect.objectContaining({ code: 'FICHIER_ILLISIBLE' }));
  });

  it('refuse un compteur supérieur au nombre réel', () => {
    const faux = zip([{ nom: 'a.xml', taille: 1 }], { declarees: 2 });
    expect(() => inspecterArchiveXlsx(faux)).toThrow(expect.objectContaining({ code: 'FICHIER_ILLISIBLE' }));
  });

  it('refuse une taille de répertoire central qui ne tombe pas sur l’EOCD', () => {
    const faux = zip(
      [
        { nom: 'a.xml', taille: 1 },
        { nom: 'b.xml', taille: 1 }
      ],
      { tailleRepertoire: 60 }
    );
    expect(() => inspecterArchiveXlsx(faux)).toThrow(expect.objectContaining({ code: 'FICHIER_ILLISIBLE' }));
  });

  it('refuse vbaProject.bin même au-delà du compteur déclaré', () => {
    const faux = zip(
      [
        { nom: 'a.xml', taille: 1 },
        { nom: 'xl/vbaProject.bin', taille: 1 }
      ],
      { declarees: 1 }
    );
    expect(() => inspecterArchiveXlsx(faux)).toThrow(expect.objectContaining({ code: 'MACRO_REFUSEE' }));
  });

  it('refuse vbaProject.bin avec un séparateur antislash ou en tête', () => {
    for (const nom of ['xl\\vbaProject.bin', 'vbaProject.bin', 'XL/VBAPROJECT.BIN']) {
      expect(() => inspecterArchiveXlsx(zip([{ nom, taille: 1 }]))).toThrow(
        expect.objectContaining({ code: 'MACRO_REFUSEE' })
      );
    }
  });

  it('dit la limite, pas « corrompu », pour une archive trop grosse ou trop fournie', () => {
    const grosse = zip([{ nom: 'a', taille: 0xfffffff0 }]);
    const messageTaille = (() => {
      try {
        inspecterArchiveXlsx(grosse);
      } catch (e) {
        return messageErreurFichier(e);
      }
      return '';
    })();
    expect(messageTaille).toContain('20 Mo');
    expect(messageTaille).not.toContain('corrompu');

    const nombreuses = Array.from({ length: LIMITES_IMPORT.entreesZipMax + 1 }, (_, i) => ({
      nom: `f${i}`,
      taille: 1
    }));
    const messageEntrees = (() => {
      try {
        inspecterArchiveXlsx(zip(nombreuses));
      } catch (e) {
        return messageErreurFichier(e);
      }
      return '';
    })();
    expect(messageEntrees).toContain('300');
    expect(messageEntrees).not.toContain('corrompu');
  });
});

describe('lireFichier — bornes anticipées et colonnes vides', () => {
  it('interrompt un CSV géant dès la ligne en trop', async () => {
    const contenu = 'A\n' + 'x\n'.repeat(200000);
    const e = await code(lireFichier(csv(contenu)));
    expect(e.code).toBe('TROP_DE_LIGNES');
    expect(e.details).toMatchObject({ max: 1000, auMoins: 1 });
  });

  it('interrompt un CSV fait de lignes vides en masse', async () => {
    const contenu = 'A\nx\n' + '\n'.repeat(50000);
    expect((await code(lireFichier(csv(contenu)))).code).toBe('TROP_DE_LIGNES');
  });

  it('lit un xlsx dont une colonne d’en-tête est vide au milieu', async () => {
    const ExcelJS = await import('exceljs');
    const classeur = new ExcelJS.Workbook();
    const feuille = classeur.addWorksheet('Biens');
    feuille.getCell('A1').value = 'Titre';
    feuille.getCell('C1').value = 'Prix';
    feuille.getCell('A2').value = 'Villa';
    feuille.getCell('C2').value = 100;
    const fichier = new File([(await classeur.xlsx.writeBuffer()) as ArrayBuffer], 'trou.xlsx');

    const lu = await lireFichier(fichier);
    expect(lu.colonnes).toEqual(['Titre', 'Colonne 2', 'Prix']);
    expect(lu.lignes).toEqual([{ numero: 2, cellules: ['Villa', '', '100'] }]);
  });
});

describe('messageErreurFichier', () => {
  const message = (c: CodeErreurFichier, d?: Record<string, number | string>) =>
    messageErreurFichier(new ErreurFichier(c, d));

  it('donne un français lisible avec les chiffres', () => {
    expect(message('TROP_DE_LIGNES', { lignes: 1523, max: 1000 })).toBe(
      'Ce fichier compte 1 523 lignes, le maximum est 1 000. Importez-le en plusieurs fois.'
    );
    expect(message('CELLULE_TROP_LONGUE', { ligne: 12, colonne: 'Titre' })).toContain('ligne 12, colonne « Titre »');
    expect(message('FICHIER_TROP_GROS', { octets: 6 * 1024 * 1024 })).toContain('6 Mo');
  });

  it('ne rend jamais un code brut', () => {
    const codes: CodeErreurFichier[] = [
      'FICHIER_VIDE',
      'FICHIER_TROP_GROS',
      'FORMAT_NON_SUPPORTE',
      'MACRO_REFUSEE',
      'TROP_DE_LIGNES',
      'TROP_DE_COLONNES',
      'CELLULE_TROP_LONGUE',
      'FICHIER_ILLISIBLE',
      'CLASSEUR_VIDE'
    ];
    for (const c of codes) expect(message(c)).not.toMatch(/[A-Z]+_[A-Z_]+|\{\{/);
  });

  it('donne un message générique pour une erreur inconnue', () => {
    expect(messageErreurFichier(new Error('boom'))).toContain('ne peut pas être lu');
  });
});
