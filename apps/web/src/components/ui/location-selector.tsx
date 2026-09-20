import React, { useState, useEffect, useMemo } from 'react';
import { Select, Typography } from 'antd';
import { MapPin } from 'lucide-react';
import { GeographicLocation, getAllCommunes, getLocationByCommuneId } from '../../services/geographic-service';
import { t } from '../../i18n/t';

const { Text } = Typography;

interface LocationSelectorProps {
  value?: string; // communeId
  onChange: (location: GeographicLocation | null) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  error?: string;
}

export const LocationSelector: React.FC<LocationSelectorProps> = ({
  value,
  onChange,
  placeholder = t('Rechercher une commune...'),
  className = '',
  required = false,
  error
}) => {
  const [communes, setCommunes] = useState<GeographicLocation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadCommunes = async () => {
      setLoading(true);
      try {
        const data = await getAllCommunes();
        setCommunes(data || []);
      } catch (err) {
        console.error('Error loading communes:', err);
        setCommunes([]);
      } finally {
        setLoading(false);
      }
    };

    void loadCommunes();
  }, []);

  useEffect(() => {
    const ensureSelectedCommune = async () => {
      if (!value || communes.some(c => c.communeId === value)) {
        return;
      }

      try {
        const loc = await getLocationByCommuneId(value);
        if (!loc) return;

        setCommunes(prev => {
          if (prev.some(item => item.communeId === loc.communeId)) {
            return prev;
          }
          return [loc, ...prev];
        });
      } catch (err) {
        console.error('Error loading selected commune:', err);
      }
    };

    void ensureSelectedCommune();
  }, [value, communes]);

  const selectOptions = useMemo(
    () =>
      communes.map(loc => ({
        value: loc.communeId,
        label: loc.commune
      })),
    [communes]
  );

  const handleSelect = (communeId?: string) => {
    if (!communeId) {
      onChange(null);
      return;
    }

    const selected = communes.find(item => item.communeId === communeId) || null;
    onChange(selected);
  };

  return (
    <div className={className}>
      <Select
        showSearch
        value={value}
        placeholder={placeholder}
        suffixIcon={<MapPin className="h-4 w-4 text-gray-400" />}
        options={selectOptions}
        loading={loading}
        allowClear
        onChange={selectedValue => handleSelect(selectedValue)}
        filterOption={(input, option) => {
          const label = String(option?.label || '').toLowerCase();
          return label.includes(input.toLowerCase());
        }}
        optionFilterProp="label"
        notFoundContent={loading ? t('Chargement des communes...') : t('Aucune commune trouvee')}
        style={{ width: '100%' }}
        status={error ? 'error' : undefined}
      />
      {error && (
        <Text type="danger" style={{ fontSize: '12px' }}>
          {error}
        </Text>
      )}
    </div>
  );
};
