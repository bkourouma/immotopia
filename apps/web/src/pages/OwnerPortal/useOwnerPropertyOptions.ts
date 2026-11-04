import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ownerPortalService } from '../../services/ownerPortalService';

export interface OwnerPropertyOption {
  value: string;
  label: string;
}

/**
 * Options du critère « Bien » des écrans du portail propriétaire.
 *
 * Une seule requête partagée (clé `['owner-portal', 'property-options']`,
 * fraîche 5 min) au lieu d'un `getProperties` au montage de chaque écran.
 * Un échec laisse simplement le critère sans options.
 */
export function useOwnerPropertyOptions(): { options: OwnerPropertyOption[]; loading: boolean } {
  const { data, isPending } = useQuery({
    queryKey: ['owner-portal', 'property-options'],
    queryFn: async (): Promise<OwnerPropertyOption[]> => {
      const response = await ownerPortalService.getProperties();
      const properties: Array<{ id: string; address?: string | null; title?: string | null }> =
        response.data?.success && response.data?.data?.properties ? response.data.data.properties : [];
      return properties.map(property => ({
        value: property.id,
        label: property.address || property.title || property.id
      }));
    },
    staleTime: 5 * 60_000,
    retry: false
  });

  const options = useMemo(() => data ?? [], [data]);
  return { options, loading: isPending };
}
