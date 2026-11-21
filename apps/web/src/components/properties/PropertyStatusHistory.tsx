import React, { useState, useEffect } from 'react';
import { Clock, User } from 'lucide-react';
import { SkeletonList, StateBlock } from '../primitives';
import { apiErrorText } from './property-api-errors';
import { PropertyStatus } from '../../types/property-types';
import apiClient from '../../utils/api-client';
import { t } from '../../i18n/t';
import { localizedRecord } from '../../i18n/localized';

import { activeLocale } from '../../i18n/format';
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

const statusLabels: Record<PropertyStatus, string> = localizedRecord(() => ({
  [PropertyStatus.DRAFT]: t('Brouillon'),
  [PropertyStatus.UNDER_REVIEW]: t('En révision'),
  [PropertyStatus.AVAILABLE]: t('Disponible'),
  [PropertyStatus.RESERVED]: t('Réservé'),
  [PropertyStatus.UNDER_OFFER]: t('Sous offre'),
  [PropertyStatus.RENTED]: t('Loué'),
  [PropertyStatus.SOLD]: t('Vendu'),
  [PropertyStatus.ARCHIVED]: t('Archivé')
}));

export const PropertyStatusHistory: React.FC<PropertyStatusHistoryProps> = ({ propertyId, tenantId }) => {
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, [propertyId, tenantId]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await apiClient.get<{ success: boolean; data: StatusHistoryEntry[] }>(
        `/tenants/${tenantId}/properties/${propertyId}/status/history`
      );
      setHistory(response.data.data);
    } catch (error) {
      console.error('Error loading status history:', error);
      setLoadError(apiErrorText(error, t("Impossible de charger l'historique des statuts.")));
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(activeLocale(), {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  };

  if (loading) {
    return <SkeletonList rows={2} aria-label={t("Chargement de l'historique des statuts")} />;
  }

  if (loadError) {
    return (
      <StateBlock
        variant="error"
        title={t("Impossible de charger l'historique")}
        description={loadError}
        onRetry={() => void loadHistory()}
      />
    );
  }

  if (history.length === 0) {
    return (
      <StateBlock
        variant="empty"
        title={t('Aucun historique de statut')}
        description={t('Chaque changement de statut du bien sera consigné ici.')}
      />
    );
  }

  return (
    <div className="space-y-4">
      {history.map((entry, index) => (
        <div key={entry.id} className="flex items-start gap-4 pb-4 border-b last:border-b-0">
          <div className="flex-shrink-0 mt-1">
            <div className="h-8 w-8 rounded-full bg-primary-bg flex items-center justify-center">
              <Clock className="h-4 w-4 text-primary" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {entry.previousStatus && (
                <>
                  <span className="text-sm text-gray-600">{statusLabels[entry.previousStatus]}</span>
                  <span className="text-gray-400">→</span>
                </>
              )}
              <span className="font-medium text-gray-900">{statusLabels[entry.newStatus]}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <User className="h-3 w-3" />
              <span>{entry.changedBy?.fullName || entry.changedBy?.email || t('Utilisateur inconnu')}</span>
              <span>•</span>
              <span>{formatDate(entry.createdAt)}</span>
            </div>
            {entry.notes && <p className="text-sm text-gray-600 mt-1 italic">"{entry.notes}"</p>}
          </div>
        </div>
      ))}
    </div>
  );
};
