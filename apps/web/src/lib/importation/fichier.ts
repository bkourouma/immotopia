import { t } from '../../i18n/t';
import { lireClasseur, type FeuilleLue } from './classeur';

/**
 * La porte d'entrée du fichier : choix du format, bornes, anti-bombe.
 *
 * Tout se passe dans le navigateur. Rien n'est jamais évalué : une cellule
 * « =1+1 » reste le texte « =1+1 » (les descripteurs la refuseront plus loin),
 * et un classeur à macros n'est jamais ouvert.
 */

export const LIMITES_IMPORT = {
  tailleMaxOctets: 5 * 1024 * 1024,
  lignesMax: 1000,
  colonnesMax: 60,
  longueurCelluleMax: 2000,
  zipDecompresseMaxOctets: 20 * 1024 * 1024,
  entreesZipMax: 300
} as const;

export type CodeErreurFichier =
  | 'FICHIER_VIDE'
  | 'FICHIER_TROP_GROS'
  | 'FORMAT_NON_SUPPORTE'
  | 'MACRO_REFUSEE'
  | 'TROP_DE_LIGNES'
  | 'TROP_DE_COLONNES'
  | 'CELLULE_TROP_LONGUE'
  | 'FICHIER_ILLISIBLE'
  | 'CLASSEUR_VIDE';

export class ErreurFichier extends Error {
  code: CodeErreurFichier;
  details?: Record<string, number | string>;

  constructor(code: CodeErreurFichier, details?: Record<string, number | string>) {
    super(code);
    this.name = 'ErreurFichier';
    this.code = code;
    this.details = details;
  }
}

export interface FichierLu extends FeuilleLue {
  format: 'xlsx' | 'csv';
  separateur?: ';' | ',' | '\t';
  encodage?: 'utf-8' | 'windows-1252';
}

type Separateur = ';' | ',' | '\t';

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

function formaterNombre(valeur: number | string | undefined): string {
  if (typeof valeur !== 'number') return String(valeur ?? '');
  // Espace ordinaire : les espaces insécables fines compliquent les copier-coller.
  return valeur.toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ');
}

export function messageErreurFichier(erreur: unknown): string {
  if (!(erreur instanceof ErreurFichier)) {
    return t('Ce fichier ne peut pas être lu. Vérifiez qu’il s’agit bien d’un classeur .xlsx ou d’un fichier .csv.');
  }
  const d = erreur.details ?? {};
  switch (erreur.code) {
    case 'FICHIER_VIDE':
      return t('Ce fichier est vide.');
    case 'FICHIER_TROP_GROS':
      return t('Ce fichier est trop volumineux : {{taille}} Mo, le maximum est {{max}} Mo.', {
        taille: formaterNombre(
          typeof d.octets === 'number' ? Math.round((d.octets / 1024 / 1024) * 10) / 10 : d.octets
        ),
        max: formaterNombre(LIMITES_IMPORT.tailleMaxOctets / 1024 / 1024)
      });
    case 'FORMAT_NON_SUPPORTE':
      return t('Ce format de fichier n’est pas pris en charge. Utilisez un classeur .xlsx ou un fichier .csv.');
    case 'MACRO_REFUSEE':
      return t(
        'Les classeurs à macros (.xlsm, .xlsb, .xltm) sont refusés pour des raisons de sécurité. Enregistrez-le au format .xlsx ou .csv.'
      );
    case 'TROP_DE_LIGNES':
      if (d.auMoins) {
        return t('Ce fichier compte plus de {{max}} lignes. Importez-le en plusieurs fois.', {
          max: formaterNombre(d.max ?? LIMITES_IMPORT.lignesMax)
        });
      }
      return t('Ce fichier compte {{lignes}} lignes, le maximum est {{max}}. Importez-le en plusieurs fois.', {
        lignes: formaterNombre(d.lignes),
        max: formaterNombre(d.max ?? LIMITES_IMPORT.lignesMax)
      });
    case 'TROP_DE_COLONNES':
      return t('Ce fichier compte {{colonnes}} colonnes, le maximum est {{max}}.', {
        colonnes: formaterNombre(d.colonnes),
        max: formaterNombre(d.max ?? LIMITES_IMPORT.colonnesMax)
      });
    case 'CELLULE_TROP_LONGUE':
      return t(
        'Une cellule dépasse {{max}} caractères (ligne {{ligne}}, colonne « {{colonne}} »). Raccourcissez son contenu.',
        {
          max: formaterNombre(d.max ?? LIMITES_IMPORT.longueurCelluleMax),
          ligne: formaterNombre(d.ligne),
          colonne: String(d.colonne ?? '')
        }
      );
    case 'CLASSEUR_VIDE':
      return t('Ce fichier ne contient aucune ligne de données.');
    case 'FICHIER_ILLISIBLE':
      if (typeof d.entrees === 'number') {
        return t(
          'Ce classeur contient trop de fichiers internes ({{entrees}}, le maximum est {{max}}) : il est refusé.',
          {
            entrees: formaterNombre(d.entrees),
            max: formaterNombre(d.max ?? LIMITES_IMPORT.entreesZipMax)
          }
        );
      }
      if (typeof d.octetsDecompresses === 'number') {
        return t('Ce classeur est trop volumineux une fois décompressé (le maximum est {{max}} Mo) : il est refusé.', {
          max: formaterNombre(LIMITES_IMPORT.zipDecompresseMaxOctets / 1024 / 1024)
        });
      }
      return t('Ce fichier ne peut pas être lu : il est corrompu ou n’est pas un classeur valide.');
    default:
      return t('Ce fichier ne peut pas être lu : il est corrompu ou n’est pas un classeur valide.');
  }
}

