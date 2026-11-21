import React from 'react';
import { Button, Result, Spin } from 'antd';
import { t } from '../../i18n/t';

/**
 * États communs des pages publiques ouvertes par lien (paiement, rapport,
 * accès partagé, assemblée) : chargement annoncé et problème de lien avec une
 * issue claire. Ces pages sont lues sur téléphone par des personnes sans compte :
 * un titre seul, sans suite à donner, les laisse dans une impasse.
 */

/** Chargement : un texte visible, annoncé aux lecteurs d'écran (role=status). */
export const PublicLoading: React.FC<{ label: string }> = ({ label }) => (
  <div role="status" style={{ textAlign: 'center', padding: 64 }}>
    <Spin size="large" />
    <p style={{ marginBlockStart: 16, marginBlockEnd: 0 }}>{label}</p>
  </div>
);

export type PublicLinkProblemKind = 'invalid' | 'rate_limited' | 'unavailable';

export interface PublicLinkProblemProps {
  kind: PublicLinkProblemKind;
  /** Titre propre à la page ; à défaut, le titre commun. */
  title?: string;
  /** Relance la lecture ; sans lui, aucun bouton (le jeton ne se relit pas à la main). */
  onRetry?: () => void;
}

function defaults(kind: PublicLinkProblemKind): { title: string; subTitle: string } {
  if (kind === 'invalid') {
    return {
      title: t('Lien invalide ou expiré'),
      subTitle: t("Ce lien n'est plus valable. Demandez-en un nouveau à votre agence ou à votre syndic.")
    };
  }
  if (kind === 'rate_limited') {
    return {
      title: t('Trop de tentatives, réessayez dans quelques minutes.'),
      subTitle: t('Patientez un moment, puis rouvrez ce lien.')
    };
  }
  return {
    title: t('Service momentanément indisponible, réessayez dans quelques minutes.'),
    subTitle: t('Rien n’a été perdu. Réessayez dans quelques minutes.')
  };
}

/** Problème de lien : titre, explication et, quand c'est possible, « Réessayer ». */
export const PublicLinkProblem: React.FC<PublicLinkProblemProps> = ({ kind, title, onRetry }) => {
  const text = defaults(kind);
  return (
    <div role="alert">
      <Result
        status="warning"
        title={title ?? text.title}
        subTitle={text.subTitle}
        extra={
          onRetry && kind !== 'invalid' ? (
            <Button type="primary" size="large" style={{ minHeight: 48 }} onClick={onRetry}>
              {t('Réessayer')}
            </Button>
          ) : undefined
        }
      />
    </div>
  );
};
