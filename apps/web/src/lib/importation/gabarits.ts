import type { Alignment, Cell, Fill, Font, Worksheet } from 'exceljs';
import { t } from '../../i18n/t';
import { saveBlob } from '../../utils/save-blob';
import { MARQUEUR_EXEMPLE } from './gabarit-constantes';
import { neutraliserFormule } from './formules';
import { entreesReferentiel } from './referentiel';
import type { ChampDocument, DescripteurNature, TypeChamp } from './types';
import { REFERENTIEL_VIDE } from './types';

/**
 * Le gabarit Excel téléchargeable d'une nature : une feuille « Import » (la
 * première, celle que lit l'import) et une feuille « Aide ».
 *
 * Les en-têtes de la feuille « Import » sont le libellé français BRUT du
 * champ, jamais passé par `t()` : un changement de langue casserait sinon le
 * rapprochement. Aucune formule ni macro n'est écrite ; toute valeur texte
 * passe par `neutraliserFormule`. Le fichier est construit dans le navigateur
 * (exceljs chargé à la demande) et ne part jamais au serveur.
 */

export const NOM_FEUILLE_IMPORT = 'Import';
export const NOM_FEUILLE_AIDE = 'Aide';

const FOND_OBLIGATOIRE = 'FFFCE4B6';
const FOND_FACULTATIF = 'FFE6EEF8';
const FOND_TITRE_AIDE = 'FFD9D9D9';
const GRIS_EXEMPLE = 'FF7F7F7F';

export function nomFichierGabarit(descripteur: DescripteurNature): string {
  const cle = descripteur.cle
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const racine = cle.startsWith('patrimoine') ? cle : `patrimoine-${cle}`;
  return `gabarit-import-${racine || 'patrimoine'}.xlsx`;
}

function libelleType(type: TypeChamp): string {
  switch (type) {
    case 'texte':
      return t('Texte');
    case 'montant':
      return t('Montant');
    case 'quantite':
      return t('Quantité');
    case 'entier':
      return t('Entier');
    case 'date':
      return t('Date');
    case 'periode':
      return t('Période');
    case 'reference':
      return t('Choix dans une liste');
  }
}

function formatAttendu(type: TypeChamp): string {
  switch (type) {
    case 'montant':
    case 'quantite':
      return t('Nombre, par exemple 1 250 000,50');
    case 'entier':
      return t('Nombre entier');
    case 'date':
      return t('Date au format JJ/MM/AAAA');
    case 'periode':
      return t('Période, par exemple 03/2025');
    case 'reference':
      return t('Valeur choisie dans la liste');
    default:
      return t('Texte libre');
  }
}

/** Les valeurs autorisées d'un champ, en texte (liste statique ou aide). */
function valeursAutorisees(champ: ChampDocument): string {
  if (champ.type !== 'reference') return '';
  const entrees = champ.referentiel ? entreesReferentiel(champ.referentiel, REFERENTIEL_VIDE) : [];
  if (entrees.length > 0) return entrees.map(entree => entree.libelle).join(' ; ');
  return champ.aide ?? t("Nom exact tel qu'il figure dans l'application");
}

function noteEntete(champ: ChampDocument): string {
  const lignes = [formatAttendu(champ.type)];
  if (champ.obligatoire) lignes.push(t('Colonne obligatoire'));
  const valeurs = valeursAutorisees(champ);
  if (valeurs) lignes.push(`${t('Valeurs autorisées')} : ${valeurs}`);
  return lignes.join('\n');
}

function texteCellule(valeur: string): string {
  return String(neutraliserFormule(valeur));
}

function fond(argb: string): Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function styleEntete(cellule: Cell, champ: ChampDocument): void {
  cellule.font = { bold: true } satisfies Partial<Font>;
  cellule.fill = fond(champ.obligatoire ? FOND_OBLIGATOIRE : FOND_FACULTATIF);
  cellule.alignment = { vertical: 'middle', wrapText: true } satisfies Partial<Alignment>;
  cellule.note = texteCellule(noteEntete(champ));
}