/* ------------------------------------------------------------------ */
/* Archive xlsx : inspection sans décompression                        */
/* ------------------------------------------------------------------ */

export interface InspectionArchive {
  entrees: number;
  tailleDecompressee: number;
  noms: string[];
}

/**
 * Lit le répertoire central d'un zip (EOCD puis chaque entrée) pour juger de
 * sa taille décompressée DÉCLARÉE, sans rien décompresser. Lève
 * `FICHIER_ILLISIBLE` (bombe, archive tronquée) ou `MACRO_REFUSEE`.
 */
export function inspecterArchiveXlsx(octets: Uint8Array): InspectionArchive {
  const illisible = (details?: Record<string, number | string>) => new ErreurFichier('FICHIER_ILLISIBLE', details);
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);

  // EOCD : 22 octets minimum, commentaire de 65 535 octets au plus.
  let eocd = -1;
  const debut = Math.max(0, octets.length - 22 - 0xffff);
  for (let i = octets.length - 22; i >= debut; i--) {
    if (vue.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw illisible();

  const declarees = vue.getUint16(eocd + 10, true);
  const tailleRepertoire = vue.getUint32(eocd + 12, true);
  const departRepertoire = vue.getUint32(eocd + 16, true);
  if (declarees === 0xffff || tailleRepertoire === 0xffffffff || departRepertoire === 0xffffffff) {
    // Zip64 : jamais produit par un tableur courant pour moins de 5 Mo.
    throw illisible({ zip64: 1 });
  }
  const finRepertoire = departRepertoire + tailleRepertoire;
  if (finRepertoire > octets.length) throw illisible();

  // Comme JSZip : on lit les enregistrements TANT QUE la signature est là, dans
  // les bornes du répertoire central, sans croire le compteur de l'EOCD (un
  // fichier falsifié peut y déclarer 1 entrée et en porter des centaines, dont
  // un `vbaProject.bin`). Le compteur déclaré ne sert qu'à contrôler la cohérence.
  //
  // Risque résiduel, assumé (pas de dépendance jszip) : les tailles décompressées
  // lues ici sont DÉCLARÉES par l'archive, qui peut mentir ; `exceljs` peut donc
  // encore gonfler en mémoire un fichier que la personne a ouvert volontairement.
  // C'est un déni de service local limité à son onglet, sans impact sur le serveur.
  const noms: string[] = [];
  let tailleDecompressee = 0;
  let position = departRepertoire;
  while (position + 46 <= finRepertoire && vue.getUint32(position, true) === 0x02014b50) {
    tailleDecompressee += vue.getUint32(position + 24, true);
    const longueurNom = vue.getUint16(position + 28, true);
    const longueurExtra = vue.getUint16(position + 30, true);
    const longueurCommentaire = vue.getUint16(position + 32, true);
    if (position + 46 + longueurNom > finRepertoire) throw illisible();
    const nom = new TextDecoder('utf-8').decode(octets.subarray(position + 46, position + 46 + longueurNom));
    // Contrôle du nom AVANT toute limite : une macro est une macro, même au-delà du compteur.
    if (/(^|[\\/])vbaProject\.bin$/i.test(nom)) throw new ErreurFichier('MACRO_REFUSEE');
    noms.push(nom);
    position += 46 + longueurNom + longueurExtra + longueurCommentaire;
    if (noms.length > LIMITES_IMPORT.entreesZipMax) {
      throw illisible({ entrees: noms.length, max: LIMITES_IMPORT.entreesZipMax });
    }
    if (tailleDecompressee > LIMITES_IMPORT.zipDecompresseMaxOctets) {
      throw illisible({ octetsDecompresses: tailleDecompressee, max: LIMITES_IMPORT.zipDecompresseMaxOctets });
    }
  }

  if (noms.length !== declarees || position !== finRepertoire) throw illisible();
  return { entrees: noms.length, tailleDecompressee, noms };
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

/** Le séparateur de la première ligne non vide, hors guillemets. */
export function detecterSeparateur(texte: string): Separateur {
  const compte: Record<Separateur, number> = { ';': 0, ',': 0, '\t': 0 };
  let entreGuillemets = false;
  let vue = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (c === '"') {
      entreGuillemets = !entreGuillemets;
      vue = true;
    } else if (!entreGuillemets && (c === '\n' || c === '\r')) {
      if (vue) break;
    } else if (!entreGuillemets && (c === ';' || c === ',' || c === '\t')) {
      compte[c]++;
      vue = true;
    } else if (c !== ' ') {
      vue = true;
    }
  }
  const meilleur = Math.max(compte[';'], compte[','], compte['\t']);
  if (meilleur === 0 || compte[';'] === meilleur) return ';';
  return compte[','] === meilleur ? ',' : '\t';
}

interface LigneCsv {
  numero: number;
  cellules: string[];
}

/** Analyse RFC 4180 ; `numero` est la ligne PHYSIQUE où commence l'enregistrement. */
function analyserCsv(texte: string, separateur: Separateur, lignesMax?: number): LigneCsv[] {
  const lignes: LigneCsv[] = [];
  let cellules: string[] = [];
  let champ = '';
  let entreGuillemets = false;
  let ligneCourante = 1;
  let numeroDebut = 1;
  let enregistrementOuvert = false; // quelque chose a été lu sur cette ligne
  let nonVides = 0;

  const finChamp = () => {
    cellules.push(champ);
    champ = '';
  };
  const finLigne = () => {
    finChamp();
    lignes.push({ numero: numeroDebut, cellules });
    if (lignesMax !== undefined) {
      // Borne anticipée : on s'arrête au premier dépassement au lieu de tout
      // matérialiser. L'en-tête est une ligne non vide ; les lignes vides sont plafonnées à part.
      if (cellules.some(cellule => cellule.trim() !== '')) nonVides++;
      if (nonVides > lignesMax + 1 || lignes.length > lignesMax * 10 + 10) {
        throw new ErreurFichier('TROP_DE_LIGNES', { lignes: lignesMax + 1, max: lignesMax, auMoins: 1 });
      }
    }
    cellules = [];
    enregistrementOuvert = false;
  };

  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (entreGuillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') {
          champ += '"';
          i++;
        } else {
          entreGuillemets = false;
        }
      } else {
        if (c === '\n' || (c === '\r' && texte[i + 1] !== '\n')) ligneCourante++;
        champ += c;
      }
      continue;
    }
    if (c === '"' && champ === '') {
      entreGuillemets = true;
      enregistrementOuvert = true;
    } else if (c === separateur) {
      enregistrementOuvert = true;
      finChamp();
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && texte[i + 1] === '\n') i++;
      finLigne();
      ligneCourante++;
      numeroDebut = ligneCourante;
    } else {
      enregistrementOuvert = true;
      champ += c;
    }
  }
  if (enregistrementOuvert || champ !== '' || cellules.length > 0) finLigne();
  return lignes;
}

