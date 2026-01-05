import React, { useState, useEffect, useRef } from 'react';
import { Input } from './input';
import { MapPin, X, Loader2, ChevronDown } from 'lucide-react';
import { GeographicLocation, getAllCommunes } from '../../services/geographic-service';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [communes, setCommunes] = useState<GeographicLocation[]>([]);
  const [filteredCommunes, setFilteredCommunes] = useState<GeographicLocation[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedCommune, setSelectedCommune] = useState<GeographicLocation | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load communes on mount
  useEffect(() => {
    loadCommunes();
  }, []);

  // Load selected commune if value is provided
  useEffect(() => {
    if (value && communes.length > 0) {
      const commune = communes.find((c) => c.communeId === value);
      if (commune) {
        setSelectedCommune(commune);
        setSearchQuery(commune.displayName);
      }
    } else if (!value) {
      setSelectedCommune(null);
      setSearchQuery('');
    }
  }, [value, communes]);

  const loadCommunes = async () => {
    setLoading(true);
    try {
      const communesList = await getAllCommunes();
      setCommunes(communesList);
    } catch (error) {
      console.error('Error loading communes:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter communes based on search query
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchQuery.trim()) {
      setFilteredCommunes([]);
      setIsOpen(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      const query = searchQuery.toLowerCase();
      const filtered = communes.filter(
        (commune) =>
          commune.commune?.toLowerCase().includes(query) ||
          commune.region?.toLowerCase().includes(query) ||
          commune.country?.toLowerCase().includes(query) ||
          commune.displayName?.toLowerCase().includes(query)
      );
      setFilteredCommunes(filtered);
      setIsOpen(filtered.length > 0);
    }, 200);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, communes]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (commune: GeographicLocation) => {
    setSelectedCommune(commune);
    setSearchQuery(commune.displayName);
    setIsOpen(false);
    onChange(commune.communeId);
  };

  const handleClear = () => {
    setSelectedCommune(null);
    setSearchQuery('');
    setFilteredCommunes([]);
    setIsOpen(false);
    onChange('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (!query && selectedCommune) {
      handleClear();
    }
  };

  const handleInputFocus = () => {
    if (searchQuery.trim() && filteredCommunes.length > 0) {
      setIsOpen(true);
    } else if (!searchQuery.trim() && communes.length > 0) {
      // Show all communes when focusing on empty input
      setFilteredCommunes(communes.slice(0, 50)); // Limit to first 50 for performance
      setIsOpen(true);
    }
  };

  const handleToggleDropdown = () => {
    if (!disabled) {
      if (isOpen) {
        setIsOpen(false);
      } else {
        if (searchQuery.trim()) {
          setIsOpen(filteredCommunes.length > 0);
        } else {
          setFilteredCommunes(communes.slice(0, 50));
          setIsOpen(true);
        }
      }
    }
  };

  const displayCommunes = searchQuery.trim() ? filteredCommunes : communes.slice(0, 50);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <MapPin className="h-4 w-4 text-slate-400" />
        </div>
        <Input
          type="text"
          value={searchQuery}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder={loading ? 'Chargement...' : placeholder}
          disabled={disabled || loading}
          className={`pl-10 pr-10 ${disabled || loading ? 'bg-slate-100 cursor-not-allowed' : ''}`}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1">
          {selectedCommune && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="text-slate-400 hover:text-slate-600 p-1"
              tabIndex={-1}
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {loading && (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          )}
          {!loading && !selectedCommune && (
            <button
              type="button"
              onClick={handleToggleDropdown}
              className="text-slate-400 hover:text-slate-600 p-1"
              tabIndex={-1}
              disabled={disabled}
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {isOpen && displayCommunes.length > 0 && (
        <div className="absolute z-[9999] w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-auto">
          {displayCommunes.map((commune) => (
            <button
              key={commune.communeId}
              type="button"
              onClick={() => handleSelect(commune)}
              className={`w-full text-left px-4 py-2 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none ${
                selectedCommune?.communeId === commune.communeId ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex items-start">
                <MapPin className="h-4 w-4 text-slate-400 mt-1 mr-2 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 truncate">
                    {commune.commune}
                  </div>
                  <div className="text-sm text-slate-500 truncate">
                    {commune.region} • {commune.country}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {isOpen && searchQuery.trim() && !loading && filteredCommunes.length === 0 && (
        <div className="absolute z-[9999] w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg p-4 text-center text-slate-500">
          Aucun résultat trouvé
        </div>
      )}
    </div>
  );
};



