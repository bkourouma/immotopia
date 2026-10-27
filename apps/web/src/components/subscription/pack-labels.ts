import { t } from '../../i18n/t';

/**
 * Libellés commerciaux des packs d'abonnement (codes du catalogue API, `PACK` de
 * `lib/subscription/catalog.ts`). Une FONCTION, appelée au rendu : un `t()` évalué
 * à l'import resterait figé dans la langue active au chargement du module.
 */
export function packLabels(): Record<string, string> {
  return {
    AGENCE: t('Agence'),
    SYNDIC: t('Syndic'),
    PROMOTEUR: t('Promoteur'),
    INTEGRE: t('Opérateur intégré'),
    PATRIMOINE_ESSENTIEL: t('Patrimoine Essentiel'),
    PATRIMOINE_PRO: t('Patrimoine Pro'),
    PARTICULIER_GRATUIT: t('Particulier Gratuit'),
    PARTICULIER_PLUS: t('Particulier Plus')
  };
}

/** Libellé d'un pack, ou son code quand il n'est pas connu (pack ajouté au catalogue après coup). */
export function packLabel(code: string): string {
  return packLabels()[code] ?? code;
}