export function parserCsv(texte: string, separateur: Separateur): string[][] {
  return analyserCsv(texte, separateur).map(ligne => ligne.cellules);
}

function decoderCsv(octets: Uint8Array): { texte: string; encodage: 'utf-8' | 'windows-1252' } {
  let texte: string;
  let encodage: 'utf-8' | 'windows-1252' = 'utf-8';
  try {
    texte = new TextDecoder('utf-8', { fatal: true }).decode(octets);
  } catch {
    texte = new TextDecoder('windows-1252').decode(octets);
    encodage = 'windows-1252';
  }
  return { texte: texte.replace(/^\uFEFF/, ''), encodage };
}

function feuilleDepuisCsv(texte: string, separateur: Separateur, nomFeuille: string): FeuilleLue {
  const brutes = analyserCsv(texte, separateur, LIMITES_IMPORT.lignesMax).map(ligne => ({
    numero: ligne.numero,
    cellules: ligne.cellules.map(cellule => cellule.trim())
  }));
  const indexEntetes = brutes.findIndex(ligne => ligne.cellules.some(cellule => cellule !== ''));
  if (indexEntetes === -1) throw new ErreurFichier('CLASSEUR_VIDE');

  const entetes = brutes[indexEntetes];
  const colonnes = entetes.cellules.map((cellule, index) => (cellule !== '' ? cellule : `Colonne ${index + 1}`));
  const lignes = brutes
    .slice(indexEntetes + 1)
    .filter(ligne => ligne.cellules.some(cellule => cellule !== ''))
    .map(ligne => ({
      numero: ligne.numero,
      cellules: colonnes.map((_, index) => ligne.cellules[index] ?? '')
    }));
  return { nomFeuille, colonnes, lignes, ligneEntetes: entetes.numero };
}

