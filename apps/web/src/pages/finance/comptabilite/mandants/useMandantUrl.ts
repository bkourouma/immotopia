import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { MandantFundsNature } from '../../../../services/accounting-exports-service';
import { useAccountingPeriod } from '../shared';

/** Taille de page de la liste des propriétaires et de la balance. */
export const LIMITE_PROPRIETAIRES = 50;
/** Taille de page des lignes d'un propriétaire (plafond de l'API : 100). */
export const LIMITE_LIGNES = 100;

export type VueMandants = 'grand-livre' | 'balance';

const NATURES: readonly MandantFundsNature[] = ['CURRENT', 'DEPOSIT', 'UNALLOCATED'];

/** Mise à jour d'un ou plusieurs paramètres ; `undefined` ou vide retire la clé. */
export type MajUrl = (updates: Record<string, string | undefined>) => void;

/**
 * Paramètres d'URL propres à l'écran Mandants : `vue`, `owner`, `nature`,
 * `page-lignes` (page du détail) et `date-mandants` (date d'arrêté de la
 * balance, par défaut la fin de la période). `q` et `page` restent à
 * `useListParams`.
 */
export function useMandantUrl() {
  const [params, setParams] = useSearchParams();
  const { to } = useAccountingPeriod();

  const vue: VueMandants = params.get('vue') === 'balance' ? 'balance' : 'grand-livre';
  const owner = params.get('owner') ?? '';
  const brute = params.get('nature') ?? '';
  const nature = (NATURES as readonly string[]).includes(brute) ? (brute as MandantFundsNature) : undefined;
  const pageLignes = Math.max(1, Number(params.get('page-lignes')) || 1);
  const dateArrete = params.get('date-mandants') || to;

  const maj = useCallback<MajUrl>(
    updates => {
      setParams(prev => {
        const next = new URLSearchParams(prev);
        for (const [cle, valeur] of Object.entries(updates)) {
          if (valeur === undefined || valeur === '') next.delete(cle);
          else next.set(cle, valeur);
        }
        return next;
      });
    },
    [setParams]
  );

  return { vue, owner, nature, pageLignes, dateArrete, maj };
}
