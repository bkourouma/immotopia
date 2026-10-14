import { useEffect, useState } from 'react';
import copilotService from '../services/copilot-service';
import type { CopilotStatus } from '../types/copilot';
import { sharedCopilotStatus } from '../utils/copilot-status-cache';

/**
 * État d'ImmoCopilot pour une agence : `null` tant qu'il n'est pas connu.
 * Le service est défensif (toute erreur donne `enabled: false`) ; le `catch`
 * garantit seulement qu'une erreur inattendue laisse l'assistant masqué.
 * `active` à faux : aucun appel. La requête est partagée entre les instances
 * (voir `copilot-status-cache`).
 */
export function useCopilotStatus(tenantId: string | null | undefined, active = true): CopilotStatus | null {
  const [state, setState] = useState<{ tenantId: string; status: CopilotStatus | null } | null>(null);

  useEffect(() => {
    if (!active || !tenantId) return undefined;
    let cancelled = false;
    sharedCopilotStatus(tenantId, () => copilotService.getStatus(tenantId))
      .catch(() => null)
      .then(status => {
        if (!cancelled) setState({ tenantId, status });
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, active]);

  return active && state !== null && state.tenantId === tenantId ? state.status : null;
}
