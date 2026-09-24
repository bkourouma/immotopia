import React from 'react';
import { StatusTag } from '../../components/primitives';
import { t } from '../../i18n/t';

/**
 * Statut d'un objet de la vente, avec le libellé qui lui va.
 *
 * La table commune de `StatusTag` sert tous les modules : `DUE` y veut dire
 * « À échoir » (une échéance de loyer), `ACCEPTED` y est au masculin. Une
 * commission due est « À encaisser », une offre est « Acceptée ». Le ton
 * reste celui de la table commune.
 */
export type SaleObjectKind = 'mandate' | 'offer' | 'agreement' | 'condition' | 'commission' | 'payment';

const LABELS: Record<SaleObjectKind, Record<string, () => string>> = {
  mandate: {
    ACTIVE: () => t('Actif'),
    EXPIRED: () => t('Expiré'),
    REVOKED: () => t('Révoqué'),
    COMPLETED: () => t('Vendu')
  },
  offer: {
    SUBMITTED: () => t('Soumise'),
    COUNTERED: () => t('Contre-offre'),
    ACCEPTED: () => t('Acceptée'),
    REJECTED: () => t('Refusée'),
    WITHDRAWN: () => t('Retirée'),
    EXPIRED: () => t('Expirée')
  },
  agreement: {
    DRAFT: () => t('Brouillon'),
    SIGNED: () => t('Signé'),
    COMPLETED: () => t('Acte signé'),
    CANCELLED: () => t('Annulé')
  },
  condition: {
    PENDING: () => t('En attente'),
    MET: () => t('Réalisée'),
    FAILED: () => t('Défaillie'),
    WAIVED: () => t('Renoncée')
  },
  commission: {
    DUE: () => t('À encaisser'),
    PARTIALLY_PAID: () => t('Partiellement encaissée'),
    PAID: () => t('Encaissée'),
    CANCELLED: () => t('Annulée')
  },
  payment: {
    POSTED: () => t('Enregistré'),
    VOIDED: () => t('Annulé')
  }
};

export const SaleStatusTag: React.FC<{ kind: SaleObjectKind; status: string | null | undefined }> = ({
  kind,
  status
}) => {
  const label = status ? LABELS[kind][status]?.() : undefined;
  return <StatusTag status={status} label={label} />;
};
