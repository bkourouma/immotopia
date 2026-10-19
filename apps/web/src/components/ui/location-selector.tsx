import React, { useState, useEffect, useMemo } from 'react';
import { Select, Typography } from 'antd';
import { MapPin } from 'lucide-react';
import { GeographicLocation, getAllCommunes, getLocationByCommuneId } from '../../services/geographic-service';
import { t } from '../../i18n/t';

const { Text } = Typography;

/** Minuscules sans accents ni espaces de bord, pour comparer la saisie aux communes. */
const normalizeText = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

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
  const [searchText, setSearchText] = useState('');
  const [unresolved, setUnresolved] = useState(false);

  // Un changement de valeur (sélection, effacement, remise à zéro) lève l'erreur locale.
  useEffect(() => {
    setUnresolved(false);
  }, [value]);

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
    setSearchText('');
    setUnresolved(false);
    if (!communeId) {
      onChange(null);
      return;
    }

    const selected = communes.find(item => item.communeId === communeId) || null;
    onChange(selected);
  };

  const handleSearch = (text: string) => {
    setSearchText(text);
    if (!normalizeText(text)) setUnresolved(false);
  };

  // Résout le texte saisi : correspondance exacte, sinon résultat unique du filtre.
  const resolveTypedText = () => {
    const needle = normalizeText(searchText);
    if (!needle) {
      setSearchText('');
      return;
    }
    const exact = communes.find(c => normalizeText(c.commune) === needle);
    if (exact) {
      handleSelect(exact.communeId);
      return;
    }
    const matches = communes.filter(c => normalizeText(c.commune).includes(needle));
    if (matches.length === 1) {
      handleSelect(matches[0].communeId);
      return;
    }
    setUnresolved(true);
  };

  const unresolvedMessage = !error && unresolved ? t('Choisissez une commune dans la liste') : undefined;
  const hasError = Boolean(error || unresolvedMessage);

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
        onSearch={handleSearch}
        onBlur={resolveTypedText}
        onInputKeyDown={event => {
          if (event.key === 'Enter') resolveTypedText();
        }}
        filterOption={(input, option) => {
          const label = normalizeText(String(option?.label || ''));
          return label.includes(normalizeText(input));
        }}
        optionFilterProp="label"
        notFoundContent={loading ? t('Chargement des communes...') : t('Aucune commune trouvee')}
        style={{ width: '100%' }}
        status={hasError ? 'error' : undefined}
      />
      {error && (
        <Text type="danger" style={{ fontSize: '12px' }}>
          {error}
        </Text>
      )}
      {unresolvedMessage && (
        <Text type="danger" style={{ fontSize: '12px' }}>
          {unresolvedMessage}
        </Text>
      )}
    </div>
  );
};
