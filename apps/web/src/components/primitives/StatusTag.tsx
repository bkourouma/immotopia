import React from 'react';
import { Tag } from 'antd';

/**
 * `<StatusTag>` — table unique statut -> token (REFONTE_UI_UX.md §3.6).
 *
 * Aujourd'hui, une centaine de fichiers posent des `<Tag color="green">` ou
 * `color="#52c41a"` a la main, chacun avec sa propre idee du vert. Ce composant
 * remplace ce jugement par une table : un statut metier donne toujours la meme
 * paire fond/texte, tiree des tokens `--color-*-bg` / `--color-*-text` du §3.2
 * dont `npm run a11y:contrast` verifie le contraste.
 *
 * Non cable dans les ecrans a ce stade : le remplacement des ~90 `Tag` ad hoc
 * appartient aux lots suivants.
 */

/** Registre des intentions. Rien d'autre n'est autorise. */
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONE_STYLE: Record<StatusTone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: 'var(--surface-sunken)', fg: 'var(--text-secondary)', border: 'var(--border-subtle)' },
  info: { bg: 'var(--color-primary-bg)', fg: 'var(--color-primary)', border: 'var(--color-primary-border)' },
  success: { bg: 'var(--color-success-bg)', fg: 'var(--color-success-text)', border: 'var(--color-success-bg)' },
  warning: { bg: 'var(--color-warning-bg)', fg: 'var(--color-warning-text)', border: 'var(--color-warning-bg)' },
  danger: { bg: 'var(--color-error-bg)', fg: 'var(--color-error-text)', border: 'var(--color-error-bg)' }
};

/**
 * Statuts effectivement presents dans le depot, avec leur libelle francais.
 * Les codes non listes retombent sur `neutral` et sur le code lui-meme : un
 * statut inconnu s'affiche, il ne disparait pas.
 */
const STATUS_MAP: Record<string, { tone: StatusTone; label: string }> = {
  // Cycle de vie generique
  DRAFT: { tone: 'neutral', label: 'Brouillon' },
  ACTIVE: { tone: 'success', label: 'Actif' },
  INACTIVE: { tone: 'neutral', label: 'Inactif' },
  SUSPENDED: { tone: 'warning', label: 'Suspendu' },
  TERMINATED: { tone: 'neutral', label: 'Terminé' },
  CANCELLED: { tone: 'neutral', label: 'Annulé' },
  CANCELED: { tone: 'neutral', label: 'Annulé' },
  ARCHIVED: { tone: 'neutral', label: 'Archivé' },
  EXPIRED: { tone: 'danger', label: 'Expiré' },
  REVOKED: { tone: 'danger', label: 'Révoqué' },

  // Cycle de vie d'un bien.
  //
  // Manquaient a la table ecrite au Lot 0, alors que ce sont les statuts les
  // plus affiches de l'application : la liste des biens rendait « AVAILABLE »
  // et « RENTED » en clair a l'utilisateur. Defaut trouve a l'ecran, dans
  // l'atelier — aucun test ne le voyait, puisque `<StatusTag>` rend fidelement
  // le code qu'on lui donne quand il ne le connait pas.
  AVAILABLE: { tone: 'success', label: 'Disponible' },
  UNDER_REVIEW: { tone: 'warning', label: 'En révision' },
  RESERVED: { tone: 'warning', label: 'Réservé' },
  UNDER_OFFER: { tone: 'warning', label: 'Sous offre' },
  RENTED: { tone: 'info', label: 'Loué' },
  // Neutre et non « succes » : le bien sort du portefeuille, ce n'est pas un
  // etat a mettre en avant dans une liste de gestion.
  SOLD: { tone: 'neutral', label: 'Vendu' },

  // Encaissement
  PENDING: { tone: 'warning', label: 'En attente' },
  DUE: { tone: 'info', label: 'À échoir' },
  PARTIAL: { tone: 'warning', label: 'Partiel' },
  PAID: { tone: 'success', label: 'Payé' },
  OVERDUE: { tone: 'danger', label: 'En retard' },
  LATE: { tone: 'danger', label: 'En retard' },
  SUCCESS: { tone: 'success', label: 'Réussi' },
  FAILED: { tone: 'danger', label: 'Échoué' },
  REFUNDED: { tone: 'neutral', label: 'Remboursé' },
  PARTIALLY_REFUNDED: { tone: 'warning', label: 'Partiellement remboursé' },

  // Tickets et travaux
  NEW: { tone: 'info', label: 'Nouveau' },
  OPEN: { tone: 'info', label: 'Ouvert' },
  PLANNED: { tone: 'info', label: 'Planifié' },
  SCHEDULED: { tone: 'info', label: 'Planifié' },
  IN_PROGRESS: { tone: 'warning', label: 'En cours' },
  RESOLVED: { tone: 'success', label: 'Résolu' },
  COMPLETED: { tone: 'success', label: 'Terminé' },
  CLOSED: { tone: 'neutral', label: 'Clôturé' },

  // Documents, baux, visites.
  //
  // Ajoutés après un second constat identique au premier : « VOID » s'affichait
  // en clair sur l'écran des documents, comme « AVAILABLE » l'avait fait sur
  // celui des biens. Plutôt qu'un troisième rattrapage, tous les codes de
  // statut déclarés dans les énumérations du dépôt ont été comparés à cette
  // table, et un test vérifie désormais qu'aucun n'y manque.
  VOID: { tone: 'danger', label: 'Annulé' },
  ENDED: { tone: 'neutral', label: 'Terminé' },
  CONFIRMED: { tone: 'success', label: 'Confirmé' },
  DONE: { tone: 'success', label: 'Effectué' },
  NO_SHOW: { tone: 'danger', label: 'Absent' },

  // Ameublement — ce n'est pas un cycle de vie, mais une qualité du bien.
  // Rendue par le même composant lorsqu'un écran l'affiche comme étiquette.
  FURNISHED: { tone: 'info', label: 'Meublé' },
  UNFURNISHED: { tone: 'neutral', label: 'Non meublé' },
  PARTIALLY_FURNISHED: { tone: 'info', label: 'Partiellement meublé' },

  // Invitations, validations, affaires
  SENT: { tone: 'info', label: 'Envoyé' },
  ACCEPTED: { tone: 'success', label: 'Accepté' },
  APPROVED: { tone: 'success', label: 'Approuvé' },
  REJECTED: { tone: 'danger', label: 'Refusé' },
  VALIDATED: { tone: 'success', label: 'Validé' },
  FINAL: { tone: 'success', label: 'Final' },
  PUBLISHED: { tone: 'success', label: 'Publié' },
  WON: { tone: 'success', label: 'Gagnée' },
  LOST: { tone: 'danger', label: 'Perdue' },

  // Pieces et engagements du module financier operationnel (lots 2 a 4).
  //
  // Ces quatre codes manquaient, et `ISSUED` s'affichait donc en anglais sur
  // l'ecran des bons de commande, livre depuis le lot 3. C'est exactement le
  // defaut que `status-coverage.test.ts` existe pour empecher : il ne l'a pas
  // vu parce que sa liste d'enumerations est recopiee a la main et que les
  // statuts financiers sont des unions TypeScript, sans forme executable. La
  // note de ce test dit desormais ce qu'il couvre reellement.
  VOIDED: { tone: 'danger', label: 'Annulée' },
  ISSUED: { tone: 'info', label: 'Émis' },
  HELD: { tone: 'warning', label: 'Détenue' },
  RELEASED: { tone: 'success', label: 'Libérée' }
};

