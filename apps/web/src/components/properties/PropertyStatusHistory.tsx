import React, { useState, useEffect } from 'react';
import { Loader2, Clock, User } from 'lucide-react';
import { PropertyStatus } from '../../types/property-types';
import apiClient from '../../utils/api-client';

interface StatusHistoryEntry {
  id: string;
  propertyId: string;
  previousStatus: PropertyStatus | null;
  newStatus: PropertyStatus;
  changedByUserId: string;
  changedBy?: {
    id: string;
    email: string;
    fullName: string | null;
  };
  notes: string | null;
  createdAt: string;
}

interface PropertyStatusHistoryProps {
  propertyId: string;
  tenantId: string;
}

const statusLabels: Record<PropertyStatus, string> = {
  [PropertyStatus.DRAFT]: 'Brouillon',
  [PropertyStatus.UNDER_REVIEW]: 'En révision',
  [PropertyStatus.AVAILABLE]: 'Disponible',
  [PropertyStatus.RESERVED]: 'Réservé',
  [PropertyStatus.UNDER_OFFER]: 'Sous offre',
  [PropertyStatus.RENTED]: 'Loué',
  [PropertyStatus.SOLD]: 'Vendu',
  [PropertyStatus.ARCHIVED]: 'Archivé',
};

export const PropertyStatusHistory: React.FC<PropertyStatusHistoryProps> = ({
  propertyId,
  tenantId,
}) => {
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [propertyId, tenantId]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<{ success: boolean; data: StatusHistoryEntry[] }>(
        `/tenants/${tenantId}/properties/${propertyId}/status/history`
      );
      setHistory(response.data.data);
    } catch (error) {
      console.error('Error loading status history:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Clock className="h-8 w-8 mx-auto mb-2 text-gray-400" />
        <p>Aucun historique de statut</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {history.map((entry, index) => (
        <div
          key={entry.id}
          className="flex items-start gap-4 pb-4 border-b last:border-b-0"
        >
          <div className="flex-shrink-0 mt-1">
            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
              <Clock className="h-4 w-4 text-blue-600" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {entry.previousStatus && (
                <>
                  <span className="text-sm text-gray-600">
                    {statusLabels[entry.previousStatus]}
                  </span>
                  <span className="text-gray-400">→</span>
                </>
              )}
              <span className="font-medium text-gray-900">
                {statusLabels[entry.newStatus]}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <User className="h-3 w-3" />
              <span>
                {entry.changedBy?.fullName || entry.changedBy?.email || 'Utilisateur inconnu'}
              </span>
              <span>•</span>
              <span>{formatDate(entry.createdAt)}</span>
            </div>
            {entry.notes && (
              <p className="text-sm text-gray-600 mt-1 italic">"{entry.notes}"</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};





