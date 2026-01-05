import React from 'react';
import { PropertyType } from '../../types/property-types';
import { Building2, Home, Box, Store, Factory, MapPin, Building, Car } from 'lucide-react';
import { cn } from '../../lib/utils';

interface PropertyTypeSelectorProps {
  selectedType?: PropertyType;
  onSelect: (type: PropertyType) => void;
  disabled?: boolean;
}

const propertyTypeConfig: Record<PropertyType, { label: string; icon: React.ReactNode }> = {
  APPARTEMENT: { label: 'Appartement', icon: <Building2 className="h-5 w-5" /> },
  MAISON_VILLA: { label: 'Maison/Villa', icon: <Home className="h-5 w-5" /> },
  STUDIO: { label: 'Studio', icon: <Box className="h-5 w-5" /> },
  DUPLEX_TRIPLEX: { label: 'Duplex/Triplex', icon: <Building className="h-5 w-5" /> },
  CHAMBRE_COLOCATION: { label: 'Chambre (Colocation)', icon: <Box className="h-5 w-5" /> },
  BUREAU: { label: 'Bureau', icon: <Building2 className="h-5 w-5" /> },
  BOUTIQUE_COMMERCIAL: { label: 'Boutique/Commercial', icon: <Store className="h-5 w-5" /> },
  ENTREPOT_INDUSTRIEL: { label: 'Entrepôt/Industriel', icon: <Factory className="h-5 w-5" /> },
  TERRAIN: { label: 'Terrain', icon: <MapPin className="h-5 w-5" /> },
  IMMEUBLE: { label: 'Immeuble', icon: <Building className="h-5 w-5" /> },
  PARKING_BOX: { label: 'Parking/Box', icon: <Car className="h-5 w-5" /> },
  LOT_PROGRAMME_NEUF: { label: 'Lot (Programme neuf)', icon: <Building className="h-5 w-5" /> },
};

export const PropertyTypeSelector: React.FC<PropertyTypeSelectorProps> = ({
  selectedType,
  onSelect,
  disabled = false,
}) => {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Object.entries(propertyTypeConfig).map(([type, config]) => (
        <button
          key={type}
          type="button"
          onClick={() => !disabled && onSelect(type as PropertyType)}
          disabled={disabled}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-lg border-2 p-4 transition-all',
            'hover:border-blue-500 hover:bg-blue-50',
            selectedType === type
              ? 'border-blue-600 bg-blue-50 text-blue-900'
              : 'border-slate-200 bg-white text-slate-700',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          <div className={cn(selectedType === type ? 'text-blue-600' : 'text-slate-400')}>
            {config.icon}
          </div>
          <span className="text-sm font-medium">{config.label}</span>
        </button>
      ))}
    </div>
  );
};





