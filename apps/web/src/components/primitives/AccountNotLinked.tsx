import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import { CreatePersonalSpaceForm } from '../personal-space/CreatePersonalSpaceForm';
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
 * déguisée. Cet écran (lot 4C, specs/026-particuliers-libre-service) lui
 * propose de créer son espace personnel, sans sidebar, sans barre d'onglets et
 * sans action flottante ; l'invitation d'une agence reste possible.
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
        <h1 style={{ fontSize: 'var(--font-size-h2)', marginBottom: 'var(--space-2)' }}>{t('Créer mon espace')}</h1>
        <p style={{ marginBottom: 'var(--space-4)' }}>
          {t('Le compte')} <strong>{user?.email}</strong>{' '}
          {t(
            'n’est relié à aucune agence. Créez votre espace personnel gratuit pour suivre la valeur nette de votre patrimoine, vos biens et vos baux.'
          )}
        </p>
        <CreatePersonalSpaceForm />
        <p style={{ marginTop: 'var(--space-4)', color: 'var(--text-secondary)' }}>
          {t(
            'Si vous attendez une invitation d’une agence, elle vous parviendra par courriel : inutile de créer un espace.'
          )}
        </p>
        <Button type="link" onClick={handleLogout} style={{ paddingInline: 0 }}>
          {t('Se déconnecter')}
        </Button>
        <p style={{ fontSize: 'var(--font-size-caption)', color: 'var(--text-secondary)' }}>
          {t('Réf. ACCOUNT-UNLINKED')}
        </p>
      </div>
    </div>
  );
};