function ecrireFeuilleImport(feuille: Worksheet, champs: ChampDocument[]): void {
  feuille.columns = champs.map(champ => ({ width: Math.min(Math.max(champ.libelle.length + 6, 16), 40) }));
  const entetes = feuille.getRow(1);
  champs.forEach((champ, index) => {
    const cellule = entetes.getCell(index + 1);
    cellule.value = texteCellule(champ.libelle);
    styleEntete(cellule, champ);
  });
  entetes.height = 24;

  const exemple = feuille.getRow(2);
  let marquee = false;
  champs.forEach((champ, index) => {
    const texte = champ.exemple ?? '';
    const cellule = exemple.getCell(index + 1);
    if (texte !== '') {
      cellule.value = texteCellule(marquee ? texte : `${MARQUEUR_EXEMPLE} ${texte}`);
      marquee = true;
    }
    cellule.font = { italic: true, color: { argb: GRIS_EXEMPLE } } satisfies Partial<Font>;
  });
  feuille.views = [{ state: 'frozen', ySplit: 1 }];
}

function reglesAide(): string[] {
  return [
    t('Une ligne par bien ou par valorisation.'),
    t("Supprimez la ligne d'exemple (grisée, marquée [EXEMPLE]) avant l'import."),
    t('Les dates s’écrivent JJ/MM/AAAA.'),
    t('Les nombres comme « 1 250 000,50 » sont acceptés.'),
    t('1 000 lignes et 5 Mo au maximum.'),
    t('Aucune formule : une cellule qui commence par = ou @ est refusée.'),
    t('Formats acceptés : .xlsx ou .csv.')
  ];
}

function ecrireTableauAide(feuille: Worksheet, descripteur: DescripteurNature, premiereLigne: number): void {
  let ligne = premiereLigne;
  const entetes = [t('Colonne'), t('Obligatoire'), t('Type attendu'), t('Valeurs autorisées'), t('Précision')];
  entetes.forEach((texte, index) => {
    const cellule = feuille.getRow(ligne).getCell(index + 1);
    cellule.value = texteCellule(texte);
    cellule.font = { bold: true } satisfies Partial<Font>;
    cellule.fill = fond(FOND_TITRE_AIDE);
  });

  for (const champ of descripteur.champs) {
    ligne += 1;
    const valeurs = [
      champ.libelle,
      champ.obligatoire ? t('Oui') : t('Non'),
      libelleType(champ.type),
      valeursAutorisees(champ),
      champ.aide ?? ''
    ];
    valeurs.forEach((valeur, index) => {
      const cellule = feuille.getRow(ligne).getCell(index + 1);
      cellule.value = texteCellule(valeur);
      cellule.alignment = { vertical: 'top', wrapText: true } satisfies Partial<Alignment>;
    });
  }
}

function ecrireFeuilleAide(feuille: Worksheet, descripteur: DescripteurNature): void {
  feuille.columns = [{ width: 28 }, { width: 14 }, { width: 22 }, { width: 50 }, { width: 50 }];
  const titre = feuille.getRow(1).getCell(1);
  titre.value = texteCellule(`${t('Gabarit d’import')} — ${t(descripteur.libelle)}`);
  titre.font = { bold: true, size: 14 } satisfies Partial<Font>;

  let ligne = 3;
  for (const regle of reglesAide()) {
    feuille.getRow(ligne++).getCell(1).value = texteCellule(`• ${regle}`);
  }
  ecrireTableauAide(feuille, descripteur, ligne + 1);
}

export async function construireGabarit(descripteur: DescripteurNature): Promise<Blob> {
  const ExcelJS = await import('exceljs');
  const classeur = new ExcelJS.Workbook();
  ecrireFeuilleImport(classeur.addWorksheet(NOM_FEUILLE_IMPORT), descripteur.champs);
  ecrireFeuilleAide(classeur.addWorksheet(NOM_FEUILLE_AIDE), descripteur);
  const tampon = await classeur.xlsx.writeBuffer();
  return new Blob([tampon], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function telechargerGabarit(descripteur: DescripteurNature): Promise<void> {
  saveBlob(await construireGabarit(descripteur), nomFichierGabarit(descripteur));
}
