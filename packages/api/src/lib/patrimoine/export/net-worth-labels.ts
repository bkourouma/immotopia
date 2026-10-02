import { t, type Language } from '../../../i18n';
import { ASSET_CLASS_LABELS, type AssetClassKey } from '../assets';

/**
 * Libellés de l'export de la situation patrimoniale (fr/en/ar). Le texte
 * français est la clé de traduction ; `language` explicite pour que le PDF
 * force le français quand la requête est en arabe (voir `net-worth-pdf.ts`).
 */

export function assetClassLabel(assetClass: string, language?: Language): string {
  const label = ASSET_CLASS_LABELS[assetClass as AssetClassKey];
  return label ? t(label, undefined, language) : assetClass;
}

export function exclusionReasonLabel(reason: string, language?: Language): string {
  switch (reason) {
    case 'NO_VALUATION':
      return t('Sans valeur', undefined, language);
    case 'MISSING_EXCHANGE_RATE':
      return t('Taux de change manquant', undefined, language);
    case 'DISPOSED':
      return t('Cédé', undefined, language);
    case 'ARCHIVED':
      return t('Archivé', undefined, language);
    default:
      return reason;
  }
}

export function reliabilityLabel(level: string | null, language?: Language): string {
  if (level === 'HIGH') return t('Élevée', undefined, language);
  if (level === 'MEDIUM') return t('Moyenne', undefined, language);
  if (level === 'LOW') return t('Faible', undefined, language);
  return t('Non renseignée', undefined, language);
}
