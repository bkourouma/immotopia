import React, { useState, useEffect, useMemo } from 'react';
import { Select, Spin, Empty, Typography } from 'antd';
import { MapPin } from 'lucide-react';
import { GeographicLocation, getAllCommunes } from '../../services/geographic-service';

const { Text } = Typography;

// Simple debounce function
function debounce(func: Function, wait: number) {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

interface CommuneSearchableSelectProps {
  value: string;
  onChange: (communeId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const CommuneSearchableSelect: React.FC<CommuneSearchableSelectProps> = ({
  value,
  onChange,
  placeholder = 'Rechercher une ville...',
  disabled = false,
  className = '',
}) => {
  const [communes, setCommunes] = useState<GeographicLocation[]>([]);
  const [options, setOptions] = useState<GeographicLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    const loadCommunes = async () => {
      setLoading(true);
      try {
        const list = await getAllCommunes();
        setCommunes(list);
        setOptions(list.slice(0, 50));
      } catch (err) {
        console.error('Error loading communes:', err);
      } finally {
        setLoading(false);
      }
    };
    loadCommunes();
  }, []);

  const handleSearch = useMemo(
    () =>
      debounce((search: string) => {
        if (!search) {
          setOptions(communes.slice(0, 50));
          return;
        }
        setFetching(true);
        const query = search.toLowerCase();
        const filtered = communes.filter(
          (c) =>
            c.commune?.toLowerCase().includes(query) ||
            c.region?.toLowerCase().includes(query) ||
            c.country?.toLowerCase().includes(query) ||
            c.displayName?.toLowerCase().includes(query)
        );
        setOptions(filtered.slice(0, 50));
        setFetching(false);
      }, 300),
    [communes]
  );

  return (
    <div className={className}>
      <Select
        showSearch
        value={value || undefined}
        placeholder={loading ? 'Chargement...' : placeholder}
        disabled={disabled || loading}
        defaultActiveFirstOption={false}
        suffixIcon={<MapPin className="h-4 w-4 text-gray-400" />}
        filterOption={false}
        onSearch={handleSearch}
        onChange={onChange}
        notFoundContent={fetching ? <Spin size="small" /> : <Empty description="Aucun résultat" />}
        style={{ width: '100%' }}
        allowClear
      >
        {options.map((commune) => (
          <Select.Option key={commune.communeId} value={commune.communeId}>
            <div className="flex items-center py-1">
              <div className="bg-slate-50 p-2 rounded-full mr-3 flex-shrink-0">
                <MapPin className="h-4 w-4 text-slate-500" />
              </div>
              <div className="flex flex-col overflow-hidden">
                <Text strong style={{ fontSize: '14px' }} ellipsis>{commune.commune}</Text>
                <Text type="secondary" style={{ fontSize: '12px' }} ellipsis>
                  {commune.region}, {commune.country}
                </Text>
              </div>
            </div>
          </Select.Option>
        ))}
      </Select>
    </div>
  );
};



