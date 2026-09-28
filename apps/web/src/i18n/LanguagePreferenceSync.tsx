import { useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from './useLanguage';
import { updatePreferredLanguage } from '../services/auth-service';
import { isLanguage, LANGUAGE_STORAGE_KEY } from './config';

/**
 * Relie la langue affichée au compte connecté. Ne rend rien.
 *
 * Deux sens, et un seul point de bascule entre eux :
 *
 *   - **à la connexion**, une fois par compte (par `user.id`, jamais rejoué au
 *     seul renouvellement de l'objet `user` — un `/me` qui rapporte une
 *     préférence périmée ne doit pas ramener une ancienne langue) : si le
 *     compte a une langue enregistrée, elle **prime** et s'applique, point
 *     final — voir plus bas pour le cas où il n'en a pas. Se rejoue à chaque
 *     changement de compte (déconnexion puis connexion d'un autre) puisque
 *     `user.id` change alors ;
 *   - **quand la personne change de langue** en étant connectée, on remonte
 *     ce choix au compte, une seule fois par bascule.
 *
 * Sans préférence enregistrée sur le compte, la langue affichée (choix local
 * explicite déjà mémorisé dans `localStorage`, ou simple repli navigateur) est
 * conservée telle quelle. Le compte est mis à jour SEULEMENT si elle vient
 * d'un choix explicite : un repli navigateur, personne ne l'a choisi, il ne
 * doit rien écrire sur le compte de qui que ce soit.
 *
 * Monté **sous** `<AuthProvider>` : `<LanguageProvider>` est plus haut dans
 * l'arbre et n'a pas accès à la session.
 */
export function LanguagePreferenceSync(): null {
  const { user, isAuthenticated } = useAuth();
  const { language, setLanguage, initialLanguageResolved } = useLanguage();

  // La langue déjà connue du serveur pour ce compte. Sert à n'envoyer une
  // requête que lorsque le choix change réellement.
  const savedLanguage = useRef<string | null | undefined>(undefined);

  // Compte pour lequel la préférence a déjà été appliquée — la clé du
  // « une fois par identifiant », pas à chaque nouvel objet `user`.
  const appliedForUserId = useRef<string | null>(null);

  // 1. Connexion (ou changement de compte) : adopter la langue du compte si
  // elle existe, sinon garder celle déjà affichée.
  useEffect(() => {
    if (!isAuthenticated || !user) {
      savedLanguage.current = undefined;
      appliedForUserId.current = null;
      return;
    }

    // Déjà traité pour ce compte : un `/me` qui renvoie un nouvel objet
    // `user` (même id) ne doit pas rejouer la bascule, sous peine de ramener
    // une préférence périmée par-dessus un changement fait entre-temps.
    if (appliedForUserId.current === user.id) return;

    if (isLanguage(user.preferredLanguage)) {
      appliedForUserId.current = user.id;
      const preferred = user.preferredLanguage;
      // On appelle TOUJOURS `setLanguage(preferred)`, même si `language`
      // semble déjà égal à `preferred` : `language` peut encore valoir le
      // `'fr'` initial de `LanguageProvider` alors qu'une bascule de montage
      // (choix local explicite mémorisé, ou repli navigateur) est en cours
      // vers une autre langue. Sauter l'appel dans ce cas revient à ne rien
      // faire pendant que cette bascule concurrente aboutit, qui écrase alors
      // la préférence du compte sans que personne n'ait de second appel pour
      // la corriger — la garde « dernier appel gagnant » du provider
      // (`languageRequestId`) n'a alors qu'un seul appel en course et ne peut
      // pas faire gagner `preferred`. Un appel vers une langue déjà affichée
      // pour de bon est sans effet perceptible : le provider le résout vite
      // (catalogue déjà en place) et n'écrit rien de nouveau à l'écran.
      //
      // La bascule est asynchrone (catalogue à charger) : tant qu'elle n'a pas
      // abouti, `savedLanguage.current` reste `undefined` plutôt que
      // `preferred`. Le fixer tout de suite ferait voir à l'effet 2, DANS LE
      // MÊME RENDU, un `language` encore ancien différer de la valeur du
      // compte — et renvoyer au serveur une préférence qu'il connaît déjà.
      savedLanguage.current = undefined;
      void setLanguage(preferred)
        .catch(() => {
          // La bascule d'affichage a échoué (catalogue injoignable, par
          // exemple), mais le serveur connaît déjà `preferred` : il n'y a
          // rien à lui renvoyer. Sans ce `catch`, `savedLanguage.current`
          // restait `undefined` pour toujours — l'effet 2 (garde
          // `=== undefined`) ne remontait alors plus jamais aucun
          // changement de langue explicite pour ce compte.
        })
        .then(() => {
          savedLanguage.current = preferred;
        });
      return;
    }

    // Aucune préférence enregistrée. La langue affichée le reste, mais son
    // origine décide si elle doit être écrite sur le compte :
    //   - un choix explicite (sélecteur, page de profil) est déjà mémorisé
    //     dans `localStorage` — on le publie, l'effet 2 s'en charge ;
    //   - un simple repli navigateur n'y est jamais écrit (`LanguageProvider`,
    //     `persist: false`) — rien ne doit partir vers le compte.
    //
    // Encore faut-il que `language` soit stable avant de le lire : si la
    // session était déjà active au tout premier rendu (cookie valide, pas une
    // connexion fraîche), la détection initiale de `LanguageProvider` (montage,
    // navigateur ou choix mémorisé) peut ne pas avoir fini d'appliquer sa
    // bascule — `language` vaudrait alors encore le `'fr'` initial. Fixer la
    // référence sur cette valeur transitoire ferait voir à l'effet 2, une fois
    // la bascule aboutie, un `language` qui « a changé » — et publierait un
    // repli navigateur que personne n'a choisi. `appliedForUserId` n'est donc
    // marqué qu'une fois la référence réellement fixée : tant que
    // `initialLanguageResolved` est faux, cet effet est rejoué sans rien
    // faire (et PAS `isSwitching` : les effets d'un composant enfant comme
    // celui-ci se déclenchent avant ceux du provider au montage, donc avant
    // même qu'`isSwitching` ne passe à `true` pour la détection initiale —
    // `initialLanguageResolved` part, lui, correctement à `false` dès le
    // premier rendu, quel que soit l'ordre des effets).
    if (!initialLanguageResolved) return;
    appliedForUserId.current = user.id;

    let chosenExplicitement = false;
    try {
      chosenExplicitement = isLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
    } catch {
      // Stockage refusé : on considère qu'aucun choix local n'existe.
    }
    // `null` fait considérer le serveur « à zéro » : la langue affichée en
    // diffère forcément, ce qui déclenche sa publication par l'effet 2. La
    // langue elle-même, à l'inverse, fait paraître le serveur déjà à jour :
    // rien ne part pour un repli que personne n'a choisi.
    savedLanguage.current = chosenExplicitement ? null : language;
    // `language` est lu, volontairement pas dans les dépendances : le
    // réintroduire relancerait cet effet à chaque bascule, ce que la garde
    // `appliedForUserId` neutralise déjà — l'inclure ajouterait juste des
    // exécutions sans effet. `initialLanguageResolved`, lui, DOIT y être :
    // c'est ce qui rejoue l'effet une fois la détection initiale aboutie,
    // pour relire `language` une fois stable plutôt que sur sa valeur
    // transitoire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user, setLanguage, initialLanguageResolved]);

  // 2. Changement de langue en session : le remonter au compte, une fois.
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (savedLanguage.current === undefined) return;
    if (savedLanguage.current === language) return;

    savedLanguage.current = language;
    updatePreferredLanguage(language).catch(() => {
      // Échec silencieux, et c'est voulu : la langue est déjà appliquée à
      // l'écran et mémorisée localement. Interrompre l'utilisateur pour une
      // préférence qui se resynchronisera au prochain changement serait
      // disproportionné.
      savedLanguage.current = undefined;
    });
  }, [language, isAuthenticated, user]);

  return null;
}
