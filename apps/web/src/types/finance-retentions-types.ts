import { t } from '../i18n/t';
/**
 * Contrat gelé de la frontière réseau — lot 4, cinquième sous-lot : la retenue
 * de garantie (PRD E6, besoin P15).
 *
 * Dérivé de `packages/api/src/lib/finance/types-lot4-retentions.ts`, gelé côté
 * serveur. Comme aux sous-lots précédents, **chaque champ porte ici le nom que
 * le serveur émet** — c'est la règle payée au lot 2, où le type web annonçait
 * `accountId` là où l'API émettait `thirdPartyAccountId`. Les noms de TYPE, en
 * revanche, perdent le suffixe `Record` du contrat serveur : convention déjà
 * suivie par `finance-lot4-types.ts` (`LandLeaseRecord` -> `LandLease`).
 *
 * **Les dates sont des chaînes ici.** Le contrat serveur les déclare `Date` ;
 * elles traversent JSON en ISO 8601 et n'ont jamais été des `Date` au moment
 * où l'écran les lit. Même convention que `finance-contractors-types.ts`.
 *
 * **Aucun « débit » ni « crédit » ici** (principe P-1 du PRD). On *pose* une
 * retenue, on la *libère* ; l'argent est *détenu* puis redevient *exigible*.
 *
 * ---------------------------------------------------------------------------
 * Les quatre choses que l'écran ne doit pas laisser croire
 * ---------------------------------------------------------------------------
 *
 * 1. **Une retenue ne diminue pas le coût du chantier.** L'ouvrage a coûté son
 *    prix entier ; ce qui change, c'est ce qu'on doit *maintenant*. Aucun
 *    champ de ce fichier n'est une correction de coût, et `baseAmount` est le
 *    montant de la PIÈCE, jamais un coût de chantier diminué.
 * 2. **Libérer n'est pas payer.** `RELEASED` dit que l'argent est redevenu
 *    exigible, pas qu'il est sorti. Le versement se fait ensuite par le chemin
 *    ordinaire du fournisseur ou du tâcheron, et ne naît jamais ici.
 * 3. **Le montant est dérivé du taux, jamais saisi** (principe P-4).
 *    `CreateRetentionInput` ne porte donc AUCUN champ de montant : le schéma
 *    Zod du serveur est `.strict()` et refuserait un `amount` en 400 plutôt
 *    que de le jeter en silence. `amount` n'existe qu'en LECTURE, figé à la
 *    pose.
 * 4. **`plannedReleaseDate` est une prévision, pas une échéance automatique.**
 *    Rien ne se libère tout seul à cette date ; la libération est un acte que
 *    quelqu'un pose.
 */

// ---------------------------------------------------------------------------
// Énumérations, et leurs libellés français
// ---------------------------------------------------------------------------

/** Les deux natures de pièce sur lesquelles une retenue peut se poser. */
export type RetentionSourceType = 'SUPPLIER_INVOICE' | 'PROGRESS_STATEMENT';

export const RETENTION_SOURCE_TYPE_LABELS: Record<RetentionSourceType, string> = {
  SUPPLIER_INVOICE: t('Facture fournisseur'),
  PROGRESS_STATEMENT: t('Situation de tâcheron')
};

export type RetentionStatus = 'HELD' | 'RELEASED';

/**
 * Libellés des deux statuts.
 *
 * Ils ne passent PAS par la table de `<StatusTag>` : `HELD` et `RELEASED` n'y
 * figurent pas, et `components/primitives/StatusTag.tsx` est un fichier-registre
 * hors du territoire de cet agent. L'écran passe donc `label` et `tone`
 * explicitement — voir `pages/finance/RetenuesDeGarantie.tsx` et la rubrique
 * « Hypothèses » du rapport.
 *
 * « Libérée » et non « Réglée » : l'argent est redevenu exigible, il n'est pas
 * sorti.
 */
export const RETENTION_STATUS_LABELS: Record<RetentionStatus, string> = {
  HELD: t('Détenue'),
  RELEASED: t('Libérée')
};

// ---------------------------------------------------------------------------
// La retenue
// ---------------------------------------------------------------------------

export interface RetentionGuarantee {
  id: string;
  tenantId: string;
  sourceType: RetentionSourceType;
  sourceId: string;
  /**
   * De quoi on retient, en clair : « Facture F-2026-014 » ou « Situation n°3
   * — marché MAÇ-07 ». L'écran ne montre jamais un identifiant.
   */
  sourceLabel: string;
  /** Le fournisseur ou le tâcheron, nommé. */
  thirdPartyLabel: string;
  thirdPartyAccountId: string;
  siteId: string | null;
  /** Nom du chantier. Nul pour une facture qui n'en porte aucun. */
  siteLabel: string | null;
  /**
   * Le montant de la PIÈCE source, au moment de la pose.
   *
   * Ce n'est pas un coût de chantier, et la retenue ne l'entame pas : c'est
   * seulement l'assiette sur laquelle le taux a été appliqué.
   */
  baseAmount: number;
  /** Le taux appliqué, en pourcentage, deux décimales. */
  ratePercent: number;
  /** Ce qui est retenu. **Dérivé du taux par le serveur à la pose, puis figé.** */
  amount: number;
  currency: string;
  /** ISO 8601. Une PRÉVISION : rien ne se libère tout seul à cette date. */
  plannedReleaseDate: string;
  status: RetentionStatus;
  /** ISO 8601, nul tant que la retenue est détenue. */
  releasedAt: string | null;
  createdAt: string;
}

/**
 * Corps de la pose d'une retenue.
 *
 * **Aucun champ de montant, et ce n'est pas un oubli** : le montant se dérive
 * du taux et de la pièce source (principe P-4). Le schéma Zod du serveur
 * (`schemas-retentions.ts`) est `.strict()` et n'accepte pas `amount` — un
 * corps qui en porterait un reçoit un 400 explicite.
 *
 * `sourceId` **est** dans le corps, et ce n'est pas une répétition : le chemin
 * (`POST /tenants/{tenantId}/finance/retentions`) ne porte que `tenantId`, et
 * la pièce change de table selon `sourceType`.
 */
export interface CreateRetentionInput {
  sourceType: RetentionSourceType;
  sourceId: string;
  /** Strictement entre 0 et 100, bornes exclues. Le serveur refuse le reste. */
  ratePercent: number;
  /** `YYYY-MM-DD`. Exigée : une retenue sans échéance prévue est une retenue qu'on oublie. */
  plannedReleaseDate: string;
}

export interface ListRetentionsFilters {
  status?: RetentionStatus;
  siteId?: string;
  thirdPartyAccountId?: string;
  /** `YYYY-MM-DD`. Ne garde que les retenues dont la date prévue est passée. */
  dueBefore?: string;
}

// ---------------------------------------------------------------------------
// Ce qui est détenu, en un coup d'œil
// ---------------------------------------------------------------------------

export interface RetentionSummary {
  /** Somme des retenues encore détenues. Calculée côté serveur. */
  totalHeld: number;
  /** Somme des retenues déjà libérées. Calculée côté serveur. */
  totalReleased: number;
  /**
   * Détenues dont la date prévue est dépassée.
   *
   * **Le seul chiffre qui appelle une action** : un tiers qui attend son
   * argent au-delà de la date convenue finit par le réclamer, et mieux vaut
   * l'avoir vu avant lui.
   */
  overdueHeld: number;
  overdueCount: number;
  currency: string;
}

export interface RetentionSummaryFilters {
  siteId?: string;
}
