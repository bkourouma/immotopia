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
 *   - **à la connexion**, si l'utilisateur a une langue enregistrée et qu'il
 *     n'a jamais choisi de langue *sur cet appareil*, on applique la sienne ;
 *   - **quand il change de langue** en étant connecté, on enregistre ce choix.
 *
 * Le « jamais choisi sur cet appareil » est la condition importante. Sans elle,
 * la préférence du compte écraserait le choix que la personne vient de faire
 * dans le sélecteur — elle changerait de langue, rechargerait la page, et
 * retrouverait l'ancienne.
 *
 * Monté **sous** `<AuthProvider>` : `<LanguageProvider>` est plus haut dans
 * l'arbre et n'a pas accès à la session.
 */
export function LanguagePreferenceSync(): null {
  const { user, isAuthenticated } = useAuth();
  const { language, setLanguage } = useLanguage();

  // La langue déjà connue du serveur pour ce compte. Sert à n'envoyer une
  // requête que lorsque le choix change réellement.
  const savedLanguage = useRef<string | null | undefined>(undefined);

  // 1. Connexion : adopter la langue du compte, sauf choix local explicite.
  useEffect(() => {
    if (!isAuthenticated || !user) {
      savedLanguage.current = undefined;
      return;
    }

    savedLanguage.current = user.preferredLanguage ?? null;

    let chosenHere: string | null = null;
    try {
      chosenHere = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    } catch {
      // Stockage refusé : on considère qu'aucun choix local n'existe.
    }

    if (chosenHere) return;
    if (!isLanguage(user.preferredLanguage)) return;
    if (user.preferredLanguage === language) return;

    void setLanguage(user.preferredLanguage);
    // `language` volontairement absent : le réintroduire relancerait cet effet
    // juste après le basculement, pour ne rien faire de plus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user, setLanguage]);

  // 2. Changement de langue en session : le remonter au compte.
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
