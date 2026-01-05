import React, { useState, useEffect, useRef } from 'react';
import { Search, X, MapPin } from 'lucide-react';
import { searchLocations, GeographicLocation } from '../../services/geographic-service';

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
  placeholder = 'Rechercher une localisation (Commune, Région, Pays)...',
  className = '',
  required = false,
  error,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<GeographicLocation[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<GeographicLocation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load selected location if value is provided
  useEffect(() => {
    if (value && !selectedLocation) {
      // Try to find in results or load from API
      // For now, we'll just clear if value changes externally
    }
  }, [value]);

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

  // Search with debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const locations = await searchLocations(searchQuery, 20);
        setResults(locations);
        setIsOpen(true);
      } catch (error) {
        console.error('Error searching locations:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  const handleSelect = (location: GeographicLocation) => {
    setSelectedLocation(location);
    setSearchQuery(location.displayName);
    setIsOpen(false);
    onChange(location);
  };

  const handleClear = () => {
    setSelectedLocation(null);
    setSearchQuery('');
    setResults([]);
    setIsOpen(false);
    onChange(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (!query) {
      handleClear();
    }
  };

  const handleInputFocus = () => {
    if (searchQuery.trim().length >= 2 && results.length > 0) {
      setIsOpen(true);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <MapPin className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          className={`w-full pl-10 pr-10 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            error ? 'border-red-500' : 'border-gray-300'
          }`}
          required={required}
        />
        {selectedLocation && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        )}
        {isLoading && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          </div>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-[9999] w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
          {results.map((location) => (
            <button
              key={location.id}
              type="button"
              onClick={() => handleSelect(location)}
              className="w-full text-left px-4 py-2 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
            >
              <div className="flex items-start">
                <MapPin className="h-4 w-4 text-gray-400 mt-1 mr-2 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">
                    {location.commune}
                  </div>
                  <div className="text-sm text-gray-500 truncate">
                    {location.region} • {location.country}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {isOpen && searchQuery.trim().length >= 2 && !isLoading && results.length === 0 && (
        <div className="absolute z-[9999] w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg p-4 text-center text-gray-500">
          Aucun résultat trouvé
        </div>
      )}

      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}

      {/* Hidden input for form submission */}
      {selectedLocation && (
        <>
          <input
            type="hidden"
            name="communeId"
            value={selectedLocation.communeId}
          />
          <input
            type="hidden"
            name="regionId"
            value={selectedLocation.regionId}
          />
          <input
            type="hidden"
            name="countryId"
            value={selectedLocation.countryId}
          />
        </>
      )}
    </div>
  );
};

