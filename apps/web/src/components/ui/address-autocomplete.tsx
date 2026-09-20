import React, { useMemo, useState } from 'react';
import { Select, Spin, Empty, Typography } from 'antd';
import { MapPin } from 'lucide-react';
import { searchAddresses, PhotonResult } from '../../services/photon-service';
import { t } from '../../i18n/t';

const { Text } = Typography;

function debounce(func: (q: string) => void, wait: number) {
  let timeout: ReturnType<typeof setTimeout>;
  return (q: string) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(q), wait);
  };
}

export interface AddressSuggestion {
  address: string;
  locationZone?: string;
  latitude: number;
  longitude: number;
  displayName?: string;
}

interface AddressAutocompleteProps {
  onSelect?: (suggestion: AddressSuggestion) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  onSelect,
  placeholder = t('Rechercher une adresse (rue, quartier, lieu)...'),
  className = '',
  disabled = false
}) => {
  const [options, setOptions] = useState<PhotonResult[]>([]);
  const [fetching, setFetching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [selectedDisplay, setSelectedDisplay] = useState<string | undefined>();

  const debouncedSearch = useMemo(
    () =>
      debounce(async (search: string) => {
        if (!search || search.length < 2) {
          setOptions([]);
          return;
        }
        setFetching(true);
        try {
          const results = await searchAddresses(search, { limit: 10, lang: 'fr' });
          setOptions(results);
        } catch (err) {
          console.error('Photon search error:', err);
          setOptions([]);
        } finally {
          setFetching(false);
        }
      }, 400),
    []
  );

  const handleSelect = (id: string) => {
    const item = options.find(o => o.id === id);
    if (item && onSelect) {
      setSelectedId(id);
      setSelectedDisplay(item.displayName);
      onSelect({
        address: item.address || item.displayName,
        locationZone: item.locationZone,
        latitude: item.latitude,
        longitude: item.longitude,
        displayName: item.displayName
      });
    }
  };

  const handleClear = () => {
    setSelectedId(undefined);
    setSelectedDisplay(undefined);
    setOptions([]);
  };

  const displayOptions =
    selectedId && selectedDisplay && !options.find(o => o.id === selectedId)
      ? [
          {
            id: selectedId,
            displayName: selectedDisplay,
            address: selectedDisplay,
            latitude: 0,
            longitude: 0,
            type: 'place'
          } as PhotonResult
        ]
      : options;

  const typeLabel = (type: string) => {
    const labels: Record<string, string> = {
      street: 'Rue',
      house: 'Adresse',
      city: 'Ville',
      district: 'Quartier',
      state: t('Région'),
      country: 'Pays'
    };
    return labels[type] || type;
  };

  return (
    <div className={className}>
      <Select
        showSearch
        value={selectedId || undefined}
        placeholder={placeholder}
        defaultActiveFirstOption={false}
        suffixIcon={<MapPin className="h-4 w-4 text-gray-400" />}
        filterOption={false}
        onSearch={debouncedSearch}
        onSelect={handleSelect}
        onClear={handleClear}
        notFoundContent={fetching ? <Spin size="small" /> : <Empty description={t('Aucun résultat')} />}
        style={{ width: '100%' }}
        allowClear
        disabled={disabled}
        popupClassName="address-autocomplete-popup"
      >
        {displayOptions.map(item => (
          <Select.Option key={item.id} value={item.id}>
            <div className="flex items-center py-2 px-1">
              <div
                className="bg-blue-50 p-2 rounded-full me-3 flex-shrink-0 flex items-center justify-center"
                style={{ width: '36px', height: '36px' }}
              >
                <MapPin className="h-4 w-4 text-blue-500" />
              </div>
              <div className="flex flex-col overflow-hidden" style={{ lineHeight: '1.2' }}>
                <Text strong style={{ fontSize: '14px', marginBottom: '2px' }} ellipsis>
                  {item.displayName}
                </Text>
                <Text type="secondary" style={{ fontSize: '12px' }} ellipsis>
                  {typeLabel(item.type)}
                  {item.city ? ` · ${item.city}` : ''}
                  {item.country ? ` · ${item.country}` : ''}
                </Text>
              </div>
            </div>
          </Select.Option>
        ))}
      </Select>
    </div>
  );
};
