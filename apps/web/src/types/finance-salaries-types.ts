import { t } from '../i18n/t';
/**
 * Contrat gelé de la frontière réseau — lot 4, troisième sous-lot : les
 * salaires (PRD E8, besoins B11 et P9).
 *
 * Dérivé de `packages/api/src/lib/finance/types-lot4-salaries.ts`, gelé côté
 * serveur. Comme aux sous-lots 1 et 2 (`finance-lot4-types.ts`,
 * `finance-partnerships-types.ts`), **chaque champ ici porte le nom que le
 * serveur émet** — la règle payée au lot 2, où le type web annonçait
 * `accountId` là où l'API émettait `thirdPartyAccountId`, et où TypeScript ne
 * pouvait rien voir puisque c'était le type lui-même qui mentait. Les noms de
 * TYPE, eux, perdent le suffixe `Record` (`EmployeeRecord` -> `Employee`).
 *
 * **Les dates deviennent des chaînes.** Le contrat serveur les type `Date` ;
 * ce qui arrive réellement dans le navigateur est le JSON produit par
 * `res.json()`, donc une chaîne ISO. Le type web dit ce que l'écran reçoit,
 * pas ce que le service de domaine manipule — même choix qu'au sous-lot 1
 * (`LandLeasePayment.paymentDate`).
 *
 * **Aucun « débit » ni « crédit » ici.** On *saisit* une note, on la *valide*,
 * on *règle* un salarié, la charge s'*impute* à un chantier. C'est le principe
 * P-1 du PRD.
 *
 * ---------------------------------------------------------------------------
 * Aucun calcul social, et c'est une exigence
 * ---------------------------------------------------------------------------
 *
 * Le contrat gelé le dit en toutes lettres : le module constate une dépense et
 * une dette envers un salarié ; il ne calcule ni cotisation, ni retenue, ni net
 * à payer. **Ce qui est saisi est ce qui sera versé.** Il n'y a donc, ici et à
 * l'écran, ni brut, ni net, ni assiette : un seul `amount`.
 *
 * ---------------------------------------------------------------------------
 * Le poste de dépense, exigé et jamais deviné
 * ---------------------------------------------------------------------------
 *
 * `costCategoryId` est exigé dès que `siteId` est renseigné, et REFUSÉ sans
 * chantier (schéma Zod `.strict()` + `superRefine` côté serveur). Les postes
 * sont propres à chaque agence et librement renommables : ni le domaine ni
 * l'écran ne les résolvent par leur libellé. L'écran a le droit de
 * PRÉ-SÉLECTIONNER un poste nommé « main-d'œuvre », à condition que
 * l'utilisateur le voie et puisse en changer — voir `pages/finance/Salarie.tsx`.
 */

// ---------------------------------------------------------------------------
// Cycle d'une pièce de salaire
// ---------------------------------------------------------------------------

/**
 * Brouillon, puis validé.
 *
 * `VOIDED` est repris du serveur (`SalaryDocumentStatus = SupplierInvoiceStatus`,
 * l'énumération Prisma partagée avec le lot 2) bien qu'AUCUNE route de ce
 * sous-lot n'annule une pièce de salaire : le type doit pouvoir accueillir ce
 * que l'API peut émettre, et le taire ferait échouer le typage le jour où une
 * annulation arrivera. Voir la rubrique « Hypothèses » du rapport de cet agent.
 */
export type SalaryDocumentStatus = 'DRAFT' | 'VALIDATED' | 'VOIDED';

export function SALARY_STATUS_LABELS(): Record<SalaryDocumentStatus, string> {
  return {
    DRAFT: t('Brouillon'),
    VALIDATED: t('Validé'),
    VOIDED: t('Annulé')
  };
}

// ---------------------------------------------------------------------------
// L'employé
// ---------------------------------------------------------------------------

