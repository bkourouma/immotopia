import React, { useState, useEffect } from 'react';
import { getAllCommunes, GeographicLocation } from '../../services/geographic-service';
import { X, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CommuneMultiSelectProps {
  value: string[]; // Array of commune IDs
  onChange: (communeIds: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const CommuneMultiSelect: React.FC<CommuneMultiSelectProps> = ({
  value = [],
  onChange,
  placeholder = 'Sélectionner des communes...',
  disabled = false,
  className
}) => {
  const [communes, setCommunes] = useState<GeographicLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadCommunes();
  }, []);

  const loadCommunes = async () => {
    try {
      setLoading(true);
      const data = await getAllCommunes();
      setCommunes(data);
    } catch (error) {
      console.error('Error loading communes:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCommunes = communes.filter(commune =>
    commune.commune.toLowerCase().includes(searchQuery.toLowerCase()) ||
    commune.region.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedCommunes = communes.filter(c => value.includes(c.communeId));

  const toggleCommune = (communeId: string) => {
    if (disabled) return;
    
    if (value.includes(communeId)) {
      onChange(value.filter(id => id !== communeId));
    } else {
      onChange([...value, communeId]);
    }
  };

  const removeCommune = (communeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter(id => id !== communeId));
  };

  return (
    <div className={cn('relative', className)}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm',
          'ring-offset-background placeholder:text-muted-foreground',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'min-h-[2.5rem]'
        )}
      >
        <div className="flex flex-1 flex-wrap gap-1 overflow-hidden">
          {selectedCommunes.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            selectedCommunes.map((commune) => (
              <span
                key={commune.communeId}
                className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800"
              >
                {commune.commune}
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => removeCommune(commune.communeId, e)}
                    className="hover:text-blue-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))
          )}
        </div>
        <ChevronDown className={cn('h-4 w-4 opacity-50 flex-shrink-0', isOpen && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg">
            {/* Search Input */}
            <div className="border-b p-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher une commune..."
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>

            {/* Options List */}
            <div className="max-h-60 overflow-auto p-1">
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                </div>
              ) : filteredCommunes.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500">
                  Aucune commune trouvée
                </div>
              ) : (
                filteredCommunes.map((commune) => {
                  const isSelected = value.includes(commune.communeId);
                  return (
                    <label
                      key={commune.communeId}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm hover:bg-gray-100',
                        isSelected && 'bg-blue-50'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleCommune(commune.communeId)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="font-medium">{commune.commune}</div>
                        <div className="text-xs text-gray-500">{commune.region}</div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            {/* Selected Count */}
            {selectedCommunes.length > 0 && (
              <div className="border-t px-3 py-2 text-xs text-gray-500">
                {selectedCommunes.length} commune{selectedCommunes.length > 1 ? 's' : ''} sélectionnée{selectedCommunes.length > 1 ? 's' : ''}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};


