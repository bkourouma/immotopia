import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React, { useContext } from 'react';

/**
 * LA REPRISE DE SESSION AU DÉMARRAGE (recette du 20 septembre 2026, ANO-19 §6).
 *
 * Le cookie d'accès vit quinze minutes, celui de rafraîchissement sept jours,
 * et le minuteur qui renouvelle le premier meurt avec la page. Qui ferme son
 * onglet et revient une demi-heure plus tard arrive donc avec un cookie
 * d'accès périmé — que le navigateur n'envoie plus du tout — et une session
 * parfaitement vivante côté serveur.
 *
 * `/auth/me` est exclue du rattrapage de l'intercepteur, à dessein. Avant le
 * correctif, son 401 faisait donc conclure « pas connecté » et l'écran
 * renvoyait vers la connexion : « Se souvenir de moi » ne tenait pas quinze
 * minutes, alors que le jeton de rafraîchissement en avait pour une semaine.
 *
 * Le défaut avait été observé à l'envers, sur `GET /finance/sites/:id/detail`
 * qui partait en 401 puis était rejouée avec succès — la moitié bénigne du
 * même symptôme, celle que l'intercepteur sait réparer.
 */

const getMe = vi.fn();
const refreshSession = vi.fn();

vi.mock('../../services/auth-service', () => ({
  getMe: (...args: unknown[]) => getMe(...args),
  refreshToken: vi.fn(),
  login: vi.fn(),
  logout: vi.fn()
}));

// Le rafraichissement passe par `api-client`, JAMAIS par `auth-service` : les
// jetons sont rotes cote serveur, et deux appels concurrents presentant le
// meme jeton ressemblent a un rejeu, que le serveur punit d'une deconnexion
// complete. `refreshSession` partage une promesse unique ; s'y substituer
// dans un test qui espionne `auth-service.refreshToken` laisserait passer
// une regression vers l'appel direct.
vi.mock('../../utils/api-client', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { success: true, data: { asClient: [], asMember: [] } } }) },
  refreshSession: (...args: unknown[]) => refreshSession(...args)
}));

import AuthContext, { AuthProvider } from '../../context/AuthContext';

/** Un 401 tel qu'axios le construit : c'est `response.status` qui est lu. */
function jetonManquant() {
  return Object.assign(new Error("Jeton d'authentification manquant."), {
    isAxiosError: true,
    response: { status: 401, data: { message: "Jeton d'authentification manquant." } }
  });
}

const UTILISATEUR = { id: 'u-1', email: 'kouassi@example.com', firstName: 'Kouassi', globalRole: 'USER' };

/** Rend l'état du contexte en texte, seul moyen fiable de l'observer. */
const Temoin: React.FC = () => {
  const auth = useContext(AuthContext as React.Context<any>);
  if (auth.isLoading) return <span>chargement</span>;
  return <span>{auth.isAuthenticated ? `connecté:${auth.user?.email}` : 'déconnecté'}</span>;
};

function monter() {
  return render(
    <AuthProvider>
      <Temoin />
    </AuthProvider>
  );
}

describe('Reprise de session au démarrage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('REPREND la session quand le jeton d’accès a expiré mais que le rafraîchissement tient', async () => {
    getMe.mockRejectedValueOnce(jetonManquant()).mockResolvedValueOnce({ success: true, user: UTILISATEUR });
    refreshSession.mockResolvedValueOnce({ success: true });

    monter();

    await waitFor(() => expect(screen.getByText(`connecté:${UTILISATEUR.email}`)).toBeInTheDocument());
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(getMe).toHaveBeenCalledTimes(2);
  });

  it('CONCLUT à la déconnexion quand le rafraîchissement échoue lui aussi', async () => {
    // Le visiteur ordinaire qui arrive sans session : une requête de plus, et
    // le même résultat qu'avant. C'est le seul coût du correctif.
    getMe.mockRejectedValue(jetonManquant());
    refreshSession.mockRejectedValueOnce(jetonManquant());

    monter();

    await waitFor(() => expect(screen.getByText('déconnecté')).toBeInTheDocument());
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('NE TENTE RIEN quand la session est valable du premier coup', async () => {
    getMe.mockResolvedValueOnce({ success: true, user: UTILISATEUR });

    monter();

    await waitFor(() => expect(screen.getByText(`connecté:${UTILISATEUR.email}`)).toBeInTheDocument());
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('NE RAFRAÎCHIT PAS sur une panne qui n’est pas un 401 — il n’y a rien à reprendre', async () => {
    getMe.mockRejectedValueOnce(
      Object.assign(new Error('Service indisponible'), { isAxiosError: true, response: { status: 503 } })
    );

    monter();

    await waitFor(() => expect(screen.getByText('déconnecté')).toBeInTheDocument());
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('ne lance AUCUN appel d’authentification sur une page publique à jeton', async () => {
    window.history.replaceState(null, '', '/acces-partage');
    try {
      monter();
      await waitFor(() => expect(screen.getByText('déconnecté')).toBeInTheDocument());
      expect(getMe).not.toHaveBeenCalled();
      expect(refreshSession).not.toHaveBeenCalled();
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
});
