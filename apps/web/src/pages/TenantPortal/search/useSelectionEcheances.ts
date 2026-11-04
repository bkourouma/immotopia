import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface EcheanceSelectionnable {
  id: string;
  balance: number;
}

/**
 * Sélection des échéances à régler en ligne, conservée d'une page à l'autre de la
 * liste paginée côté serveur : id -> montant (reste à payer de la ligne).
 *
 * Le total, le nombre et les ids envoyés au paiement viennent tous de cette même
 * sélection, donc le montant affiché est exactement celui des échéances payées.
 * Elle se vide quand les critères de recherche changent (`criteres`), pas quand on
 * change de page ou de taille de page.
 *
 * @param criteres Signature stable des critères de recherche (hors pagination).
 */
export function useSelectionEcheances(criteres: unknown) {
  const [montants, setMontants] = useState<Record<string, number>>({});
  const signature = JSON.stringify(criteres);
  const signaturePrecedente = useRef(signature);

  useEffect(() => {
    if (signaturePrecedente.current === signature) return;
    signaturePrecedente.current = signature;
    setMontants({});
  }, [signature]);

  /** À brancher sur `rowSelection.onChange` ; `page` = lignes de la page affichée. */
  const surChangement = useCallback((cles: React.Key[], page: EcheanceSelectionnable[]) => {
    const idsPage = new Set(page.map(ligne => ligne.id));
    const choisies = new Set(cles.map(String));
    setMontants(precedent => {
      const suivant: Record<string, number> = {};
      for (const [id, montant] of Object.entries(precedent)) {
        if (!idsPage.has(id)) suivant[id] = montant;
      }
      for (const ligne of page) {
        if (choisies.has(ligne.id)) suivant[ligne.id] = ligne.balance;
      }
      return suivant;
    });
  }, []);

  return useMemo(() => {
    const ids = Object.keys(montants);
    return {
      ids,
      count: ids.length,
      total: ids.reduce((somme, id) => somme + montants[id], 0),
      surChangement
    };
  }, [montants, surChangement]);
}
