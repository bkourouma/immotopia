import { t } from '../i18n/t';

/**
 * Libellé métier en français d'un code de module (`MODULE_AGENCY`,
 * `MODULE_SYNDIC`, `MODULE_PROMOTER`).
 *
 * Plusieurs écrans affichaient ces codes bruts tels quels (onglet Activité et
 * Statistiques de la fiche agence super-admin, `/admin/statistics`) —
 * BUG-2026-09-28-002 et -003.
 *
 * Fonction, pas un objet construit au niveau du module : `t()` ne réagit pas
 * au changement de langue (voir `components/admin/TenantCreatedResult.tsx`,
 * qui documente déjà ce piège) — un dictionnaire figé à l'import resterait
 * dans la langue du premier chargement.
 */
export function getModuleKeyLabelFr(key: string): string {
  switch (key) {
    case 'MODULE_AGENCY':
      return t('Agence');
    case 'MODULE_SYNDIC':
      return t('Syndic');
    case 'MODULE_PROMOTER':
      return t('Promoteur');
    default:
      return key;
  }
}
