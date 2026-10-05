import { useCallback, useRef, useState } from 'react';
import { nouvelIdentifiantDeRequete } from '../../../../utils/stock-client-request-id';
import { lireErreurStock, type StockErreurLue } from './stock-erreurs';
import { t } from '../../../../i18n/t';

export type ResultatEnvoi<R> = { ok: true; resultat: R } | { ok: false; erreur: StockErreurLue };

/**
 * Vrai quand l'API a pu valider l'écriture sans que la réponse nous parvienne,
 * ou sans dire qu'elle l'a refusée : pas de réponse du tout (coupure, délai
 * dépassé), un statut illisible, un `5xx`, un `408` ou un `429`. Le même
 * identifiant de requête doit alors repartir au prochain essai : le serveur
 * rejouera l'opération (`200`, « déjà enregistrée ») au lieu de la doubler.
 * Seul un refus `4xx` définitif oblige à en tirer un nouveau (même logique
 * que l'import, `lib/importation/execution.ts`).
 */
export function reponseIncertaine(erreur: { reseau: boolean; status?: number | null }): boolean {
  if (erreur.reseau) return true;
  const statut = erreur.status;
  if (typeof statut !== 'number') return true;
  return statut >= 500 || statut === 408 || statut === 429;
}

/**
 * Cycle de vie de l'identifiant de requête d'une écriture terrain (ecrans
 * §3.7, spec B3-R2) :
 *
 * 1. tiré à l'ouverture du formulaire ou de l'étape récapitulative (`preparer`) ;
 * 2. gardé tel quel à chaque nouvel essai, **y compris après une coupure
 *    réseau sans réponse, un `5xx`, un `408` ou un `429`** (réponse
 *    incertaine : `reponseIncertaine`) ;
 * 3. jeté après un succès, et après un refus `4xx` définitif qui oblige à
 *    modifier le formulaire (le corps changera : le réutiliser donnerait
 *    `409 STOCK_IDEMPOTENCY_MISMATCH`).
 *
 * Pas de mode hors ligne (D3) : rien n'est mis en file d'attente au-delà de la
 * page ouverte.
 */
export function useEnvoiTerrain() {
  const identifiant = useRef<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [coupure, setCoupure] = useState(false);

  /** Tire l'identifiant s'il n'y en a pas encore ; le garde sinon. */
  const preparer = useCallback(() => {
    if (!identifiant.current) identifiant.current = nouvelIdentifiantDeRequete();
    return identifiant.current;
  }, []);

  /** Oublie l'identifiant (formulaire réinitialisé). */
  const oublier = useCallback(() => {
    identifiant.current = null;
    setCoupure(false);
  }, []);

  const envoyer = useCallback(
    async <R>(appel: (clientRequestId: string) => Promise<R>, secours: string): Promise<ResultatEnvoi<R>> => {
      const clientRequestId = identifiant.current ?? nouvelIdentifiantDeRequete();
      identifiant.current = clientRequestId;
      setEnCours(true);
      setCoupure(false);
      try {
        const resultat = await appel(clientRequestId);
        identifiant.current = null;
        return { ok: true, resultat };
      } catch (err) {
        const erreur = lireErreurStock(err, secours);
        if (erreur.reseau) {
          setCoupure(true);
        } else if (!reponseIncertaine(erreur)) {
          identifiant.current = nouvelIdentifiantDeRequete();
          if (erreur.code === 'STOCK_IDEMPOTENCY_MISMATCH') {
            erreur.message = t(
              'Cette opération a déjà été envoyée avec d’autres données. Vérifiez le journal avant de recommencer.'
            );
          }
        }
        return { ok: false, erreur };
      } finally {
        setEnCours(false);
      }
    },
    []
  );

  return { preparer, oublier, envoyer, enCours, coupure };
}
