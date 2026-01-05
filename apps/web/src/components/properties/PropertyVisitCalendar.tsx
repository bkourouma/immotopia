import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, Briefcase, MapPin, CheckCircle, XCircle } from 'lucide-react';
import { PropertyVisit } from '../../types/property-types';
import { getCalendarVisits } from '../../services/property-service';
import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import { getDealTypeLabel } from '../../utils/crm-utils';

interface PropertyVisitCalendarProps {
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
  assignedToUserId?: string;
}

export const PropertyVisitCalendar: React.FC<PropertyVisitCalendarProps> = ({
  tenantId,
  startDate,
  endDate,
  assignedToUserId,
}) => {
  const [visitsByDate, setVisitsByDate] = useState<Record<string, PropertyVisit[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVisits();
  }, [tenantId, startDate, endDate, assignedToUserId]);

  const loadVisits = async () => {
    setLoading(true);
    try {
      const start = startDate || new Date();
      const end = endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      const response = await getCalendarVisits(
        tenantId,
        start.toISOString(),
        end.toISOString(),
        assignedToUserId
      );
      setVisitsByDate(response);
    } catch (error) {
      console.error('Error loading calendar visits:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string; icon: any }> = {
      SCHEDULED: {
        label: 'Planifié',
        className: 'bg-blue-100 text-blue-800',
        icon: Clock,
      },
      CONFIRMED: {
        label: 'Confirmé',
        className: 'bg-green-100 text-green-800',
        icon: CheckCircle,
      },
      DONE: {
        label: 'Terminé',
        className: 'bg-gray-100 text-gray-800',
        icon: CheckCircle,
      },
      NO_SHOW: {
        label: 'Absent',
        className: 'bg-orange-100 text-orange-800',
        icon: XCircle,
      },
      CANCELED: {
        label: 'Annulé',
        className: 'bg-red-100 text-red-800',
        icon: XCircle,
      },
    };

    const config = statusConfig[status] || statusConfig.SCHEDULED;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.className}`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Chargement des visites...</p>
      </div>
    );
  }

  const dates = Object.keys(visitsByDate).sort();

  if (dates.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg shadow">
        <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Aucune visite planifiée
        </h3>
        <p className="text-gray-600">
          Aucune visite n'est planifiée pour cette période
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {dates.map((date) => (
        <div key={date} className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            {formatDate(date)}
          </h3>

          <div className="space-y-4">
            {visitsByDate[date].map((visit) => (
              <div
                key={visit.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* Time and Status */}
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Clock className="h-4 w-4" />
                        <span className="font-medium">{formatTime(visit.scheduledAt)}</span>
                        {visit.duration && (
                          <span className="text-sm">({visit.duration} min)</span>
                        )}
                      </div>
                      {getStatusBadge(visit.status)}
                    </div>

                    {/* Property */}
                    <div className="mb-2">
                      <Link
                        to={`/tenant/${tenantId}/properties/${visit.propertyId}`}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        {visit.property?.title || visit.property?.address || 'Propriété'}
                      </Link>
                      {visit.location && (
                        <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                          <MapPin className="h-3 w-3" />
                          {visit.location}
                        </div>
                      )}
                    </div>

                    {/* Contact and Deal */}
                    <div className="space-y-1 text-sm text-gray-600">
                      {visit.contact && (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {visit.contact.firstName} {visit.contact.lastName}
                        </div>
                      )}
                      {visit.deal && (
                        <div className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3" />
                          {getDealTypeLabel(visit.deal.type)}
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    {visit.notes && (
                      <div className="mt-2 text-sm text-gray-700 bg-gray-50 rounded p-2">
                        {visit.notes}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};





