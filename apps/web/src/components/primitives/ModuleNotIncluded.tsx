import React from 'react';
import { useNavigate } from 'react-router-dom';
import { StateBlock } from './StateBlock';
import { t } from '../../i18n/t';

/**
 * `<ModuleNotIncluded>` — écran « non inclus dans votre abonnement »
 * (vague 2 des abonnements). À monter sur une route dédiée ou à rendre par un
 * écran dont la lecture a reçu 403 `MODULE_NOT_INCLUDED`. Les textes sont ceux
 * de la notification de `utils/subscription-denial-notice.ts`.
 */
export interface ModuleNotIncludedProps {
  /** Écran Paramètres › Abonnement de l'agence : ajoute le bouton d'accès. */
  settingsPath?: string;
}

export const ModuleNotIncluded: React.FC<ModuleNotIncludedProps> = ({ settingsPath }) => {
  const navigate = useNavigate();
  return (
    <StateBlock
      variant="error"
      title={t('Fonction non comprise dans votre abonnement')}
      description={t(
        "Cette fonction relève d'un module que votre agence n'a pas souscrit. Pour l'ajouter, contactez l'administrateur de votre agence ou ImmoTopia."
      )}
      actions={
        settingsPath
          ? [
              { label: t('Paramètres › Abonnement'), onClick: () => navigate(settingsPath), primary: true },
              { label: t('Aller au tableau de bord'), onClick: () => navigate('/dashboard') }
            ]
          : [
              { label: t("Retour à l'écran précédent"), onClick: () => navigate(-1), primary: true },
              { label: t('Aller au tableau de bord'), onClick: () => navigate('/dashboard') }
            ]
      }
    />
  );
};

export default ModuleNotIncluded;
