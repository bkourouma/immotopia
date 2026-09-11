import React from 'react';
import { Select, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../utils/api-client';
import { queryKey, STALE_TIME } from '../../lib/query-keys';

interface Vendor {
  id: string;
  name: string;
  specialties?: string[];
}

interface VendorSelectProps {
  tenantId: string;
  value?: string;
  onChange?: (value: string) => void;
}

/**
 * Choix d'un prestataire de maintenance (REFONTE_UI_UX.md §8.4).
 *
 * La liste était rechargée **à chaque montage** du composant. Il vit dans le
 * détail d'un ticket : ouvrir cinq tickets à la suite déclenchait cinq fois la
 * même requête, pour un référentiel qui change à l'échelle du mois.
 *
 * Elle est désormais mise en cache 5 minutes, la durée que le §8.4 fixe pour
 * les référentiels. La clé ne porte pas de filtre : c'est la liste complète des
 * prestataires actifs d'une agence, et deux composants montés ensemble
 * partagent donc la même requête au lieu d'en lancer deux.
 */
export const VendorSelect: React.FC<VendorSelectProps> = ({ tenantId, value, onChange }) => {
  const { data: vendors = [], isPending } = useQuery({
    queryKey: queryKey('vendors-actifs', tenantId),
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: Vendor[] }>(
        `/tenants/${tenantId}/maintenance/vendors/active`
      );
      return response.data.success ? response.data.data : [];
    },
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  return (
    <Select
      value={value}
      onChange={onChange}
      placeholder="Sélectionner un prestataire"
      allowClear
      loading={isPending}
      notFoundContent={isPending ? <Spin size="small" /> : 'Aucun prestataire disponible'}
      showSearch
      optionFilterProp="label"
      // Les spécialités accompagnent le nom dans le libellé plutôt que dans un
      // `<span>` gris à la couleur écrite en dur : la recherche les trouve, et
      // la couleur vient du thème.
      options={vendors.map(vendor => ({
        value: vendor.id,
        label: vendor.specialties?.length ? `${vendor.name} — ${vendor.specialties.join(', ')}` : vendor.name
      }))}
    />
  );
};
