import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { StateBlock } from './StateBlock';
import { t } from '../../i18n/t';

/**
 * `<AccessDenied>` — refus d'accès avec une issue (REFONTE_UI_UX.md §5.6).
 *
 * L'existant est un cul-de-sac : trois variantes de texte centré, sans bouton
 * ni lien (`ProtectedRoute.tsx:50-92`). L'utilisateur ne peut sortir que par le
 * menu — or ce rendu remplace la coquille entière, donc en mobile il n'y a plus
 * de menu du tout.
 *
 * Trois différences avec l'existant :
 *   - le message nomme la cause précise, pas « vous n'avez pas les permissions » ;
 *   - deux sorties sont offertes, dont un retour à l'écran précédent ;
 *   - la référence technique est présente mais discrète, pour le support.
 *
 * Le focus est porté sur le titre à l'affichage : sans cela, un lecteur d'écran
 * reste sur le lien qui a déclenché la navigation et n'annonce jamais le refus.
 */

export type AccessDeniedReason = 'role' | 'wrong-tenant' | 'no-tenant';

export interface AccessDeniedProps {
  reason: AccessDeniedReason;
  /** Rôle de l'utilisateur, pour nommer la cause. */
  currentRole?: string | null;
  /** Rôle attendu, affiché dans la référence technique. */
  requiredRole?: string | null;
}

function MESSAGES(): Record<AccessDeniedReason, { title: string; body: string; ref: string }> {
  return {
    role: {
      title: t('Accès non autorisé'),
      body: t('Votre rôle ne donne pas accès à cette section.'),
      ref: 'AUTH-403'
    },
    'wrong-tenant': {
      title: t('Cette agence n’est pas la vôtre'),
      body: t("L'adresse demandée appartient à une autre agence que celle de votre compte."),
      ref: 'AUTH-403-TENANT'
    },
    'no-tenant': {
      title: t('Aucune agence rattachée'),
      body: t(
        "Votre compte n'est rattaché à aucune agence. Un administrateur doit vous inviter avant que vous puissiez accéder à cette section."
      ),
      ref: 'AUTH-403-NO-TENANT'
    }
  };
}

export const AccessDenied: React.FC<AccessDeniedProps> = ({ reason, currentRole, requiredRole }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    anchor.current?.focus();
  }, []);

  const message = MESSAGES()[reason];

  // Le message nomme le rôle quand on le connaît : « Votre rôle « Agent » ne
  // donne pas accès… » est actionnable, « accès refusé » ne l'est pas.
  const body =
    reason === 'role' && currentRole
      ? t('Votre rôle « {{currentRole}} » ne donne pas accès à cette section.', { currentRole: currentRole })
      : message.body;

  const detail = [
    t('Réf. {{ref}}', { ref: message.ref }),
    requiredRole ? t('rôle requis {{requiredRole}}', { requiredRole: requiredRole }) : null,
    location.pathname
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div ref={anchor} tabIndex={-1} style={{ outline: 'none' }}>
      <StateBlock
        variant="forbidden"
        title={message.title}
        description={body}
        detail={detail}
        actions={[
          // Le retour arrière est primaire : c'est la sortie la moins coûteuse
          // pour quelqu'un qui a simplement suivi un lien qu'il ne devait pas.
          { label: t("Retour à l'écran précédent"), onClick: () => navigate(-1), primary: true },
          { label: t('Aller au tableau de bord'), onClick: () => navigate('/dashboard') }
        ]}
      />
    </div>
  );
};
