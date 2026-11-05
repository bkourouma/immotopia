import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface EcheanceSelectionnable {
  id: string;
  balance: number;
}

/**
 * Nombre maximal d'échéances par paiement en ligne : même borne que le serveur
 * (`max(24)` dans packages/api/src/controllers/tenant-portal-online-payment-controller.ts).
 */
export const MAX_INSTALLMENTS_PER_ONLINE_PAYMENT = 24;

/**
 * Recale la sélection sur les lignes reçues : le montant des ids présents dans la page suit
 * leur reste à payer, ceux dont il ne reste rien à payer sortent. Les ids absents de la page
 * restent inchangés. Renvoie le même objet quand rien ne change (pas de rendu inutile).
 */
function recaler(montants: Record<string, number>, page: EcheanceSelectionnable[] | undefined): Record<string, number> {
  if (!page || page.length === 0) return montants;
  let suivant: Record<string, number> | null = null;
  for (const ligne of page) {
    if (!(ligne.id in montants)) continue;
    if (ligne.balance <= 0) {
      suivant ??= { ...montants };
      delete suivant[ligne.id];
    } else if (montants[ligne.id] !== ligne.balance) {
      suivant ??= { ...montants };
      suivant[ligne.id] = ligne.balance;
    }
  }
  return suivant ?? montants;
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
 * @param pageRecue Lignes de la page reçue du serveur : à chaque rechargement, les montants
 *   des échéances sélectionnées qu'elle contient sont recalés.
 */
export function useSelectionEcheances(criteres: unknown, pageRecue?: EcheanceSelectionnable[]) {
  const [montants, setMontants] = useState<Record<string, number>>({});
  const signature = JSON.stringify(criteres);
  const signaturePrecedente = useRef(signature);

  useEffect(() => {
    if (signaturePrecedente.current === signature) return;
    signaturePrecedente.current = signature;
    setMontants({});
  }, [signature]);

  useEffect(() => {
    setMontants(precedent => recaler(precedent, pageRecue));
  }, [pageRecue]);

  /** À brancher sur `rowSelection.onChange` ; `page` = lignes de la page affichée. */
  const surChangement = useCallback((cles: React.Key[], page: EcheanceSelectionnable[]) => {
    const idsPage = new Set(page.map(ligne => ligne.id));
    const choisies = new Set(cles.map(String));
    setMontants(precedent => {
      const suivant: Record<string, number> = {};
      for (const [id, montant] of Object.entries(precedent)) {
        if (!idsPage.has(id)) suivant[id] = montant;
      }
      let nombre = Object.keys(suivant).length;
      for (const ligne of page) {
        if (!choisies.has(ligne.id) || ligne.balance <= 0) continue;
        // Jamais plus que la limite du serveur : les ajouts au-delà sont ignorés.
        if (!(ligne.id in precedent) && nombre >= MAX_INSTALLMENTS_PER_ONLINE_PAYMENT) continue;
        suivant[ligne.id] = ligne.balance;
        nombre += 1;
      }
      return suivant;
    });
  }, []);

  return useMemo(() => {
    const ids = Object.keys(montants);
    return {
      ids,
      count: ids.length,
      max: MAX_INSTALLMENTS_PER_ONLINE_PAYMENT,
      limiteAtteinte: ids.length >= MAX_INSTALLMENTS_PER_ONLINE_PAYMENT,
      total: ids.reduce((somme, id) => somme + montants[id], 0),
      surChangement
    };
  }, [montants, surChangement]);
}
