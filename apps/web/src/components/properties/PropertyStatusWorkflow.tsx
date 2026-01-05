import React, { useState } from 'react';
import { Button } from '../ui/button';
import { PropertyStatus } from '../../types/property-types';
import { ArrowRight, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import apiClient from '../../utils/api-client';

interface PropertyStatusWorkflowProps {
  propertyId: string;
  tenantId: string;
  currentStatus: PropertyStatus;
  onStatusChange?: () => void;
}

const statusConfig: Record<PropertyStatus, { label: string; color: string; icon: React.ReactNode }> = {
  [PropertyStatus.DRAFT]: {
    label: 'Brouillon',
    color: 'bg-gray-100 text-gray-800',
    icon: <Clock className="h-4 w-4" />,
  },
  [PropertyStatus.UNDER_REVIEW]: {
    label: 'En révision',
    color: 'bg-yellow-100 text-yellow-800',
    icon: <Clock className="h-4 w-4" />,
  },
  [PropertyStatus.AVAILABLE]: {
    label: 'Disponible',
    color: 'bg-green-100 text-green-800',
    icon: <CheckCircle className="h-4 w-4" />,
  },
  [PropertyStatus.RESERVED]: {
    label: 'Réservé',
    color: 'bg-orange-100 text-orange-800',
    icon: <Clock className="h-4 w-4" />,
  },
  [PropertyStatus.UNDER_OFFER]: {
    label: 'Sous offre',
    color: 'bg-blue-100 text-blue-800',
    icon: <Clock className="h-4 w-4" />,
  },
  [PropertyStatus.RENTED]: {
    label: 'Loué',
    color: 'bg-purple-100 text-purple-800',
    icon: <CheckCircle className="h-4 w-4" />,
  },
  [PropertyStatus.SOLD]: {
    label: 'Vendu',
    color: 'bg-red-100 text-red-800',
    icon: <XCircle className="h-4 w-4" />,
  },
  [PropertyStatus.ARCHIVED]: {
    label: 'Archivé',
    color: 'bg-gray-100 text-gray-800',
    icon: <XCircle className="h-4 w-4" />,
  },
};

// Allowed transitions from each status
const ALLOWED_TRANSITIONS: Record<PropertyStatus, PropertyStatus[]> = {
  [PropertyStatus.DRAFT]: [PropertyStatus.UNDER_REVIEW, PropertyStatus.ARCHIVED],
  [PropertyStatus.UNDER_REVIEW]: [
    PropertyStatus.DRAFT,
    PropertyStatus.AVAILABLE,
    PropertyStatus.ARCHIVED,
  ],
  [PropertyStatus.AVAILABLE]: [
    PropertyStatus.RESERVED,
    PropertyStatus.UNDER_OFFER,
    PropertyStatus.ARCHIVED,
  ],
  [PropertyStatus.RESERVED]: [
    PropertyStatus.AVAILABLE,
    PropertyStatus.UNDER_OFFER,
    PropertyStatus.ARCHIVED,
  ],
  [PropertyStatus.UNDER_OFFER]: [
    PropertyStatus.AVAILABLE,
    PropertyStatus.RENTED,
    PropertyStatus.SOLD,
    PropertyStatus.ARCHIVED,
  ],
  [PropertyStatus.RENTED]: [PropertyStatus.AVAILABLE, PropertyStatus.ARCHIVED],
  [PropertyStatus.SOLD]: [PropertyStatus.ARCHIVED],
  [PropertyStatus.ARCHIVED]: [PropertyStatus.DRAFT, PropertyStatus.AVAILABLE],
};

export const PropertyStatusWorkflow: React.FC<PropertyStatusWorkflowProps> = ({
  propertyId,
  tenantId,
  currentStatus,
  onStatusChange,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<PropertyStatus | null>(null);
  const [notes, setNotes] = useState('');
  const [updating, setUpdating] = useState(false);

  const allowedNextStatuses = ALLOWED_TRANSITIONS[currentStatus] || [];

  const handleStatusChange = async () => {
    if (!selectedStatus) return;

    setUpdating(true);
    try {
      await apiClient.post(
        `/tenants/${tenantId}/properties/${propertyId}/status`,
        {
          status: selectedStatus,
          notes: notes.trim() || undefined,
        }
      );

      setSelectedStatus(null);
      setNotes('');
      if (onStatusChange) {
        onStatusChange();
      }
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erreur lors du changement de statut');
    } finally {
      setUpdating(false);
    }
  };

  const currentConfig = statusConfig[currentStatus];

  return (
    <div className="space-y-4">
      {/* Current Status */}
      <div className="flex items-center gap-4">
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${currentConfig.color}`}>
          {currentConfig.icon}
          <span className="font-medium">{currentConfig.label}</span>
        </div>
        {allowedNextStatuses.length > 0 && (
          <ArrowRight className="h-5 w-5 text-gray-400" />
        )}
      </div>

      {/* Available Transitions */}
      {allowedNextStatuses.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-700">
            Changer le statut vers:
          </h4>
          <div className="flex flex-wrap gap-2">
            {allowedNextStatuses.map((status) => {
              const config = statusConfig[status];
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setSelectedStatus(status)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-colors ${
                    selectedStatus === status
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {config.icon}
                  <span className="text-sm font-medium">{config.label}</span>
                </button>
              );
            })}
          </div>

          {/* Notes and Submit */}
          {selectedStatus && (
            <div className="space-y-3 pt-4 border-t">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (optionnel)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Ajouter des notes sur ce changement de statut..."
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleStatusChange}
                  disabled={updating}
                  className="flex-1"
                >
                  {updating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Mise à jour...
                    </>
                  ) : (
                    <>
                      Changer vers {statusConfig[selectedStatus].label}
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSelectedStatus(null);
                    setNotes('');
                  }}
                  disabled={updating}
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {allowedNextStatuses.length === 0 && (
        <p className="text-sm text-gray-500">
          Aucune transition disponible depuis ce statut
        </p>
      )}
    </div>
  );
};





