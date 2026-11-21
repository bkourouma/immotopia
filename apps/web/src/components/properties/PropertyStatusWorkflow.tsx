import React, { useId, useState } from 'react';
import { Button } from '../ui/button';
import { PropertyStatus } from '../../types/property-types';
import { ArrowRight, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import apiClient from '../../utils/api-client';
import { App } from 'antd';
import { t } from '../../i18n/t';
import { localizedRecord } from '../../i18n/localized';
import { useConfirmAction } from '../primitives';
import { apiErrorText } from './property-api-errors';

interface PropertyStatusWorkflowProps {
  propertyId: string;
  tenantId: string;
  currentStatus: PropertyStatus;
  onStatusChange?: () => void;
}

const statusConfig: Record<PropertyStatus, { label: string; color: string; icon: React.ReactNode }> = localizedRecord(
  () => ({
    [PropertyStatus.DRAFT]: {
      label: t('Brouillon'),
      color: 'bg-gray-100 text-gray-800',
      icon: <Clock className="h-4 w-4" />
    },
    [PropertyStatus.UNDER_REVIEW]: {
      label: t('En révision'),
      color: 'bg-yellow-100 text-yellow-800',
      icon: <Clock className="h-4 w-4" />
    },
    [PropertyStatus.AVAILABLE]: {
      label: t('Disponible'),
      color: 'bg-green-100 text-green-800',
      icon: <CheckCircle className="h-4 w-4" />
    },
    [PropertyStatus.RESERVED]: {
      label: t('Réservé'),
      color: 'bg-teal-100 text-teal-800',
      icon: <Clock className="h-4 w-4" />
    },
    [PropertyStatus.UNDER_OFFER]: {
      label: t('Sous offre'),
      color: 'bg-blue-100 text-blue-800',
      icon: <Clock className="h-4 w-4" />
    },
    [PropertyStatus.RENTED]: {
      label: t('Loué'),
      color: 'bg-purple-100 text-purple-800',
      icon: <CheckCircle className="h-4 w-4" />
    },
    [PropertyStatus.SOLD]: {
      label: t('Vendu'),
      color: 'bg-red-100 text-red-800',
      icon: <XCircle className="h-4 w-4" />
    },
    [PropertyStatus.ARCHIVED]: {
      label: t('Archivé'),
      color: 'bg-gray-100 text-gray-800',
      icon: <XCircle className="h-4 w-4" />
    }
  })
);

/** Ce que change le passage à ce statut, dit avant de confirmer (texte seul : les règles métier sont côté API). */
const consequences = (): Partial<Record<PropertyStatus, string>> => ({
  [PropertyStatus.DRAFT]: t("Le bien repasse en brouillon : il n'est plus proposé tant qu'il n'est pas complété."),
  [PropertyStatus.UNDER_REVIEW]: t("Le bien est soumis à relecture avant d'être mis en ligne."),
  [PropertyStatus.AVAILABLE]: t('Le bien est disponible : il peut être proposé aux clients et publié.'),
  [PropertyStatus.RESERVED]: t("Le bien est réservé pour un client : il n'est plus présenté comme libre."),
  [PropertyStatus.UNDER_OFFER]: t('Une offre est en cours sur ce bien.'),
  [PropertyStatus.RENTED]: t('Le bien est loué : il sort des biens disponibles.'),
  [PropertyStatus.SOLD]: t('Le bien est vendu : la transaction est considérée comme conclue.'),
  [PropertyStatus.ARCHIVED]: t(
    'Le bien sort de la liste active et ne compte plus dans le quota de lots. Vous pourrez le rétablir ensuite.'
  )
});

// Allowed transitions from each status
const ALLOWED_TRANSITIONS: Record<PropertyStatus, PropertyStatus[]> = {
  [PropertyStatus.DRAFT]: [PropertyStatus.UNDER_REVIEW, PropertyStatus.ARCHIVED],
  [PropertyStatus.UNDER_REVIEW]: [PropertyStatus.DRAFT, PropertyStatus.AVAILABLE, PropertyStatus.ARCHIVED],
  [PropertyStatus.AVAILABLE]: [PropertyStatus.RESERVED, PropertyStatus.UNDER_OFFER, PropertyStatus.ARCHIVED],
  [PropertyStatus.RESERVED]: [PropertyStatus.AVAILABLE, PropertyStatus.UNDER_OFFER, PropertyStatus.ARCHIVED],
  [PropertyStatus.UNDER_OFFER]: [
    PropertyStatus.AVAILABLE,
    PropertyStatus.RENTED,
    PropertyStatus.SOLD,
    PropertyStatus.ARCHIVED
  ],
  [PropertyStatus.RENTED]: [PropertyStatus.AVAILABLE, PropertyStatus.ARCHIVED],
  [PropertyStatus.SOLD]: [PropertyStatus.ARCHIVED],
  [PropertyStatus.ARCHIVED]: [PropertyStatus.DRAFT, PropertyStatus.AVAILABLE]
};

export const PropertyStatusWorkflow: React.FC<PropertyStatusWorkflowProps> = ({
  propertyId,
  tenantId,
  currentStatus,
  onStatusChange
}) => {
  const { message } = App.useApp();
  const confirm = useConfirmAction();
  const notesId = useId();
  const [selectedStatus, setSelectedStatus] = useState<PropertyStatus | null>(null);
  const [notes, setNotes] = useState('');
  const [updating, setUpdating] = useState(false);

  const allowedNextStatuses = ALLOWED_TRANSITIONS[currentStatus] || [];

  const handleStatusChange = () => {
    if (!selectedStatus || updating) return;
    // Statuts difficiles à défaire : une confirmation qui nomme le changement.
    if (selectedStatus === PropertyStatus.ARCHIVED || selectedStatus === PropertyStatus.SOLD) {
      const cible = statusConfig[selectedStatus].label;
      confirm({
        title: t('Passer ce bien au statut « {{statut}} » ?', { statut: cible }),
        description: consequences()[selectedStatus],
        okText: t('Changer vers {{statut}}', { statut: cible }),
        danger: selectedStatus === PropertyStatus.ARCHIVED,
        onConfirm: applyStatusChange
      });
      return;
    }
    void applyStatusChange();
  };

  const applyStatusChange = async () => {
    if (!selectedStatus) return;

    setUpdating(true);
    try {
      await apiClient.post(`/tenants/${tenantId}/properties/${propertyId}/status`, {
        status: selectedStatus,
        notes: notes.trim() || undefined
      });

      message.success(t('Statut mis à jour : {{statut}}.', { statut: statusConfig[selectedStatus].label }));
      setSelectedStatus(null);
      setNotes('');
      if (onStatusChange) {
        onStatusChange();
      }
    } catch (error: any) {
      message.error(apiErrorText(error, t('Erreur lors du changement de statut')));
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
        {allowedNextStatuses.length > 0 && <ArrowRight className="h-5 w-5 text-gray-400" />}
      </div>

      {/* Available Transitions */}
      {allowedNextStatuses.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-700">{t('Changer le statut vers:')}</h4>
          <div className="flex flex-wrap gap-2">
            {allowedNextStatuses.map(status => {
              const config = statusConfig[status];
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setSelectedStatus(status)}
                  aria-pressed={selectedStatus === status}
                  className={`flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-lg border-2 transition-colors ${
                    selectedStatus === status ? 'border-primary bg-primary-bg' : 'border-gray-200 hover:border-gray-300'
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
              {consequences()[selectedStatus] && (
                <p role="status" className="text-sm text-gray-700">
                  {consequences()[selectedStatus]}
                </p>
              )}
              <div>
                <label htmlFor={notesId} className="block text-sm font-medium text-gray-700 mb-1">
                  {t('Notes (optionnel)')}
                </label>
                <textarea
                  id={notesId}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  placeholder={t('Ajouter des notes sur ce changement de statut...')}
                />
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-2">
                <Button onClick={handleStatusChange} disabled={updating} className="flex-1">
                  {updating ? (
                    <>
                      <Loader2 className="h-4 w-4 me-2 animate-spin" />
                      {t('Mise à jour...')}
                    </>
                  ) : (
                    <>
                      {t('Changer vers')} {statusConfig[selectedStatus].label}
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
                  {t('Annuler')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {allowedNextStatuses.length === 0 && (
        <p className="text-sm text-gray-500">{t('Aucune transition disponible depuis ce statut')}</p>
      )}
    </div>
  );
};
