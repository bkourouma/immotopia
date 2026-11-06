import { t } from '../../i18n/t';

/**
 * Contrôles des champs numériques de l'assistant de bail (hypothèse H40 : une
 * saisie n'est jamais transformée en silence). Chaque fonction rend un message
 * ou `undefined` ; rien n'est arrondi, tronqué ni remis dans les bornes.
 * Bornes alignées sur `packages/api/src/lib/rental/schemas.ts` et sur les
 * colonnes `Decimal(12, 2)` (montants) et `Decimal(12, 4)` (taux).
 */

export const MONTANT_MAX = 9_999_999_999.99;
export const TAUX_MAX = 99_999_999.9999;

export interface ChampsNumeriquesBail {
  dueDayOfMonth: string;
  rentAmount: string;
  serviceChargeAmount: string;
  securityDepositAmount: string;
  penaltyGraceDays: string;
  penaltyMode: string;
  penaltyRate: string;
  penaltyFixedAmount: string;
  penaltyCapAmount: string;
}

const vide = (valeur: string): boolean => valeur.trim() === '';

/** Au plus `decimales` décimales (« 1500,555 » est refusé, pas arrondi). */
function nombreDecimales(valeur: number): number {
  const texte = String(valeur);
  if (/e/i.test(texte)) return Number.isInteger(valeur) ? 0 : 99;
  return texte.split('.')[1]?.length ?? 0;
}

function erreurMontant(valeur: string, options: { requis: boolean; strictementPositif: boolean }): string | undefined {
  if (vide(valeur)) return options.requis ? t('Le montant du loyer doit être supérieur à 0') : undefined;
  const nombre = Number(valeur.replace(/\s/g, ''));
  if (!Number.isFinite(nombre)) return t('Le montant doit être positif');
  if (options.strictementPositif ? nombre <= 0 : nombre < 0) {
    return options.strictementPositif
      ? t('Le montant du loyer doit être supérieur à 0')
      : t('Le montant doit être positif');
  }
  if (nombre > MONTANT_MAX) return t('Le montant dépasse le maximum autorisé (9 999 999 999,99).');
  if (nombreDecimales(nombre) > 2) return t('Deux décimales au plus');
  return undefined;
}

function erreurEntier(valeur: string, min: number, max: number | null, messageBornes: string): string | undefined {
  if (vide(valeur)) return min > 0 ? messageBornes : undefined;
  const nombre = Number(valeur);
  if (!Number.isFinite(nombre) || !Number.isInteger(nombre)) return t('Saisissez un nombre entier');
  if (nombre < min || (max !== null && nombre > max)) return messageBornes;
  return undefined;
}

/** Étape « Informations financières ». */
export function erreursFinancieres(f: ChampsNumeriquesBail): Record<string, string> {
  const erreurs: Record<string, string> = {};
  const jour = erreurEntier(f.dueDayOfMonth, 1, 31, t("Le jour d'échéance doit être entre 1 et 31"));
  if (jour) erreurs.dueDayOfMonth = jour;
  const loyer = erreurMontant(f.rentAmount, { requis: true, strictementPositif: true });
  if (loyer) erreurs.rentAmount = loyer;
  const charges = erreurMontant(f.serviceChargeAmount, { requis: false, strictementPositif: false });
  if (charges) erreurs.serviceChargeAmount = charges;
  const depot = erreurMontant(f.securityDepositAmount, { requis: false, strictementPositif: false });
  if (depot) erreurs.securityDepositAmount = depot;
  return erreurs;
}

/** Étape « Pénalités » : seuls les champs affichés selon le mode sont contrôlés. */
export function erreursPenalites(f: ChampsNumeriquesBail): Record<string, string> {
  const erreurs: Record<string, string> = {};
  const grace = erreurEntier(f.penaltyGraceDays, 0, null, t('Le nombre de jours doit être positif ou nul'));
  if (grace) erreurs.penaltyGraceDays = grace;

  if (f.penaltyMode === 'PERCENT_OF_BALANCE') {
    if (!vide(f.penaltyRate)) {
      const taux = Number(f.penaltyRate);
      if (!Number.isFinite(taux) || taux < 0) erreurs.penaltyRate = t('Le taux doit être positif ou nul');
      else if (taux > TAUX_MAX) erreurs.penaltyRate = t('Le taux dépasse le maximum autorisé (99 999 999,9999).');
      else if (nombreDecimales(taux) > 4) erreurs.penaltyRate = t('Quatre décimales au plus');
    }
    const plafond = erreurMontant(f.penaltyCapAmount, { requis: false, strictementPositif: false });
    if (plafond) erreurs.penaltyCapAmount = plafond;
  }
  if (f.penaltyMode === 'FIXED_AMOUNT') {
    const fixe = erreurMontant(f.penaltyFixedAmount, { requis: false, strictementPositif: false });
    if (fixe) erreurs.penaltyFixedAmount = fixe;
  }
  return erreurs;
}
