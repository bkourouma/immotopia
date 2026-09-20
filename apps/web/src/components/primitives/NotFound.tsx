import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { StateBlock } from './StateBlock';
import { t } from '../../i18n/t';

/**
 * `<NotFound>` — rendu par la route `path="*"` (REFONTE_UI_UX.md §4.3).
 *
 * `App.tsx` s'arrêtait sur `<Route path="/" element={<Navigate to="/dashboard"/>}>` :
 * toute URL non reconnue affichait **une page blanche**, sans erreur ni
 * redirection. Le menu public pointait d'ailleurs vers `/properties/categories`,
 * une route qui n'a jamais existé.
 *
 * L'URL demandée est affichée : c'est ce qui permet à l'utilisateur de repérer
 * une faute de frappe, et au support de reproduire.
 */
export const NotFound: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    anchor.current?.focus();
  }, []);

  return (
    <div ref={anchor} tabIndex={-1} style={{ outline: 'none' }}>
      <StateBlock
        variant="error"
        title={t('Cette page n’existe pas')}
        description={t(
          "L'adresse demandée ne correspond à aucun écran. Elle a peut-être changé, ou comporte une faute de frappe."
        )}
        detail={t('Réf. HTTP-404 · {{pathname}}', { pathname: location.pathname })}
        actions={[
          { label: t("Retour à l'écran précédent"), onClick: () => navigate(-1), primary: true },
          { label: t('Aller au tableau de bord'), onClick: () => navigate('/dashboard') }
        ]}
      />
    </div>
  );
};
