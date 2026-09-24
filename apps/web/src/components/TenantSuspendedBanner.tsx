import React, { useEffect, useState } from 'react';
import { Alert } from 'antd';
import { useAuth } from '../hooks/useAuth';
import { TENANT_SUSPENDED_EVENT, TenantSuspendedEventDetail } from '../utils/tenant-events';
import { t } from '../i18n/t';

/**
 * `<TenantSuspendedBanner>` — bandeau explicite quand l'agence est suspendue
 * (lot G5, constat #4 du plan multi-tenant : « une agence suspendue reste
 * accessible… mais reçoit alors un 403 nu »).
 *
 * `utils/api-client.ts` émet `TENANT_SUSPENDED_EVENT` sur `window` dès qu'une
 * réponse 403 porte `{ code: 'TENANT_SUSPENDED' }`. Ce composant s'y abonne et
 * remplace l'erreur nue par un message compréhensible. Monté au niveau de la
 * coquille (`AppShell`), pas de l'en-tête : il doit s'afficher au-dessus de
 * tout l'écran, quel que soit l'écran atteint.
 *
 * Jamais affiché au super-administrateur : un 403 « agence suspendue » ne le
 * concerne jamais directement (il gère les agences, il n'en est membre
 * d'aucune), et le lui montrer laisserait croire que SA session est bloquée.
 */
export const TenantSuspendedBanner: React.FC = () => {
  const { user } = useAuth();
  const [detail, setDetail] = useState<TenantSuspendedEventDetail | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<TenantSuspendedEventDetail>;
      setDetail(custom.detail ?? { tenantId: null });
    };
    window.addEventListener(TENANT_SUSPENDED_EVENT, handler);
    return () => window.removeEventListener(TENANT_SUSPENDED_EVENT, handler);
  }, []);

  if (user?.globalRole === 'SUPER_ADMIN') return null;
  if (!detail) return null;

  return (
    <Alert
      type="warning"
      showIcon
      banner
      closable
      onClose={() => setDetail(null)}
      message={t('Cette agence est suspendue. Contactez l’administrateur de la plateforme.')}
      style={{ borderRadius: 0 }}
    />
  );
};
