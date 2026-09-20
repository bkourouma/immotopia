import { statusLabel, statusTone } from '../primitives/StatusTag';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
/**
 * Libellés, couleurs et formats des graphiques du tableau de bord.
 *
 * **Pourquoi un fichier et pas une couleur par composant.** Le dépôt écrivait
 * ses palettes de graphiques trois fois — `crm/dashboard/charts/PipelineChart`,
 * `OwnerPortal/RevenueChart`, `patrimoine/YieldProjectionChart` — avec trois
 * bleus différents, dont aucun n'est celui du design system (§3.2, P7). Les
 * couleurs vivent ici, tirées des tokens ou d'une palette catégorielle unique.
 *
 * **Pourquoi ces valeurs-là.** Deux familles, et elles ne se mélangent pas :
 *
 * - **Les statuts** (échéances, tickets, baux) portent les couleurs
 *   sémantiques de `tokens.css`. Rouge et vert ne se distinguent pas sous
 *   deutéranopie : partout où elles servent, la tranche est ÉGALEMENT nommée
 *   en toutes lettres à côté de la barre. La couleur ne porte jamais seule.
 * - **Les catégories** (types de bien, moyens de paiement) n'ont pas de sens
 *   sémantique : elles prennent une palette catégorielle dont l'ordre est
 *   fixe — un filtre qui retire une série ne repeint pas les survivantes.
 */

/**
 * Palette catégorielle, dans un ordre qui ne change jamais.
 *
 * Écart d'un cran par rapport au bleu de marque en première position :
 * `--color-primary` (#2563EB) y est substitué au bleu d'origine de la palette
 * pour que le premier graphique venu reste dans l'identité du produit. Les
 * paires adjacentes gardent une séparation ΔE ≥ 8 en vision déficiente.
 */
export const CATEGORICAL = ['#2563eb', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'] as const;

/** Les deux séries de la courbe de trésorerie. Elles se lisent en opposition. */
export const SERIES = {
  encaisse: '#2563eb',
  attendu: '#eb6834'
} as const;

/** Couleurs d'intention, reprises telles quelles des tokens. */
const TONE_COLOR: Record<string, string> = {
  neutral: 'var(--text-tertiary)',
  info: 'var(--color-primary)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-error)'
};

/** Couleur d'un code de statut, via la table unique de `<StatusTag>`. */
export function statusColor(key: string): string {
  return TONE_COLOR[statusTone(key)] ?? TONE_COLOR.neutral;
}

/** Couleur catégorielle d'un rang. Au-delà de la palette, on replie en gris. */
export function categoricalColor(index: number): string {
  return CATEGORICAL[index] ?? 'var(--text-tertiary)';
}

/**
 * Libellés que `<StatusTag>` ne connaît pas : ce ne sont pas des statuts.
 * Types de bien, moyens de paiement, priorités et étapes commerciales.
 */
const EXTRA_LABELS: Record<string, string> = {
  // Types de bien
  APPARTEMENT: 'Appartement',
  MAISON_VILLA: t('Maison / Villa'),
  STUDIO: 'Studio',
  DUPLEX_TRIPLEX: t('Duplex / Triplex'),
  CHAMBRE_COLOCATION: 'Chambre',
  BUREAU: 'Bureau',
  BOUTIQUE_COMMERCIAL: 'Commerce',
  ENTREPOT_INDUSTRIEL: t('Entrepôt'),
  TERRAIN: 'Terrain',
  IMMEUBLE: 'Immeuble',
  PARKING_BOX: 'Parking',
  LOT_PROGRAMME_NEUF: t('Lot neuf'),

  // Moyens de paiement
  CASH: t('Espèces'),
  BANK_TRANSFER: 'Virement',
  CHECK: t('Chèque'),
  MOBILE_MONEY: t('Mobile Money'),
  CARD: t('Carte bancaire'),
  OTHER: 'Autre',

  // Priorités de ticket
  URGENT: 'Urgente',
  HIGH: 'Haute',
  MEDIUM: 'Moyenne',
  LOW: 'Basse',

  // Étapes commerciales et statuts de contact
  QUALIFIED: t('Qualifiée'),
  VISIT: 'Visite',
  NEGOTIATION: t('Négociation'),
  ACTIVE_CLIENT: 'Client',
  AUTRES: 'Autres',
  LEAD: 'Prospect'
};

/**
 * Libellé français d'un code métier.
 *
 * L'ordre compte : la table des statuts fait autorité, parce que c'est elle
 * qui est vérifiée par `status-coverage.test.ts`. Un code inconnu des deux
 * tables s'affiche tel quel — visible, donc corrigeable — plutôt que masqué.
 */
export function bucketLabel(key: string): string {
  return statusLabel(key) ?? EXTRA_LABELS[key] ?? key;
}

/**
 * Montant abrégé pour une tuile ou un axe : `12,4 M`, `850 k`.
 *
 * Les montants de loyer en FCFA tiennent à sept chiffres. Écrits en entier,
 * ils débordent d'une tuile sur 375 px et rendent un axe illisible. Le montant
 * exact reste accessible : il est dans l'infobulle et sur l'écran de détail.
 */
export function compactAmount(value: number): string {
  const absolu = Math.abs(value);
  if (absolu >= 1_000_000)
    return `${(value / 1_000_000).toLocaleString(activeLocale(), { maximumFractionDigits: 1 })} M`;
  if (absolu >= 10_000) return `${(value / 1_000).toLocaleString(activeLocale(), { maximumFractionDigits: 0 })} k`;
  return value.toLocaleString(activeLocale(), { maximumFractionDigits: 0 });
}

/**
 * Pourcentage écrit en français : `71,9 %`, séparateur décimal virgule et
 * espace insécable avant le signe. Le rendu par défaut de JavaScript (`71.9 %`)
 * est de l'anglais posé au milieu d'une phrase française.
 */
export function formatPercent(value: number): string {
  return `${value.toLocaleString(activeLocale(), { maximumFractionDigits: 1 })}\u00a0%`;
}

/** Libellé d'axe d'un mois : `sept. 26`. */
export function monthLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(activeLocale(), { month: 'short', year: '2-digit' });
}

/** Libellé long d'un mois, pour l'infobulle : `septembre 2026`. */
export function monthLabelLong(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(activeLocale(), { month: 'long', year: 'numeric' });
}

/**
 * Variation entre deux périodes, en pourcentage entier.
 *
 * `null` quand la période de référence est vide : « +100 % » à partir de zéro
 * ne veut rien dire, et « +∞ % » encore moins.
 */
export function variation(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Réduit une série à ses `max` plus grosses tranches, le reste en « Autres ».
 *
 * Un camembert cesse de se lire au-delà de six parts : les tranches fines se
 * confondent et leurs libellés se chevauchent. Le détail complet reste à un
 * clic, sur la liste filtrée.
 */
export function topSlices<T extends { key: string; count: number; amount?: number }>(
  buckets: T[],
  max = 5
): Array<{ key: string; count: number; amount?: number; href?: string }> {
  const utiles = buckets.filter(bucket => bucket.count > 0).sort((a, b) => b.count - a.count);
  if (utiles.length <= max) return utiles;

  const tete = utiles.slice(0, max);
  const reste = utiles.slice(max);
  return [
    ...tete,
    {
      key: 'AUTRES',
      count: reste.reduce((somme, bucket) => somme + bucket.count, 0),
      amount: reste.reduce((somme, bucket) => somme + (bucket.amount ?? 0), 0)
    }
  ];
}
