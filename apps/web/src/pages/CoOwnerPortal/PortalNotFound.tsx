import React from 'react';
import { useNavigate } from 'react-router-dom';
import { StateBlock } from '../../components/primitives';
import { t } from '../../i18n/t';

/**
 * Adresse inconnue DANS le portail copropriétaire (`/copropriete/...`).
 *
 * Le portail n'a qu'une page de détail, celle d'un lot ; les assemblées et
 * les documents se consultent dans leur liste. Une adresse comme
 * `/copropriete/assemblees/<id>` ou `/copropriete/documents/<id>` tombe donc
 * ici : on le dit, dans la coquille du portail, avec un retour vers ses
 * écrans — plutôt que l'écran « Cette page n'existe pas » générique, qui
 * propose un tableau de bord d'agence qu'un copropriétaire n'a pas.
 */
export default function CoOwnerPortalNotFound() {
  const navigate = useNavigate();
  return (
    <StateBlock
      variant="empty"
      title={t('Introuvable dans votre espace')}
      description={t('Cet élément est introuvable dans votre espace copropriétaire.')}
      actions={[
        { label: t('Mes lots'), onClick: () => navigate('/copropriete'), primary: true },
        { label: t('Assemblées générales'), onClick: () => navigate('/copropriete/assemblees') }
      ]}
    />
  );
}
