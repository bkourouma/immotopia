import type { StockErrorCode, StockErrorData } from '../../../../types/finance-stock-controle-types';

/**
 * Lecture d'une erreur d'écriture du stock (ecrans §3.7 et §3.9), partagée par
 * l'écran Magasin (E2) et l'écran Transferts et inventaire (E3).
 *
 * Le message du serveur est relayé tel quel (`err.response.data.message`),
 * avec un texte de secours ; le code (`err.response.data.code`) déclenche le
 * comportement d'écran prévu. Une erreur **sans réponse** est une coupure
 * réseau : le formulaire reste rempli et l'identifiant de requête est gardé,
 * pour qu'un réessai ne crée jamais une seconde opération.
 */
export interface StockErreurLue {
  /** Aucune réponse du serveur : coupure réseau, délai dépassé. */
  reseau: boolean;
  status: number | null;
  code: StockErrorCode | string | null;
  /** Message du serveur, ou texte de secours. */
  message: string;
  /** `data.items` des refus qui nomment des articles. */
  items: Array<{ itemId: string; itemLabel: string }>;
  existingTakerId: string | null;
}

interface ReponseErreur {
  status?: number;
  data?: { message?: unknown; code?: unknown; data?: StockErrorData | null };
}

export function lireErreurStock(err: unknown, secours: string): StockErreurLue {
  const response = (err as { response?: ReponseErreur } | null)?.response;
  if (!response) {
    return { reseau: true, status: null, code: null, message: secours, items: [], existingTakerId: null };
  }
  const body = response.data ?? {};
  const message = typeof body.message === 'string' && body.message.trim() ? body.message : secours;
  const code = typeof body.code === 'string' ? body.code : null;
  const items = body.data?.items && Array.isArray(body.data.items) ? body.data.items : [];
  return {
    reseau: false,
    status: typeof response.status === 'number' ? response.status : null,
    code,
    message,
    items,
    existingTakerId: body.data?.existingTakerId ? String(body.data.existingTakerId) : null
  };
}

/**
 * Faut-il tirer un nouvel identifiant de requête après cette erreur ? Oui
 * après toute réponse du serveur (un `4xx` oblige à modifier le formulaire,
 * et réutiliser l'identifiant avec un autre corps donnerait
 * `409 STOCK_IDEMPOTENCY_MISMATCH`) ; non après une coupure réseau.
 */
export function faitTirerNouvelIdentifiant(erreur: StockErreurLue): boolean {
  return !erreur.reseau;
}

/** Les codes qui mettent en erreur le choix du preneur ou du demandeur. */
export const CODES_PRENEUR: ReadonlyArray<string> = [
  'STOCK_TAKER_REQUIRED',
  'STOCK_REQUESTER_REQUIRED',
  'STOCK_TAKER_INACTIVE'
];

/** Les codes qui mettent en erreur le motif ou sa précision. */
export const CODES_MOTIF: ReadonlyArray<string> = ['STOCK_REASON_REQUIRED', 'STOCK_REASON_NOT_ALLOWED'];

/** Les codes qui mettent en erreur la date. */
export const CODES_DATE: ReadonlyArray<string> = ['STOCK_DATE_IN_FUTURE', 'STOCK_DATE_TOO_OLD'];
