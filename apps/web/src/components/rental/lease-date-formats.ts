import { dateFormat } from '../../i18n/format';

/**
 * Formats d'un champ de date du formulaire de bail. Le premier sert à
 * l'affichage (celui de la langue), les suivants à l'analyse d'une saisie au
 * clavier : jj/mm/aaaa, j/m/aaaa et l'ISO restent compris (BUG-2026-11-03-012).
 */
export const formatsSaisieDate = (): string[] => [dateFormat('short'), 'D/M/YYYY', 'YYYY-MM-DD'];
