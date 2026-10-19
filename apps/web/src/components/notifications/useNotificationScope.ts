import { useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { resolvePersona } from '../../navigation/resolve';
import type { NotificationScope } from '../../services/notifications-service';

type PortalId = Extract<NotificationScope, { kind: 'portal' }>['portal'];

/** Portail servi à chaque persona client, selon le même `resolvePersona` que la coquille. */
const PORTAL_BY_PERSONA: Record<string, PortalId> = {
  proprietaire: 'owner',
  locataire: 'tenant',
  coproprietaire: 'copropriete'
};

/**
 * Scope des notifications et de la messagerie du compte courant : l'agence d'un
 * collaborateur rattaché, ou le portail d'un client (propriétaire, locataire,
 * copropriétaire). Le portail vient du persona résolu depuis le contexte
 * d'authentification, jamais d'une valeur de la requête. `null` pour un
 * super-administrateur ou un compte non rattaché.
 */
export function useNotificationScope(): NotificationScope | null {
  const { user, tenantMembership, tenantClient, isLoadingMembership } = useAuth();
  const tenantId = tenantMembership?.tenantId ?? null;
  const clientType = tenantClient?.clientType ?? null;
  const globalRole = user?.globalRole ?? null;
  return useMemo(() => {
    if (tenantId) return { kind: 'agency', tenantId };
    const persona = resolvePersona({
      globalRole,
      hasTenantMembership: false,
      clientType,
      isLoadingMembership
    });
    const portal = persona ? PORTAL_BY_PERSONA[persona] : undefined;
    return portal ? { kind: 'portal', portal } : null;
  }, [tenantId, clientType, globalRole, isLoadingMembership]);
}
