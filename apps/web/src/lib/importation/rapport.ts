import { t } from '../../i18n/t';
import { saveBlob } from '../../utils/save-blob';
import { neutraliserFormule } from './formules';

/**
 * Le rapport CSV de fin d'import : une ligne par ligne du fichier, avec son
 * statut et son motif. Les cellules d'origine viennent du fichier de
 * l'utilisateur : toutes passent par `neutraliserFormule` avant l'échappement.
 */

export type StatutLigneRapport =
  'importee' | 'ignoree' | 'en_erreur' | 'refusee_serveur' | 'partielle' | 'hors_quota' | 'non_traitee';

export interface LigneRapport {
  /** Numéro de la ligne dans le fichier. */
  numero: number;
  statut: StatutLigneRapport;
  motif: string;
  /** Ex. la référence attribuée par ImmoTopia (aussi pour une ligne « partielle »). */
  detail: string | null;
  /** Cellules d'origine, par clé de champ. */
  textes: Record<string, string>;
}

export interface ChampRapport {
  cle: string;
  libelle: string;
}

const SEPARATEUR = ';';
const BOM = '﻿';

export function libelleStatut(statut: StatutLigneRapport): string {
  switch (statut) {
    case 'importee':
      return t('Importée');
    case 'ignoree':
      return t('Ignorée');
    case 'en_erreur':
      return t('En erreur');
    case 'refusee_serveur':
      return t('Refusée par le serveur');
    case 'partielle':
      return t('Partielle : bien créé, valorisation à ajouter');
    case 'hors_quota':
      return t('Hors quota');
    case 'non_traitee':
      return t('Non traitée');
  }
}

/** Neutralise une éventuelle formule, puis échappe selon la RFC 4180. */
function cellule(valeur: string | number | null | undefined): string {
  const texte = String(neutraliserFormule(valeur));
  const guillemets = texte.includes(SEPARATEUR) || /["\r\n\t]/.test(texte);
  return guillemets ? `"${texte.replace(/"/g, '""')}"` : texte;
}

export function construireRapportCsv(lignes: LigneRapport[], champs: ChampRapport[]): string {
  const entetes = [t('Ligne'), t('Statut'), t('Motif'), t('Détail'), ...champs.map(champ => champ.libelle)];
  const corps = [...lignes]
    .sort((a, b) => a.numero - b.numero)
    .map(ligne => [
      ligne.numero,
      libelleStatut(ligne.statut),
      ligne.motif,
      ligne.detail,
      ...champs.map(champ => ligne.textes[champ.cle] ?? '')
    ]);
  const rangees = [entetes, ...corps].map(rangee => rangee.map(cellule).join(SEPARATEUR));
  return BOM + rangees.join('\r\n');
}

function dateIso(date: Date): string {
  const deuxChiffres = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${deuxChiffres(date.getMonth() + 1)}-${deuxChiffres(date.getDate())}`;
}

export function nomFichierRapport(nomFichierSource: string, maintenant: Date = new Date()): string {
  const sansExtension = nomFichierSource.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  const assaini = sansExtension
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 60);
  return `rapport-import-${assaini || 'fichier'}-${dateIso(maintenant)}.csv`;
}

export function telechargerRapportCsv(lignes: LigneRapport[], champs: ChampRapport[], nomFichierSource: string): void {
  const blob = new Blob([construireRapportCsv(lignes, champs)], { type: 'text/csv;charset=utf-8' });
  saveBlob(blob, nomFichierRapport(nomFichierSource));
}
