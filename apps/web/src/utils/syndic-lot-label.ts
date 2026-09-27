import { t } from '../i18n/t';

/**
 * Libellé du type de lot, partagé par tous les écrans du module syndic.
 *
 * Reprend les valeurs déjà dupliquées dans plusieurs pages (`SyndicCharges`,
 * `SyndicLots`...) — un seul endroit pour cette table de correspondance.
 */
export const LOT_TYPE_LABELS: Record<string, string> = {
  APARTMENT: 'Appartement',
  PARKING: 'Parking',
  CELLAR: 'Cave',
  OFFICE: 'Bureau',
  COMMERCIAL: 'Commerce',
  OTHER: 'Autre'
};

/**
 * Un titre de bien généré automatiquement à l'import
 * (`PROP-20260115-AB12-0001`) ne dit rien à un utilisateur : jamais affiché
 * comme libellé de lot. Même expression que celle déjà utilisée
 * ponctuellement dans `SyndicCharges.tsx` / `SyndicFinances.tsx` /
 * `SyndicRecovery.tsx` avant ce correctif.
 */
export function isTechnicalPropertyTitle(value?: string | null): boolean {
  return Boolean(value && /^PROP-\d{8}-[A-Z0-9]{4}-\d{4}$/i.test(value.trim()));
}

export interface LotLabelInput {
  lotNumber?: string | null;
  lotType?: string | null;
  generalShares?: number | null;
  property?: { title?: string | null } | null;
}

/**
 * Libellé canonique d'un lot de copropriété.
 *
 * Utilisé par tous les sélecteurs et toutes les listes de lots du module
 * syndic (appels de charges, budgets et allocations, compte copropriétaire,
 * recouvrement, incidents...), pour que le même lot s'affiche partout de la
 * même façon.
 *
 * Toujours dans cet ordre : le **numéro de lot** d'abord — c'est le seul
 * identifiant garanti, y compris pour un lot sans bien lié (autorisé depuis
 * c553f97) — puis le type, puis les tantièmes généraux, puis le titre du
 * bien lié s'il y en a un et qu'il n'est pas un identifiant technique généré
 * à l'import.
 *
 * Avant ce correctif, plusieurs écrans remplaçaient le numéro de lot par le
 * libellé du bien (propriétaire + titre) dès qu'un bien était lié, et le
 * sélecteur de lot des appels de charges (`SyndicCharges.tsx`) n'affichait
 * même rien du tout pour un lot sans bien — juste « Bien non lié » — pour
 * chacun des lots : impossible de savoir lequel on choisissait dès qu'une
 * copropriété avait plusieurs lots sans bien (constat de recette, module
 * 5.1).
 *
 * @param lot Le lot. Les champs `lotType`/`generalShares` sont optionnels :
 *   certaines réponses API plus légères (ex. le tableau de bord des retards)
 *   ne les portent pas encore — le libellé se dégrade alors gracieusement,
 *   mais commence toujours par le numéro de lot.
 * @param fallbackReference Repli si `lot` est absent ou sans numéro (ex. un
 *   `lotId` technique), pour ne jamais afficher une chaîne vide.
 */
export function formatLotLabel(lot: LotLabelInput | null | undefined, fallbackReference?: string | null): string {
  const lotNumber = lot?.lotNumber?.trim();
  const segments: string[] = [lotNumber || fallbackReference?.trim() || t('Lot inconnu')];

  const typeLabel = lot?.lotType ? LOT_TYPE_LABELS[lot.lotType] : undefined;
  if (typeLabel) {
    segments.push(typeLabel);
  }

  if (typeof lot?.generalShares === 'number' && lot.generalShares > 0) {
    segments.push(t('{{shares}} tantièmes', { shares: lot.generalShares }));
  }

  const propertyTitle = lot?.property?.title?.trim();
  if (propertyTitle && !isTechnicalPropertyTitle(propertyTitle)) {
    segments.push(propertyTitle);
  }

  return segments.join(' · ');
}
