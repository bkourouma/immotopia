import React from 'react';
import { Alert } from 'antd';
import { t } from '../../i18n/t';

/**
 * Portail locataire en lecture seule (H4) : bail terminé ou suspendu, aucun bail actif.
 * Le serveur reste l'autorité (403 `PORTAL_READ_ONLY` sur toute écriture) ; ceci ne fait
 * que masquer les actions. Sans statut connu, on ne masque rien.
 */
export function isReadOnlyLeases(leases?: Array<{ status?: string }> | null): boolean {
  return (
    Array.isArray(leases) &&
    leases.length > 0 &&
    leases.every(lease => lease.status === 'ENDED' || lease.status === 'SUSPENDED')
  );
}

export function ReadOnlyBanner(): React.ReactElement {
  return (
    <Alert
      type="info"
      showIcon
      role="status"
      data-testid="tenant-portal-read-only-banner"
      message={t(
        'Votre bail n’est plus actif : le portail est en lecture seule. Vous pouvez consulter vos quittances, votre solde et vos documents, mais plus effectuer de paiement ni de demande.'
      )}
    />
  );
}
