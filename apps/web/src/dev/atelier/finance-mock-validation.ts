/**
 * Atelier — fausse API du volet « validation », lot 2.
 *
 * Ce fichier appartient en entier à l'agent qui construit ces écrans : jeux
 * d'essai ET réponses. Les gestionnaires sont séparés, un par volet, pour
 * qu'aucun agent n'ait à modifier le fichier d'un autre — la leçon du lot 1.
 *
 * Il renvoie `null` quand l'URL ne le concerne pas ; `mock-api.ts` passe alors
 * au gestionnaire suivant.
 *
 * **Limite assumée**, la même que `finance-mock-balances.ts` : `mock-api.ts`
 * n'appelle ce gestionnaire qu'avec `url.pathname` (voir son dispatch, en pied
 * de fichier), jamais avec les paramètres de recherche. Le filtre « Saisi
 * par » de `FileDeValidation.tsx` envoie bien `?createdByUserId=...` à la
 * frontière réseau, mais cette fausse API ne peut pas le lire : elle rend
 * toujours la file entière (hors scénario `vide`). Ce que l'atelier démontre
 * ici, c'est la donnée elle-même — dix pièces des trois natures saisies par
 * quatre personnes différentes, chacune nommée sur sa ligne — pas le
 * filtrage réel, qui reste vérifié par les tests Vitest (`validation.test.tsx`,
 * qui contrôlent l'argument reçu par `getValidationQueue`) et par la vraie
 * API en recette.
 */

import type { Scenario } from './mock-api';

interface PieceSeed {
  documentType: 'SUPPLIER_INVOICE' | 'SUPPLIER_PAYMENT' | 'CASH_VOUCHER';
  documentId: string;
  label: string;
  amount: number;
  createdAt: string;
  createdByUserId: string;
  createdByLabel: string;
}

/**
 * Quatre saisisseurs, quatre identifiants stables — jamais leur nom en guise
 * d'identifiant. C'est précisément le défaut corrigé sur le contrat
 * (`finance-lot2-types.ts`) : deux homonymes auraient suffi à rendre le
 * filtre faux si l'écran ou l'atelier s'appuyait sur le libellé.
 */
const UTILISATEUR_MARIAM = 'user-mariam-camara';
const UTILISATEUR_IBRAHIMA = 'user-ibrahima-sow';
const UTILISATEUR_AISSATOU = 'user-aissatou-barry';
const UTILISATEUR_FATOUMATA = 'user-fatoumata-diallo';

/**
 * Onze pièces en attente, des trois natures, saisies par quatre personnes
 * différentes et à des dates échelonnées sur un mois — c'est ce qui rend le
 * filtre « Saisi par » démontrable dans l'atelier : sans plusieurs auteurs
 * distincts, la colonne « Saisi par » serait toujours la même valeur.
 */
const PIECES_EN_ATTENTE: PieceSeed[] = [
  // Factures fournisseurs
  {
    documentType: 'SUPPLIER_INVOICE',
    documentId: 'facture-2026-0142',
    label: 'Quincaillerie Almamya — Facture FA-2026-0142',
    amount: 1_850_000,
    createdAt: '2026-09-10T09:15:00.000Z',
    createdByUserId: UTILISATEUR_MARIAM,
    createdByLabel: 'Mariam Camara'
  },
  {
    documentType: 'SUPPLIER_INVOICE',
    documentId: 'facture-2026-0148',
    label: 'Ciments de Guinée — Facture FA-2026-0148',
    amount: 3_200_000,
    createdAt: '2026-09-14T11:40:00.000Z',
    createdByUserId: UTILISATEUR_IBRAHIMA,
    createdByLabel: 'Ibrahima Sow'
  },
  {
    documentType: 'SUPPLIER_INVOICE',
    documentId: 'facture-2026-0151',
    label: 'Menuiserie Fouta — Facture FA-2026-0151',
    amount: 640_000,
    createdAt: '2026-09-16T08:05:00.000Z',
    createdByUserId: UTILISATEUR_AISSATOU,
    createdByLabel: 'Aïssatou Barry'
  },
  {
    documentType: 'SUPPLIER_INVOICE',
    documentId: 'facture-2026-0155',
    label: 'Électricité Konkouré — Facture FA-2026-0155',
    amount: 980_000,
    createdAt: '2026-09-17T14:22:00.000Z',
    createdByUserId: UTILISATEUR_MARIAM,
    createdByLabel: 'Mariam Camara'
  },
  // Règlements fournisseurs
  {
    documentType: 'SUPPLIER_PAYMENT',
    documentId: 'reglement-2026-0031',
    label: 'Quincaillerie Almamya — Règlement du 11/09/2026',
    amount: 1_000_000,
    createdAt: '2026-09-11T10:00:00.000Z',
    createdByUserId: UTILISATEUR_IBRAHIMA,
    createdByLabel: 'Ibrahima Sow'
  },
  {
    documentType: 'SUPPLIER_PAYMENT',
    documentId: 'reglement-2026-0034',
    label: 'Transport Nongo — Règlement du 15/09/2026',
    amount: 450_000,
    createdAt: '2026-09-15T16:30:00.000Z',
    createdByUserId: UTILISATEUR_FATOUMATA,
    createdByLabel: 'Fatoumata Diallo'
  },
  {
    documentType: 'SUPPLIER_PAYMENT',
    documentId: 'reglement-2026-0037',
    label: 'Ciments de Guinée — Règlement du 17/09/2026',
    amount: 2_000_000,
    createdAt: '2026-09-17T09:50:00.000Z',
    createdByUserId: UTILISATEUR_AISSATOU,
    createdByLabel: 'Aïssatou Barry'
  },
  // Pièces de caisse
  {
    documentType: 'CASH_VOUCHER',
    documentId: 'caisse-2026-00031',
    label: 'Pièce de caisse 2026-0031 — Ousmane Touré',
    amount: 150_000,
    createdAt: '2026-09-08T07:45:00.000Z',
    createdByUserId: UTILISATEUR_MARIAM,
    createdByLabel: 'Mariam Camara'
  },
  {
    documentType: 'CASH_VOUCHER',
    documentId: 'caisse-2026-00034',
    label: 'Pièce de caisse 2026-0034 — Sékou Condé',
    amount: 95_000,
    createdAt: '2026-09-12T13:10:00.000Z',
    createdByUserId: UTILISATEUR_FATOUMATA,
    createdByLabel: 'Fatoumata Diallo'
  },
  {
    documentType: 'CASH_VOUCHER',
    documentId: 'caisse-2026-00037',
    label: 'Pièce de caisse 2026-0037 — Alpha Keita',
    amount: 320_000,
    createdAt: '2026-09-15T15:05:00.000Z',
    createdByUserId: UTILISATEUR_IBRAHIMA,
    createdByLabel: 'Ibrahima Sow'
  },
  {
    documentType: 'CASH_VOUCHER',
    documentId: 'caisse-2026-00039',
    label: 'Pièce de caisse 2026-0039 — Hadja Bangoura',
    amount: 210_000,
    createdAt: '2026-09-18T08:30:00.000Z',
    createdByUserId: UTILISATEUR_AISSATOU,
    createdByLabel: 'Aïssatou Barry'
  }
];