export interface StatusTagProps {
  /** Code metier, insensible a la casse (`ACTIVE`, `active`, `Active`). */
  status: string | null | undefined;
  /** Force l'intention, pour un statut absent de la table. */
  tone?: StatusTone;
  /** Force le libelle, pour un statut absent de la table. */
  label?: string;
}

/**
 * Libelle francais d'un code de statut, `null` si le code est inconnu.
 *
 * Expose pour que le test puisse verifier l invariant qui compte : aucun code
 * declare dans les enumerations du depot ne doit manquer a la table. Un code
 * inconnu n echoue pas — le composant rend alors le code brut, ce qui vaut
 * mieux qu un ecran vide — mais il est alors AFFICHE EN ANGLAIS a
 * l utilisateur, et c est precisement ce que le test empeche.
 */
export function statusLabel(status: string | null | undefined): string | null {
  if (!status) return null;
  return STATUS_MAP[status.toUpperCase()]?.label ?? null;
}

export function statusTone(status: string | null | undefined): StatusTone {
  if (!status) return 'neutral';
  return STATUS_MAP[status.toUpperCase()]?.tone ?? 'neutral';
}

export const StatusTag: React.FC<StatusTagProps> = ({ status, tone, label }) => {
  const key = (status ?? '').toUpperCase();
  const entry = STATUS_MAP[key];
  const resolvedTone = tone ?? entry?.tone ?? 'neutral';
  const resolvedLabel = label ?? entry?.label ?? status ?? '—';
  const style = TONE_STYLE[resolvedTone];

  return (
    <Tag
      style={{
        backgroundColor: style.bg,
        color: style.fg,
        borderColor: style.border,
        borderRadius: 'var(--radius-sm)',
        fontWeight: 'var(--font-weight-medium)' as unknown as number,
        marginInlineEnd: 0
      }}
    >
      {resolvedLabel}
    </Tag>
  );
};
