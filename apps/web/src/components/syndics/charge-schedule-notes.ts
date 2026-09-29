/**
 * Les notes d'anciennes exécutions d'une programmation peuvent porter le motif brut du serveur mail
 * après le numéro de lot (« A-01 (554 5.7.1 … (domaine réservé) and cannot receive mail) ») :
 * on ne montre que le lot. Le motif brut peut contenir des parenthèses imbriquées : on l'enlève
 * jusqu'à la parenthèse fermante qui précède la virgule séparant le lot suivant (ou la fin de la ligne).
 */
const RAW_MAIL_DETAIL = / \(\d{3}\b.*?\)(?=,\s|$)/g;

export function stripRawMailDetail(line: string): string {
  return line.replace(RAW_MAIL_DETAIL, '');
}