export interface Employee {
  id: string;
  tenantId: string;
  fullName: string;
  /** Maçon, gardien, comptable… Nul quand il n'a pas été renseigné. */
  role: string | null;
  thirdPartyAccountId: string;
  isActive: boolean;
  /**
   * Ce qu'on lui doit encore, à l'instant de la lecture.
   *
   * **Positif quand nous lui devons**, comme pour un fournisseur au lot 2.
   * Négatif après une avance sur salaire : c'est lui qui doit alors à
   * l'agence. **Calculé côté serveur, jamais recomposé à l'écran** à partir des
   * notes et des règlements — ceux-ci sont bornés à ce que l'écran a chargé,
   * le solde court sur toute l'histoire du compte.
   */
  accountBalance: number;
  currency: string;
}

/**
 * Corps de l'enregistrement d'un salarié.
 *
 * Distinct d'un `User`, qui est un compte d'accès à l'application : un maçon
 * n'ouvre pas l'application. Le compte de tiers naît avec le salarié, l'écran
 * n'a rien à ouvrir lui-même.
 */
export interface CreateEmployeeInput {
  fullName: string;
  role?: string | null;
}

export interface ListEmployeesFilters {
  onlyActive?: boolean;
}

// ---------------------------------------------------------------------------
// La note de salaire
// ---------------------------------------------------------------------------

export interface SalaryNote {
  id: string;
  employeeId: string;
  /** Nom du salarié. L'écran montre ce nom, jamais `employeeId`. */
  employeeLabel: string;
  periodYear: number;
  periodMonth: number;
  amount: number;
  currency: string;
  siteId: string | null;
  /** Nom du chantier. Nul quand la note n'en porte aucun. */
  siteLabel: string | null;
  costCategoryId: string | null;
  /** Nom du poste. Nul en même temps que le chantier : les deux vont ensemble. */
  costCategoryLabel: string | null;
  status: SalaryDocumentStatus;
  /** Nom de qui a saisi. L'écran du validateur en a besoin. */
  createdByLabel: string;
  /** Chaîne ISO. Nulle tant que la note est un brouillon. */
  validatedAt: string | null;
}

/**
 * Corps de la saisie d'une note de salaire.
 *
 * L'employé voyage dans le CHEMIN (`employees/{employeeId}/salary-notes`),
 * jamais dans ce corps — le défaut qui cassait quatre créations des lots 2 et 3
 * contre les schémas `.strict()` du serveur. Voir
 * `__tests__/finance/corps-des-requetes.test.ts`.
 *
 * `siteId` et `costCategoryId` vont par paire, et le serveur refuse l'un sans
 * l'autre dans les DEUX sens. Ils sont donc omis tous les deux quand la note ne
 * porte aucun chantier, plutôt qu'envoyés à `null` : un champ absent dit « je
 * n'en ai pas », un champ à `null` dit « j'ai regardé et il n'y en a pas » —
 * ici les deux se valent pour le serveur, mais le corps le plus court est celui
 * qui se relit.
 */
export interface CreateSalaryNoteInput {
  periodYear: number;
  periodMonth: number;
  amount: number;
  siteId?: string;
  costCategoryId?: string;
}

export interface ListSalaryNotesFilters {
  employeeId?: string;
  siteId?: string;
  periodYear?: number;
  periodMonth?: number;
}

// ---------------------------------------------------------------------------
// Le règlement
// ---------------------------------------------------------------------------

export interface SalaryPayment {
  id: string;
  employeeId: string;
  employeeLabel: string;
  /** Chaîne ISO. */
  paymentDate: string;
  amount: number;
  currency: string;
  status: SalaryDocumentStatus;
  createdByLabel: string;
  /** Chaîne ISO. Nulle tant que le règlement est un brouillon. */
  validatedAt: string | null;
}

/**
 * Corps de la saisie d'un règlement.
 *
 * **Sans affectation à des notes précises**, contrairement au règlement
 * fournisseur du lot 2 : on paie un salarié, pas une facture. Il n'y a donc pas
 * de tableau `allocations`, et l'écran n'en propose pas.
 *
 * **Un règlement supérieur au solde est accepté** : c'est une avance sur
 * salaire, et le contrat gelé le dit explicitement. L'écran peut avertir, il ne
 * bloque jamais.
 *
 * `employeeId` est dans le CHEMIN, pas ici (même raison que pour la note).
 */
export interface CreateSalaryPaymentInput {
  /** `YYYY-MM-DD`. Le serveur la reçoit en `z.coerce.date()`. */
  paymentDate: string;
  amount: number;
}
