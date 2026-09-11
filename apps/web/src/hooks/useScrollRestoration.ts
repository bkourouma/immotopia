import { useEffect, useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Restauration de la position de défilement (REFONTE_UI_UX.md §9, Lot 1).
 *
 * Dernier critère de sortie du Lot 1 resté ouvert. Sa condition préalable a été
 * posée là-bas — la coquille ne se démonte plus entre deux écrans — mais rien
 * ne restaurait la position : revenir d'une fiche de bien ramenait en haut
 * d'une liste de cinquante éléments, et il fallait redescendre à la main.
 *
 * `<ScrollRestoration>` de React Router n'est pas utilisable ici : il n'existe
 * que pour les routeurs de données (`createBrowserRouter`), et l'application
 * utilise `<BrowserRouter>` avec `<Routes>`.
 *
 * Trois règles, une par type de navigation :
 *
 * - **Retour arrière (`POP`)** : on restaure. C'est le seul cas où
 *   l'utilisateur revient à quelque chose qu'il a déjà lu.
 * - **Nouvelle destination (`PUSH`)** : on remonte en haut. Cela couvre aussi
 *   le changement de filtre ou de page, qui passent par l'URL : de nouveaux
 *   résultats se lisent depuis le début.
 * - **Remplacement (`REPLACE`)** : on ne touche à rien. C'est une réécriture
 *   d'URL sans changement d'écran ; déplacer la vue serait incompréhensible.
 *
 * Le point délicat est le **moment** de la restauration. Au retour, la liste
 * n'est pas encore peinte : le document est court, et un `scrollTo` immédiat
 * est écrêté à la hauteur disponible — c'est-à-dire à zéro. La restauration
 * réessaie donc image par image, jusqu'à ce que le document soit assez haut ou
 * que le budget expire. Le cache de React Query rend ce cas fréquent et rapide
 * : la donnée est là au premier rendu, et la position revient sans clignotement
 * visible.
 */

/**
 * Positions mémorisées, par clé d'entrée d'historique.
 *
 * `location.key` est propre à chaque entrée : deux visites successives de la
 * même URL ont deux clés, et donc deux positions distinctes. Une carte en
 * mémoire suffit — au rechargement de la page, l'historique applicatif est de
 * toute façon reconstruit.
 */
const positions = new Map<string, number>();

// Sonde de développement. `import.meta.env.DEV` est remplacé par `false` au
// build, et Rollup élimine la branche : rien de ceci ne part en production.
if (import.meta.env.DEV) {
  (window as unknown as { __positionsDefilement?: Map<string, number> }).__positionsDefilement = positions;
}

/**
 * Clé de l'entrée d'historique actuellement affichée.
 *
 * **Au niveau du module, et non dans un `useRef`.** C'est la troisième tentative,
 * et la raison mérite d'être écrite : un repère de composant est réinitialisé à
 * chaque remontage, et le composant qui porte ce hook remonte précisément quand
 * la route change. Le repère prenait donc la NOUVELLE clé avant qu'on ait pu
 * comparer, la comparaison était toujours fausse, et rien n'était jamais
 * enregistré — carte vide, position jamais restaurée.
 *
 * L'historique du navigateur est global ; son suivi doit l'être aussi.
 */
let cleAffichee: string | null = null;

/**
 * Dernière position de défilement observée, tenue par un écouteur.
 *
 * Elle ne peut PAS être lue au moment de la navigation. La mesure l'a montré
 * sans ambiguïté : en lisant `window.scrollY` dans l'effet de disposition, on
 * obtenait **631 px pour une position réelle de 700**. À cet instant le DOM du
 * nouvel écran est déjà en place ; s'il est plus court que le précédent — un
 * détail après une longue liste, le cas courant —, le navigateur a déjà écrêté
 * la position à la nouvelle hauteur disponible. La valeur lue n'est plus celle
 * qu'on voulait retenir.
 *
 * L'écouteur, lui, l'a enregistrée pendant que la liste était encore affichée.
 */
let dernierePosition = 0;

/** Durée maximale d'attente du contenu, en millisecondes. */
const BUDGET_MS = 1_000;

export function useScrollRestoration(): void {
  const location = useLocation();
  const navigationType = useNavigationType();

  /**
   * On coupe la restauration native du navigateur.
   *
   * Par défaut, `history.scrollRestoration` vaut `'auto'` : au retour arrière,
   * le navigateur repositionne lui-même la vue — mais il le fait AVANT que
   * React ait re-rendu la liste. Le document est alors court, et sa consigne
   * est écrêtée à la hauteur disponible.
   *
   * Ce n'était pas une hypothèse : la mesure a donné **633 px pour une position
   * attendue de 700**, l'écart exact entre ce que le navigateur pouvait
   * atteindre à cet instant et ce qu'il fallait atteindre. Deux mécanismes se
   * disputaient la position, et le plus rapide gagnait avec la mauvaise valeur.
   */
  useEffect(() => {
    const onScroll = () => {
      dernierePosition = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!('scrollRestoration' in window.history)) return;
    const precedent = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = precedent;
    };
  }, []);

  /**
   * `useLayoutEffect` et non `useEffect` : la première tentative doit avoir lieu
   * AVANT la peinture, sinon l'utilisateur voit la liste en haut pendant une
   * image, puis sauter à sa position. Ce clignotement est précisément ce qu'on
   * cherche à éviter.
   */
  useLayoutEffect(() => {
    /**
     * Mémoriser la position que l'on QUITTE, avant toute autre décision.
     *
     * Elle est lue sur `window.scrollY` à cet instant précis, et non dans le
     * repère tenu par l'écouteur de défilement. Deux tentatives précédentes ont
     * échoué à la mesure, chacune pour une raison qui vaut d'être retenue :
     *
     * - Enregistrer au **démontage** ne marche que si le composant est démonté.
     *   React réutilise l'instance quand deux routes rendent le même type de
     *   composant à la même position, et le nettoyage ne partait jamais.
     * - Enregistrer depuis l'**écouteur de défilement** suppose que l'événement
     *   soit parvenu. `window.scrollTo` ne le déclenche qu'à l'image suivante,
     *   et une navigation immédiate le devance.
     *
     * Lire `window.scrollY` ici ne dépend d'aucun des deux : c'est le dernier
     * instant où la position de l'écran quitté est encore celle du document,
     * avant que la restauration ou le retour en haut ne l'écrasent.
     */
    if (cleAffichee !== null && cleAffichee !== location.key) {
      positions.set(cleAffichee, dernierePosition);
    }
    cleAffichee = location.key;
    // La position de référence repart de celle du nouvel écran.
    dernierePosition = window.scrollY;

    if (navigationType === 'REPLACE') return;

    if (navigationType === 'PUSH') {
      window.scrollTo(0, 0);
      return;
    }

    const cible = positions.get(location.key);
    if (cible === undefined || cible === 0) {
      window.scrollTo(0, 0);
      return;
    }

    let annule = false;
    const debut = performance.now();
    const minuteries: number[] = [];

    const atteint = () => Math.abs(window.scrollY - cible) <= 1;

    const essayer = () => {
      if (annule) return;
      window.scrollTo(0, cible);
      if (atteint() || performance.now() - debut >= BUDGET_MS) return;
      replanifier();
    };

    /**
     * Deux relances en parallèle, et c'est délibéré.
     *
     * `requestAnimationFrame` est le bon outil quand le document se peint
     * normalement. Mais il est bridé — parfois suspendu — dans un onglet en
     * arrière-plan ou une fenêtre masquée, et la restauration ne se faisait
     * alors PAS DU TOUT : constaté à la mesure, position restée à zéro pendant
     * que le budget s'écoulait sans qu'une seule image ne passe.
     *
     * Le minuteur assure le plancher. Les deux visent la même position et
     * s'arrêtent au même test : la redondance ne coûte qu'un `scrollTo` de
     * plus, qui ne fait rien quand la position est déjà bonne.
     */
    const replanifier = () => {
      requestAnimationFrame(essayer);
      minuteries.push(window.setTimeout(essayer, 32));
    };

    // Première tentative tout de suite, avant peinture.
    essayer();

    return () => {
      annule = true;
      minuteries.forEach(window.clearTimeout);
    };
  }, [location.key, navigationType]);
}

/** Réservé aux tests : vide les positions mémorisées. */
export function _viderPositions(): void {
  positions.clear();
}
