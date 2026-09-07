import { useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export function useSyndicRouteContext() {
  const { tenantId, syndicId, meetingId, lotId } = useParams<{
    tenantId: string;
    syndicId: string;
    meetingId?: string;
    lotId?: string;
  }>();
  const { tenantMembership } = useAuth();

  return {
    tenantId: tenantId || tenantMembership?.tenantId,
    syndicId,
    meetingId,
    lotId
  };
}
