/**
 * Atelier — fausse API de la balance clients et de la balance âgée.
 *
 * Ce fichier appartient en entier à l'agent qui construit ces deux écrans :
 * jeux d'essai ET réponses. Les trois gestionnaires financiers de l'atelier
 * sont volontairement séparés, un par écran, pour qu'aucun agent n'ait à
 * modifier le fichier d'un autre.
 *
 * Il renvoie `null` quand l'URL ne le concerne pas ; `mock-api.ts` passe
 * alors au gestionnaire suivant.
 *
 * **Limite assumée** : `mock-api.ts` n'appelle ce gestionnaire qu'avec
 * `url.pathname` (voir son dispatch, en pied de fichier), jamais avec les
 * paramètres de recherche. La période et le bien affichés dans l'URL de
 * l'écran ne filtrent donc pas réellement les données servies ici — seuls
 * le scénario ('nominal' / 'vide' / 'partiel') et, en amont, 'lent' et
 * 'erreur' (gérés génériquement par `mock-api.ts` avant d'arriver ici)
 * changent la réponse. Un filtrage réel appartient à la vraie API.
 */

import type {
  ClientsAgingBalance,
  ClientsAgingBalanceLine,
  ClientsBalance,
  ClientsBalanceLine
} from '../../types/finance-types';
import type { Scenario } from './mock-api';

/**
 * Dix locataires d'une agence ouest-africaine, soldes variés — dont un
 * locataire en avance (compte créditeur, solde négatif) et un locataire
 * rattaché à deux biens à la fois, pour que les deux cas se voient à
 * l'écran sans avoir à les chercher.
 */
const LOCATAIRES: Array<{
  accountId: string;
  tenantClientId: string;
  label: string;
  propertyLabels: string[];
  totalBilled: number;
  totalSettled: number;
  /** Ventilation par ancienneté. La somme égale toujours `balance`. */
  tranches: { notYetDue: number; days0To30: number; days30To60: number; days60To90: number; daysOver90: number };
}> = [
  {
    accountId: 'compte-01',
    tenantClientId: 'client-01',
    label: 'Mariam Diomandé',
    propertyLabels: ['Villa 4 pièces - Cocody Angré'],
    totalBilled: 3_600_000,
    totalSettled: 3_600_000,
    tranches: { notYetDue: 0, days0To30: 0, days30To60: 0, days60To90: 0, daysOver90: 0 }
  },
  {
    accountId: 'compte-02',
    tenantClientId: 'client-02',
    label: 'Seydou Traoré',
    propertyLabels: ['Appartement 3 pièces - Treichville'],
    totalBilled: 1_800_000,
    totalSettled: 1_200_000,
    tranches: { notYetDue: 600_000, days0To30: 0, days30To60: 0, days60To90: 0, daysOver90: 0 }
  },
  {
    accountId: 'compte-03',
    tenantClientId: 'client-03',
    label: 'Awa Konan',
    propertyLabels: ['Boutique commerciale - Adjamé'],
    totalBilled: 4_500_000,
    totalSettled: 3_000_000,
    tranches: { notYetDue: 0, days0To30: 1_500_000, days30To60: 0, days60To90: 0, daysOver90: 0 }
  },
  {
    accountId: 'compte-04',
    tenantClientId: 'client-04',
    label: 'Ibrahima Yao',
    propertyLabels: ['Villa duplex - Riviera Palmeraie'],
    totalBilled: 6_000_000,
    totalSettled: 4_500_000,
    tranches: { notYetDue: 0, days0To30: 0, days30To60: 1_500_000, days60To90: 0, daysOver90: 0 }
  },
  {
    accountId: 'compte-05',
    tenantClientId: 'client-05',
    label: 'Fatoumata Kouadio',
    propertyLabels: ['Appartement 2 pièces - Plateau'],
    totalBilled: 2_100_000,
    totalSettled: 1_950_000,
    tranches: { notYetDue: 100_000, days0To30: 50_000, days30To60: 0, days60To90: 0, daysOver90: 0 }
  },
  {
    accountId: 'compte-06',
    tenantClientId: 'client-06',
    label: 'Moussa Keïta',
    propertyLabels: ['Entrepôt 800 m² - Yopougon'],
    totalBilled: 5_400_000,
    totalSettled: 3_600_000,
    tranches: { notYetDue: 0, days0To30: 0, days30To60: 0, days60To90: 1_800_000, daysOver90: 0 }
  },
  {
    // Locataire en avance : plus réglé que facturé, donc un solde négatif.
    // C'est le cas que `MoneyValue` doit rendre sans le confondre avec une
    // dette, et que `ClientsBalanceLine` documente : « positif, le locataire
    // nous doit » — ici, c'est l'agence qui lui doit un report.
    accountId: 'compte-07',
    tenantClientId: 'client-07',
    label: 'Aïssatou Brou',
    propertyLabels: ['Villa 5 chambres - Bingerville'],
    totalBilled: 3_000_000,
    totalSettled: 3_450_000,
    tranches: { notYetDue: -450_000, days0To30: 0, days30To60: 0, days60To90: 0, daysOver90: 0 }
  },
  {
    accountId: 'compte-08',
    tenantClientId: 'client-08',
    label: 'Kadiatou Kouassi',
    propertyLabels: ['Appartement meublé - Marcory'],
    totalBilled: 2_700_000,
    totalSettled: 2_250_000,
    tranches: { notYetDue: 0, days0To30: 0, days30To60: 300_000, days60To90: 150_000, daysOver90: 0 }
  },
  {
    accountId: 'compte-09',
    tenantClientId: 'client-09',
    label: 'Boubacar Koffi',
    propertyLabels: ['Local commercial - Koumassi'],
    totalBilled: 3_900_000,
    totalSettled: 3_120_000,
    tranches: { notYetDue: 0, days0To30: 0, days30To60: 0, days60To90: 0, daysOver90: 780_000 }
  },
  {
    // Rattaché à deux biens à la fois : le cas que la colonne « Biens »
    // (un tableau, pas une chaîne) doit afficher lisiblement.
    accountId: 'compte-10',
    tenantClientId: 'client-10',
    label: 'Aminata Cissé',
    propertyLabels: ['Villa 3 chambres - Abobo', 'Boutique - Abobo Marché'],
    totalBilled: 5_700_000,
    totalSettled: 4_275_000,
    tranches: { notYetDue: 500_000, days0To30: 0, days30To60: 0, days60To90: 0, daysOver90: 925_000 }
  }
];

