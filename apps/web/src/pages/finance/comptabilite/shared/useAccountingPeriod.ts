import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';

/**
 * Période d'une sous-page comptable, portée par l'URL (`?from=&to=`, format
 * `YYYY-MM-DD`). Sans paramètre : du 1er janvier de l'année à aujourd'hui
 * (hypothèse H2 : l'exercice est l'année civile). Les valeurs par défaut ne
 * sont pas écrites dans l'URL.
 *
 * Changer la période repart de la première page : `page` quitte l'URL, les
 * autres paramètres (journal, account, search…) restent.
 */

export const PERIOD_FROM_KEY = 'from';
export const PERIOD_TO_KEY = 'to';
const PAGE_KEY = 'page';
const ISO = 'YYYY-MM-DD';

export function useAccountingPeriod(): {
  from: string;
  to: string;
  setPeriod: (from: string, to: string) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const from = searchParams.get(PERIOD_FROM_KEY) || dayjs().startOf('year').format(ISO);
  const to = searchParams.get(PERIOD_TO_KEY) || dayjs().format(ISO);

  const setPeriod = useCallback(
    (nextFrom: string, nextTo: string) => {
      setSearchParams(prev => {
        const params = new URLSearchParams(prev);
        params.set(PERIOD_FROM_KEY, nextFrom);
        params.set(PERIOD_TO_KEY, nextTo);
        params.delete(PAGE_KEY);
        return params;
      });
    },
    [setSearchParams]
  );

  return { from, to, setPeriod };
}
