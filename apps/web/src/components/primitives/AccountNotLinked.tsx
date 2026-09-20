import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { StateBlock } from './StateBlock';
import { useAuth } from '../../hooks/useAuth';
import { t } from '../../i18n/t';

/**
 * `<AccountNotLinked>` — compte authentifié mais rattaché à rien.
 *
 * Ce n'est **pas un rôle**, c'est un état de compte : l'utilisateur s'est
 * connecté, mais il n'appartient à aucune agence et n'est lié à aucun contrat
 * — ni propriétaire, ni locataire.
 *
 * Le dépôt le traitait comme un persona à part entière, avec sa branche de
 * navigation (`publicNavigationItems`) et deux entrées de menu. Or, depuis la
 * suppression de la vitrine publique au Lot 1, aucune de ces destinations ne
 * mène nulle part : `/properties/categories` n'a jamais existé, et
 * `/properties` rend un écran qui **exige** une agence — donc, pour lui,
 * toujours « Aucune agence sélectionnée ».
 *
 * Lui servir une coquille applicative avec un menu d'une ligne est une impasse
 * déguisée. Cet écran dit ce qui se passe et ce qu'il faut faire, sans
 * sidebar, sans barre d'onglets et sans action flottante.
 */
export const AccountNotLinked: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    anchor.current?.focus();
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface-page)',
        padding: 'var(--page-padding)'
      }}
    >
      <div ref={anchor} tabIndex={-1} style={{ outline: 'none', maxWidth: 520, width: '100%' }}>
        <StateBlock
          variant="empty"
          title={t('Votre compte n’est rattaché à aucune agence')}
          description={
            <>
              {t('Le compte')} <strong>{user?.email}</strong>{' '}
              {t(
                'est bien créé, mais il n’est encore relié ni à une agence, ni à un bail, ni à un bien. Il n’y a donc rien à consulter pour l’instant.'
              )}
              <br />
              <br />
              {t(
                'Si vous attendez une invitation, elle vous parviendra par courriel. Sinon, rapprochez-vous de l’agence qui gère votre dossier : c’est elle qui déclenche le rattachement.'
              )}
            </>
          }
          actions={[{ label: t('Se déconnecter'), onClick: handleLogout }]}
          detail={t('Réf. ACCOUNT-UNLINKED')}
        />
      </div>
    </div>
  );
};
