import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveBlob = vi.fn();
vi.mock('../../../utils/save-blob', () => ({ saveBlob: (...args: unknown[]) => saveBlob(...args) }));

import { lireClasseur } from '../../../lib/importation/classeur';
import { estLigneExemple, MARQUEUR_EXEMPLE } from '../../../lib/importation/gabarit-constantes';
import {
  construireGabarit,
  NOM_FEUILLE_AIDE,
  NOM_FEUILLE_IMPORT,
  nomFichierGabarit,
  telechargerGabarit
} from '../../../lib/importation/gabarits';
import type { DescripteurNature } from '../../../lib/importation/types';

// Fixture sans liste statique : `entreesReferentiel` ne gère pas encore
// typesBien/modesTransaction/methodesValorisation à ce stade.
const descripteur: DescripteurNature = {
  cle: 'patrimoine-biens',
  libelle: 'Biens',
  description: 'Crée des biens.',
  chantier: 'sans',
  referentiels: [],
  enregistrer: async () => undefined,
  champs: [
    { cle: 'titre', libelle: 'Titre du bien', obligatoire: true, type: 'texte', entetes: [], exemple: 'Villa Cocody' },
    { cle: 'prix', libelle: 'Prix', obligatoire: false, type: 'montant', entetes: [], exemple: '1 250 000,50' },
    {
      cle: 'commune',
      libelle: 'Commune',
      obligatoire: false,
      type: 'reference',
      referentiel: 'communes',
      entetes: [],
      aide: 'Nom de la commune',
      exemple: 'Cocody'
    }
  ]
};

async function tamponDe(blob: Blob): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(lecteur.result as ArrayBuffer);
    lecteur.onerror = () => reject(lecteur.error);
    lecteur.readAsArrayBuffer(blob);
  });
}

async function lire(blob: Blob): Promise<ExcelJS.Workbook> {
  const classeur = new ExcelJS.Workbook();
  await classeur.xlsx.load(await tamponDe(blob));
  return classeur;
}

describe('nomFichierGabarit', () => {
  it('dérive un nom ASCII de la clé', () => {
    expect(nomFichierGabarit(descripteur)).toBe('gabarit-import-patrimoine-biens.xlsx');
    expect(nomFichierGabarit({ ...descripteur, cle: 'Valorisations é' })).toBe(
      'gabarit-import-patrimoine-valorisations-e.xlsx'
    );
  });
});

describe('construireGabarit', () => {
  it('écrit la feuille Import en première position avec les en-têtes exacts', async () => {
    const classeur = await lire(await construireGabarit(descripteur));
    const feuille = classeur.worksheets[0];
    expect(feuille.name).toBe(NOM_FEUILLE_IMPORT);
    expect(feuille.getRow(1).values).toEqual([undefined, 'Titre du bien', 'Prix', 'Commune']);
    expect(feuille.getCell('A1').font?.bold).toBe(true);
    expect(feuille.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    const note = feuille.getCell('A1').note as { texts?: Array<{ text: string }> } | string;
    const texteNote = typeof note === 'string' ? note : (note.texts ?? []).map(m => m.text).join('');
    expect(texteNote).toContain('obligatoire');
  });

  it('distingue le fond des colonnes obligatoires', async () => {
    const feuille = (await lire(await construireGabarit(descripteur))).worksheets[0];
    const fond = (adresse: string) => (feuille.getCell(adresse).fill as { fgColor?: { argb?: string } }).fgColor?.argb;
    expect(fond('A1')).not.toBe(fond('B1'));
  });

  it('écrit une ligne d’exemple marquée, en italique', async () => {
    const feuille = (await lire(await construireGabarit(descripteur))).worksheets[0];
    expect(feuille.getCell('A2').value).toBe(`${MARQUEUR_EXEMPLE} Villa Cocody`);
    expect(feuille.getCell('B2').value).toBe('1 250 000,50');
    expect(feuille.getCell('A2').font?.italic).toBe(true);
  });

  it('ajoute une feuille Aide avec le tableau des colonnes', async () => {
    const classeur = await lire(await construireGabarit(descripteur));
    const aide = classeur.getWorksheet(NOM_FEUILLE_AIDE);
    expect(aide).toBeDefined();
    const lignes: string[][] = [];
    aide!.eachRow(ligne => lignes.push((ligne.values as unknown[]).slice(1).map(v => String(v ?? ''))));
    const entete = lignes.findIndex(l => l[0] === 'Colonne');
    expect(entete).toBeGreaterThan(0);
    expect(lignes[entete]).toEqual(['Colonne', 'Obligatoire', 'Type attendu', 'Valeurs autorisées', 'Précision']);
    expect(lignes[entete + 1].slice(0, 3)).toEqual(['Titre du bien', 'Oui', 'Texte']);
    expect(lignes[entete + 3][0]).toBe('Commune');
    expect(lignes[entete + 3][3]).toBe('Nom de la commune');
  });

  it('n’écrit aucune formule', async () => {
    const classeur = await lire(await construireGabarit(descripteur));
    classeur.eachSheet(feuille =>
      feuille.eachRow(ligne => ligne.eachCell(cellule => expect(cellule.type).not.toBe(ExcelJS.ValueType.Formula)))
    );
  });

  it('neutralise une valeur de descripteur qui commencerait par une formule', async () => {
    const piege: DescripteurNature = {
      ...descripteur,
      champs: [{ ...descripteur.champs[0], libelle: '=A1', exemple: '=1+1' }]
    };
    const feuille = (await lire(await construireGabarit(piege))).worksheets[0];
    expect(feuille.getCell('A1').type).not.toBe(ExcelJS.ValueType.Formula);
    expect(feuille.getCell('A1').value).toBe("'=A1");
    expect(feuille.getCell('A2').value).toBe(`${MARQUEUR_EXEMPLE} =1+1`);
  });

  it('se relit avec lireClasseur : la ligne d’exemple est détectée', async () => {
    const tampon = await tamponDe(await construireGabarit(descripteur));
    const fichier = { arrayBuffer: async () => tampon } as unknown as Blob;
    const feuille = await lireClasseur(fichier);
    expect(feuille.nomFeuille).toBe(NOM_FEUILLE_IMPORT);
    expect(feuille.colonnes).toEqual(['Titre du bien', 'Prix', 'Commune']);
    expect(feuille.lignes).toHaveLength(1);
    expect(estLigneExemple(feuille.lignes[0].cellules)).toBe(true);
  });
});

describe('telechargerGabarit', () => {
  beforeEach(() => saveBlob.mockClear());

  it('construit puis enregistre le classeur', async () => {
    await telechargerGabarit(descripteur);
    expect(saveBlob).toHaveBeenCalledTimes(1);
    const [blob, nom] = saveBlob.mock.calls[0] as [Blob, string];
    expect(blob.size).toBeGreaterThan(0);
    expect(nom).toBe('gabarit-import-patrimoine-biens.xlsx');
  });
});