const CURRENCY = 'XOF';

function versPendingDocument(piece: PieceSeed) {
  return {
    documentType: piece.documentType,
    documentId: piece.documentId,
    label: piece.label,
    amount: piece.amount,
    currency: CURRENCY,
    createdAt: piece.createdAt,
    createdByUserId: piece.createdByUserId,
    createdByLabel: piece.createdByLabel
  };
}

/**
 * Réponse à un appel de validation. La forme suit le contrat gelé
 * (`SupplierInvoice` / `SupplierPayment` / `CashVoucher`) même si l'écran de
 * validation, lui, n'en relit aucun champ : la mutation invalide la file et
 * se fie au prochain chargement, pas à cette réponse.
 */
function reponseValidation(piece: PieceSeed | undefined, id: string): unknown {
  const validatedAt = new Date().toISOString();

  if (!piece) {
    // Identifiant inconnu de l'atelier : on rend tout de même une pièce
    // validée plausible, plutôt qu'une erreur — la scène reste jouable sans
    // connaître les identifiants simulés (même choix que `mock-api.ts` pour
    // la fiche d'un bien).
    return { id, status: 'VALIDATED', validatedAt };
  }

  switch (piece.documentType) {
    case 'SUPPLIER_INVOICE':
      return {
        id: piece.documentId,
        supplierId: `fournisseur-${piece.documentId}`,
        supplierLabel: piece.label.split(' — ')[0],
        siteId: null,
        siteLabel: null,
        invoiceDate: piece.createdAt,
        reference: piece.label.split('Facture ')[1] ?? piece.documentId,
        amount: piece.amount,
        currency: CURRENCY,
        status: 'VALIDATED',
        validatedAt
      };
    case 'SUPPLIER_PAYMENT':
      return {
        id: piece.documentId,
        supplierId: `fournisseur-${piece.documentId}`,
        supplierLabel: piece.label.split(' — ')[0],
        paymentDate: piece.createdAt,
        amount: piece.amount,
        currency: CURRENCY,
        status: 'VALIDATED',
        allocations: []
      };
    case 'CASH_VOUCHER':
      return {
        id: piece.documentId,
        number: piece.label.split(' — ')[0].replace('Pièce de caisse ', ''),
        siteId: `chantier-${piece.documentId}`,
        siteLabel: 'Chantier',
        costCategoryId: `poste-${piece.documentId}`,
        costCategoryLabel: 'Divers',
        beneficiary: piece.label.split(' — ')[1] ?? '',
        amount: piece.amount,
        currency: CURRENCY,
        voucherDate: piece.createdAt,
        reason: '',
        status: 'VALIDATED',
        validatedAt
      };
    default:
      return { id, status: 'VALIDATED', validatedAt };
  }
}

export function repondreValidation(chemin: string, scenario: Scenario): unknown | null {
  if (/\/tenants\/[^/]+\/finance\/validation-queue$/.test(chemin)) {
    const donnees = scenario === 'vide' ? [] : PIECES_EN_ATTENTE.map(versPendingDocument);
    return { success: true, data: donnees };
  }

  const facture = /\/tenants\/[^/]+\/finance\/supplier-invoices\/([^/]+)\/validate$/.exec(chemin);
  if (facture) {
    const piece = PIECES_EN_ATTENTE.find(p => p.documentType === 'SUPPLIER_INVOICE' && p.documentId === facture[1]);
    return { success: true, data: reponseValidation(piece, facture[1]) };
  }

  const reglement = /\/tenants\/[^/]+\/finance\/supplier-payments\/([^/]+)\/validate$/.exec(chemin);
  if (reglement) {
    const piece = PIECES_EN_ATTENTE.find(p => p.documentType === 'SUPPLIER_PAYMENT' && p.documentId === reglement[1]);
    return { success: true, data: reponseValidation(piece, reglement[1]) };
  }

  const caisse = /\/tenants\/[^/]+\/finance\/cash-vouchers\/([^/]+)\/validate$/.exec(chemin);
  if (caisse) {
    const piece = PIECES_EN_ATTENTE.find(p => p.documentType === 'CASH_VOUCHER' && p.documentId === caisse[1]);
    return { success: true, data: reponseValidation(piece, caisse[1]) };
  }

  return null;
}
