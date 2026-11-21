import React from 'react';
import { useInRouterContext, useNavigate } from 'react-router-dom';
import { StateBlock } from '../primitives';
import { t } from '../../i18n/t';

/**
 * Refus clair d'un écran Patrimoine quand l'API répond 403 (le rôle n'a pas
 * `PROPERTIES_VIEW`) : à la place d'un « Impossible de charger » avec un
 * bouton Réessayer qui ne pourra jamais aboutir, et sans bouton d'écriture
 * (BUG-2026-10-02-010 / -004). Le refus serveur reste la seule vraie barrière.
 */
const ForbiddenBlock: React.FC<{ onBack?: () => void }> = ({ onBack }) => (
  <StateBlock
    variant="forbidden"
    title={t('Accès non autorisé')}
    description={t(
      "Votre rôle ne donne pas accès aux biens ni au patrimoine. Demandez l'accès à un administrateur de l'agence."
    )}
    actions={onBack ? [{ label: t('Retour'), onClick: onBack, primary: true }] : []}
    detail="AUTH-403"
  />
);

const ForbiddenWithBack: React.FC = () => {
  const navigate = useNavigate();
  return <ForbiddenBlock onBack={() => navigate(-1)} />;
};

/** Hors routeur (tests, rendu isolé) : pas de bouton « Retour », le refus reste lisible. */
export const PatrimoineForbidden: React.FC = () => (useInRouterContext() ? <ForbiddenWithBack /> : <ForbiddenBlock />);