const CURRENCY = 'XOF';

function balanceDe(locataire: (typeof LOCATAIRES)[number]): number {
  return locataire.totalBilled - locataire.totalSettled;
}

function ligneBalance(locataire: (typeof LOCATAIRES)[number]): ClientsBalanceLine {
  return {
    accountId: locataire.accountId,
    tenantClientId: locataire.tenantClientId,
    label: locataire.label,
    propertyLabels: locataire.propertyLabels,
    totalBilled: locataire.totalBilled,
    totalSettled: locataire.totalSettled,
    balance: balanceDe(locataire),
    currency: CURRENCY
  };
}

function ligneBalanceAgee(locataire: (typeof LOCATAIRES)[number]): ClientsAgingBalanceLine {
  return { ...ligneBalance(locataire), ...locataire.tranches };
}

function construireBalance(lignes: ClientsBalanceLine[]): ClientsBalance {
  return { lines: lignes, totalBalance: lignes.reduce((somme, l) => somme + l.balance, 0), currency: CURRENCY };
}

function construireBalanceAgee(lignes: ClientsAgingBalanceLine[]): ClientsAgingBalance {
  return { lines: lignes, totalBalance: lignes.reduce((somme, l) => somme + l.balance, 0), currency: CURRENCY };
}

export const BALANCE_CLIENTS: ClientsBalance = construireBalance(LOCATAIRES.map(ligneBalance));

export const BALANCE_AGEE: ClientsAgingBalance = construireBalanceAgee(LOCATAIRES.map(ligneBalanceAgee));

/**
 * Vue partielle : un sous-ensemble de trois locataires, comme le tableau de
 * bord (`mock-api.ts`, `tableauPartiel`) rend certaines sections `null` pour
 * un rôle à droits restreints. Ici, le périmètre visible est simplement plus
 * étroit — pas de section manquante, une balance plus courte, cohérente avec
 * elle-même (le total de contrôle correspond aux lignes montrées).
 */
const LOCATAIRES_PARTIEL = LOCATAIRES.slice(0, 3);
const BALANCE_CLIENTS_PARTIEL: ClientsBalance = construireBalance(LOCATAIRES_PARTIEL.map(ligneBalance));
const BALANCE_AGEE_PARTIEL: ClientsAgingBalance = construireBalanceAgee(LOCATAIRES_PARTIEL.map(ligneBalanceAgee));

const BALANCE_VIDE: ClientsBalance = { lines: [], totalBalance: 0, currency: CURRENCY };
const BALANCE_AGEE_VIDE: ClientsAgingBalance = { lines: [], totalBalance: 0, currency: CURRENCY };

export function repondreBalances(chemin: string, scenario: Scenario): unknown | null {
  if (/\/tenants\/[^/]+\/finance\/clients\/balance$/.test(chemin)) {
    const data =
      scenario === 'vide' ? BALANCE_VIDE : scenario === 'partiel' ? BALANCE_CLIENTS_PARTIEL : BALANCE_CLIENTS;
    return { success: true, data };
  }

  if (/\/tenants\/[^/]+\/finance\/clients\/balance-agee$/.test(chemin)) {
    const data = scenario === 'vide' ? BALANCE_AGEE_VIDE : scenario === 'partiel' ? BALANCE_AGEE_PARTIEL : BALANCE_AGEE;
    return { success: true, data };
  }

  return null;
}