/* ------------------------------------------------------------------ */
/* Lecture                                                             */
/* ------------------------------------------------------------------ */

async function lireOctets(fichier: Blob): Promise<Uint8Array> {
  if (typeof fichier.arrayBuffer === 'function') {
    return new Uint8Array(await fichier.arrayBuffer());
  }
  // jsdom ne fournit pas toujours Blob.arrayBuffer.
  return new Promise<Uint8Array>((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(new Uint8Array(lecteur.result as ArrayBuffer));
    lecteur.onerror = () => reject(lecteur.error ?? new Error('LECTURE'));
    lecteur.readAsArrayBuffer(fichier);
  });
}

function verifierBornes(feuille: FeuilleLue): void {
  const { lignesMax, colonnesMax, longueurCelluleMax } = LIMITES_IMPORT;
  if (feuille.lignes.length === 0) throw new ErreurFichier('CLASSEUR_VIDE');
  if (feuille.colonnes.length > colonnesMax) {
    throw new ErreurFichier('TROP_DE_COLONNES', { colonnes: feuille.colonnes.length, max: colonnesMax });
  }
  if (feuille.lignes.length > lignesMax) {
    throw new ErreurFichier('TROP_DE_LIGNES', { lignes: feuille.lignes.length, max: lignesMax });
  }
  for (const colonne of feuille.colonnes) {
    if (colonne.length > longueurCelluleMax) {
      throw new ErreurFichier('CELLULE_TROP_LONGUE', { ligne: feuille.ligneEntetes, colonne, max: longueurCelluleMax });
    }
  }
  for (const ligne of feuille.lignes) {
    for (let i = 0; i < ligne.cellules.length; i++) {
      if (ligne.cellules[i].length > longueurCelluleMax) {
        throw new ErreurFichier('CELLULE_TROP_LONGUE', {
          ligne: ligne.numero,
          colonne: feuille.colonnes[i],
          max: longueurCelluleMax
        });
      }
    }
  }
}

function extensionDe(nom: string): string {
  const point = nom.lastIndexOf('.');
  return point === -1 ? '' : nom.slice(point + 1).toLowerCase();
}

export async function lireFichier(fichier: File | Blob, nom?: string): Promise<FichierLu> {
  if (fichier.size === 0) throw new ErreurFichier('FICHIER_VIDE');
  if (fichier.size > LIMITES_IMPORT.tailleMaxOctets) {
    throw new ErreurFichier('FICHIER_TROP_GROS', { octets: fichier.size, max: LIMITES_IMPORT.tailleMaxOctets });
  }

  const nomFichier = nom ?? (fichier as File).name ?? '';
  const extension = extensionDe(nomFichier);
  if (['xlsm', 'xltm', 'xlsb'].includes(extension)) throw new ErreurFichier('MACRO_REFUSEE');
  if (extension !== 'xlsx' && extension !== 'csv') throw new ErreurFichier('FORMAT_NON_SUPPORTE');

  let octets: Uint8Array;
  try {
    octets = await lireOctets(fichier);
  } catch {
    throw new ErreurFichier('FICHIER_ILLISIBLE');
  }
  if (octets.length === 0) throw new ErreurFichier('FICHIER_VIDE');

  if (extension === 'csv') {
    const { texte, encodage } = decoderCsv(octets);
    const separateur = detecterSeparateur(texte);
    const nomFeuille = nomFichier.replace(/\.[^.]*$/, '');
    const feuille = feuilleDepuisCsv(texte, separateur, nomFeuille);
    verifierBornes(feuille);
    return { ...feuille, format: 'csv', separateur, encodage };
  }

  const signature =
    octets.length >= 4 && octets[0] === 0x50 && octets[1] === 0x4b && octets[2] === 3 && octets[3] === 4;
  if (!signature) throw new ErreurFichier('FICHIER_ILLISIBLE');
  inspecterArchiveXlsx(octets);

  let feuille: FeuilleLue;
  try {
    // `lireClasseur` ne demande que `arrayBuffer()` : on lui rend les octets déjà lus.
    const tampon = octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) as ArrayBuffer;
    feuille = await lireClasseur({ arrayBuffer: async () => tampon } as unknown as Blob);
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : '';
    if (message === 'CLASSEUR_VIDE' || message === 'CLASSEUR_SANS_FEUILLE') throw new ErreurFichier('CLASSEUR_VIDE');
    throw new ErreurFichier('FICHIER_ILLISIBLE');
  }
  verifierBornes(feuille);
  return { ...feuille, format: 'xlsx' };
}
