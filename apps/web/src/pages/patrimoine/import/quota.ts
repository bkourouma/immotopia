import { t } from '../../../i18n/t';
import type { QuotaPolicyCode, TenantEntitlements } from '../../../services/subscription-v2-service';

/**
 * Estimation du quota avant l'import des biens — pure, sans réseau.
 *
 * Miroir de `packages/api/src/services/lot-registry-service.ts` et de
 * `lib/subscription/guards.ts` (`checkQuota` / `evaluateQuota`) :
 *
 *  - un bien créé par l'import est un bien de l'agence (TENANT, AVAILABLE) ;
 *  - une agence qui détient un pack à capacité BIENS_DETENUS compte CHAQUE
 *    ligne dans BIENS_DETENUS (un brouillon compte, le mode n'y change rien) ;
 *  - sinon, seule une ligne proposée à la location (RENTAL) ou en saisonnier
 *    (SHORT_TERM) compte, dans LOTS ; les autres ne comptent nulle part.
 *
 * L'estimation est INDICATIVE : le serveur reste l'autorité et peut refuser
 * (ou facturer) autrement, par exemple si le quota a bougé entre-temps.
 */

export type CapaciteImport = 'BIENS_DETENUS' | 'LOTS';

export interface LigneQuota {
  numero: number;
  /** Modes de transaction : 'SALE', 'RENTAL', 'SHORT_TERM'. */
  modes: string[];
}

export interface EstimationQuota {
  /** Au moins une ligne compte dans une capacité. */
  applicable: boolean;
  capacite: CapaciteImport | null;
  politique: QuotaPolicyCode;
  enforcement: TenantEntitlements['enforcement'];
  /** Place restante avant l'import ; `null` quand aucune capacité ne s'applique. */
  restant: number | null;
  /** Numéros des lignes qui seront envoyées (ordre du fichier). */
  passent: number[];
  /** Numéros des lignes que l'estimation retient avant envoi. */
  horsQuota: number[];
  /** Nombre de lignes au-delà du plafond, facturées au titre du dépassement. */
  depassementFacture: number;
  message: string;
}

const MODES_LOCATIFS = new Set(['RENTAL', 'SHORT_TERM']);

/** Vrai si la ligne compte dans LOTS : proposée à la location ou en saisonnier. */
export function ligneCompteDansLots(modes: string[]): boolean {
  return modes.some(mode => MODES_LOCATIFS.has(mode.trim().toUpperCase()));
}

function choisirCapacite(entitlements: TenantEntitlements): CapaciteImport {
  // `included` : la capacité apportée par un pack. Une limite non nulle venue
  // d'une extension ou d'une surcharge ne suffit pas à changer de capacité.
  const detenus = entitlements.capacities?.BIENS_DETENUS;
  return detenus && detenus.included > 0 ? 'BIENS_DETENUS' : 'LOTS';
}

const INDICATIF = 'Estimation indicative : le serveur reste l’autorité.';

function construireMessage(
  capacite: CapaciteImport | null,
  options: {
    comptent: number;
    restant: number;
    depassement: number;
    politique: QuotaPolicyCode;
    enforcement: TenantEntitlements['enforcement'];
    retenues: number;
  }
): string {
  if (capacite === null || options.comptent === 0) {
    return t('Aucune de ces lignes ne compte dans la capacité de votre abonnement. {{indicatif}}', {
      indicatif: t(INDICATIF)
    });
  }
  const nom = capacite === 'BIENS_DETENUS' ? t('biens détenus') : t('lots');
  const base = t('{{comptent}} ligne(s) comptent dans vos {{nom}} ; place restante : {{restant}}.', {
    comptent: options.comptent,
    nom,
    restant: options.restant
  });
  let suite = '';
  if (options.depassement > 0) {
    if (options.enforcement === 'enforce' && options.politique === 'BLOCK') {
      suite = t('{{retenues}} ligne(s) ne seront pas envoyées : capacité atteinte.', { retenues: options.retenues });
    } else if (options.enforcement === 'enforce' && options.politique === 'BILL_OVERAGE') {
      suite = t('{{depassement}} ligne(s) dépassent le plafond : le dépassement sera facturé.', {
        depassement: options.depassement
      });
    } else if (options.enforcement === 'off') {
      suite = t('{{depassement}} ligne(s) dépassent le plafond ; aucun contrôle n’est actif.', {
        depassement: options.depassement
      });
    } else {
      suite = t('{{depassement}} ligne(s) dépassent le plafond : avertissement seulement, elles seront envoyées.', {
        depassement: options.depassement
      });
    }
  }
  return [base, suite, t(INDICATIF)].filter(Boolean).join(' ');
}

/**
 * Estime ce que le quota laissera passer. `lignes` : les lignes prêtes à
 * partir, dans l'ordre du fichier.
 */
export function evaluerQuotaBiens(entitlements: TenantEntitlements, lignes: LigneQuota[]): EstimationQuota {
  const politique = entitlements.quotaPolicy;
  const enforcement = entitlements.enforcement;
  const capaciteChoisie = choisirCapacite(entitlements);
  const comptent = lignes.filter(ligne => capaciteChoisie === 'BIENS_DETENUS' || ligneCompteDansLots(ligne.modes));
  const applicable = comptent.length > 0;
  const capacite = applicable ? capaciteChoisie : null;

  const etat = entitlements.capacities?.[capaciteChoisie];
  const restant = applicable && etat ? Math.max(0, etat.limit - etat.used) : null;

  const bloque = enforcement === 'enforce' && politique === 'BLOCK';
  const horsQuota: number[] = [];
  const passent: number[] = [];
  let rang = 0;
  let depassement = 0;
  for (const ligne of lignes) {
    const compte = capaciteChoisie === 'BIENS_DETENUS' || ligneCompteDansLots(ligne.modes);
    if (!compte || restant === null) {
      passent.push(ligne.numero);
      continue;
    }
    rang += 1;
    if (rang > restant) {
      depassement += 1;
      if (bloque) {
        horsQuota.push(ligne.numero);
        continue;
      }
    }
    passent.push(ligne.numero);
  }

  const depassementFacture = enforcement === 'enforce' && politique === 'BILL_OVERAGE' ? depassement : 0;

  return {
    applicable,
    capacite,
    politique,
    enforcement,
    restant,
    passent,
    horsQuota,
    depassementFacture,
    message: construireMessage(capacite, {
      comptent: comptent.length,
      restant: restant ?? 0,
      depassement,
      politique,
      enforcement,
      retenues: horsQuota.length
    })
  };
}
