import dayjs from 'dayjs';

/**
 * La lecture du classeur — **dans le navigateur, et nulle part ailleurs**.
 *
 * Le fichier n'est jamais envoyé. `exceljs` est déjà une dépendance de
 * `apps/web`, chargée à la demande (`await import`) comme le fait
 * `utils/export-utils.ts` : la page d'importation ne pèse donc rien tant
 * qu'aucun fichier n'est ouvert. Seules les lignes que la personne a validées
 * partent au serveur, en données propres, par les services existants.
 *
 * Aucun endpoint d'écriture nouveau, aucun stockage de fichier : il n'y a
 * rien à nettoyer après un import raté.
 */

export interface FeuilleLue {
  /** Le nom de la première feuille — affiché, pour qu'on sache laquelle on lit. */
  nomFeuille: string;
  /** Les en-têtes, dans l'ordre du fichier. Une colonne sans titre reçoit le sien. */
  colonnes: string[];
  /**
   * Les lignes de données, déjà en TEXTE, chacune avec SON numéro dans le
   * fichier — jamais son rang dans ce tableau. Une ligne vide sautée au
   * milieu ne doit pas décaler l'annonce : « ligne 12 » désigne la ligne 12
   * du tableur, celle que la personne a sous les yeux.
   */
  lignes: Array<{ numero: number; cellules: string[] }>;
  /** Numéro, dans le fichier, de la ligne d'en-têtes. */
  ligneEntetes: number;
}

/**
 * Le texte d'une cellule, tel que la personne doit le voir.
 *
 * **Tout devient texte, et c'est délibéré.** L'aperçu se modifie sur place :
 * une cellule corrigée à la main est du texte, et il serait absurde que la
 * même valeur suive deux chemins de conversion selon qu'elle vient du fichier
 * ou du clavier. Une seule route, donc : cellule → texte → `evaluerLigne`.
 *
 * Les formes rendues par `exceljs` et traitées ici : la formule (on prend son
 * résultat, jamais sa formule), le texte enrichi, le lien hypertexte, la date
 * et le nombre.
 */
export function texteDeCellule(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';
  if (valeur instanceof Date) return dayjs(valeur).format('DD/MM/YYYY');
  if (typeof valeur === 'string') return valeur.trim();
  if (typeof valeur === 'number' || typeof valeur === 'boolean') return String(valeur);

  const objet = valeur as Record<string, unknown>;

  // Formule : `{ formula, result }`. Le résultat, jamais la formule.
  if ('result' in objet) return texteDeCellule(objet.result);
  // Erreur de formule : `{ error: '#DIV/0!' }`. On rend le code tel quel,
  // l'aperçu le signalera comme illisible plutôt que de le taire.
  if ('error' in objet) return String(objet.error);
  // Texte enrichi : `{ richText: [{ text }] }`.
  if (Array.isArray(objet.richText)) {
    return (objet.richText as Array<{ text?: unknown }>)
      .map(morceau => String(morceau.text ?? ''))
      .join('')
      .trim();
  }
  // Lien hypertexte : `{ text, hyperlink }`.
  if ('text' in objet) return texteDeCellule(objet.text);

  return String(valeur);
}

/**
 * Lit la PREMIÈRE feuille d'un classeur, et rend ses en-têtes et ses lignes.
 *
 * « La page lit la première feuille, prend la première ligne non vide comme
 * en-têtes » : les lignes vides d'en-tête décoratif — un titre, un logo, une
 * ligne blanche — sont sautées jusqu'à trouver une ligne qui porte au moins
 * deux valeurs, ou une seule si c'est tout ce qu'il y a.
 *
 * Une ligne entièrement vide au milieu du tableau est ignorée, mais **son
 * numéro continue de compter** : l'aperçu annonce « ligne 12 » en parlant de
 * la ligne 12 du fichier, celle que la personne voit dans son tableur.
 */
export async function lireClasseur(fichier: File | Blob): Promise<FeuilleLue> {
  const ExcelJS = await import('exceljs');
  const classeur = new ExcelJS.Workbook();
  await classeur.xlsx.load(await fichier.arrayBuffer());

  const feuille = classeur.worksheets[0];
  if (!feuille) {
    throw new Error('CLASSEUR_SANS_FEUILLE');
  }

  const brutes: Array<{ numero: number; cellules: string[] }> = [];
  feuille.eachRow({ includeEmpty: false }, (ligne, numero) => {
    const valeurs = Array.isArray(ligne.values) ? ligne.values.slice(1) : [];
    brutes.push({ numero, cellules: valeurs.map(texteDeCellule) });
  });

  const indexEntetes = brutes.findIndex(ligne => ligne.cellules.some(cellule => cellule !== ''));
  if (indexEntetes === -1) {
    throw new Error('CLASSEUR_VIDE');
  }

  const entetes = brutes[indexEntetes];
  // Une colonne sans titre existe quand même : sans nom, elle serait
  // invisible au rapprochement et sa donnée perdue sans que rien ne le dise.
  const colonnes = entetes.cellules.map((cellule, index) => (cellule !== '' ? cellule : `Colonne ${index + 1}`));

  const lignes = brutes
    .slice(indexEntetes + 1)
    .filter(ligne => ligne.cellules.some(cellule => cellule !== ''))
    .map(ligne => ({
      numero: ligne.numero,
      cellules: colonnes.map((_, index) => ligne.cellules[index] ?? '')
    }));

  return {
    nomFeuille: feuille.name,
    colonnes,
    lignes,
    ligneEntetes: entetes.numero
  };
}
