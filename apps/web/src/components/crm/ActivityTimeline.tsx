import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CrmActivity } from '../../types/crm-types';
import { Activity, Clock, User, Phone, Mail, MapPin, Users } from 'lucide-react';

interface ActivityTimelineProps {
  activities: CrmActivity[];
  loading?: boolean;
  tenantId?: string;
  contactId?: string;
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ activities, loading = false, tenantId, contactId }) => {
  const navigate = useNavigate();
  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
        <p className="mt-2 text-sm text-gray-600">Loading activities...</p>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Activity className="h-8 w-8 mx-auto mb-2 text-gray-400" />
        <p>No activities yet</p>
      </div>
    );
  }

  const getActivityIcon = (type: string) => {
    const iconClass = 'h-4 w-4';
    switch (type) {
      case 'CALL':
        return <Phone className={iconClass} />;
      case 'EMAIL':
        return <Mail className={iconClass} />;
      case 'VISIT':
        return <MapPin className={iconClass} />;
      case 'MEETING':
        return <Users className={iconClass} />;
      default:
        return <Activity className={iconClass} />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'CALL':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'EMAIL':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'VISIT':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'MEETING':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'NOTE':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      case 'CORRECTION':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
      <div className="space-y-6">
        {activities.map((activity, index) => (
          <div key={activity.id} className="relative flex gap-4">
            <div className={`flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center ${getActivityColor(activity.activityType)}`}>
              {getActivityIcon(activity.activityType)}
            </div>
            <div className="flex-1 pb-6">
              <div 
                onClick={() => {
                  if (tenantId) {
                    const params = new URLSearchParams();
                    if (contactId) params.set('contactId', contactId);
                    if (activity.deal?.id) params.set('dealId', activity.deal.id);
                    navigate(`/tenant/${tenantId}/crm/activities?${params.toString()}`);
                  }
                }}
                className={`bg-white rounded-lg shadow-sm p-4 ${tenantId ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{activity.activityType}</span>
                    {activity.direction && (
                      <span className="text-xs text-gray-500">({activity.direction})</span>
                    )}
                    {activity.correctionOfId && (
                      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                        Correction
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Clock className="h-3 w-3" />
                    {new Date(activity.occurredAt).toLocaleString()}
                  </div>
                </div>
                {activity.subject && (
                  <h4 className="font-medium text-gray-900 mb-1">{activity.subject}</h4>
                )}
                <p className="text-sm text-gray-600 mb-2">{activity.content}</p>
                {activity.outcome && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <span className="text-xs font-medium text-gray-700">Outcome: </span>
                    <span className="text-xs text-gray-600">{activity.outcome}</span>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  {activity.contact && (
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (tenantId && activity.contact?.id) {
                          navigate(`/tenant/${tenantId}/crm/contacts/${activity.contact.id}`);
                        }
                      }}
                      className={`flex items-center gap-1 ${tenantId && activity.contact?.id ? 'cursor-pointer hover:text-blue-600 transition-colors' : ''}`}
                    >
                      <User className="h-3 w-3" />
                      <span className="font-medium">Contact:</span>
                      <span>{activity.contact.firstName} {activity.contact.lastName}</span>
                    </div>
                  )}
                  {activity.deal && (
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (tenantId && activity.deal?.id) {
                          navigate(`/tenant/${tenantId}/crm/deals/${activity.deal.id}`);
                        }
                      }}
                      className={`flex items-center gap-1 ${tenantId && activity.deal?.id ? 'cursor-pointer hover:text-blue-600 transition-colors' : ''}`}
                    >
                      <Activity className="h-3 w-3" />
                      <span className="font-medium">Affaire:</span>
                      <span>{activity.deal.type} - {activity.deal.stage}</span>
                    </div>
                  )}
                  {activity.createdBy && (
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <span className="font-medium">Par:</span>
                      <span>{activity.createdBy.fullName || activity.createdBy.email}</span>
                    </div>
                  )}
                </div>
                {activity.nextActionAt && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <span className="text-xs font-medium text-blue-700">Next Action: </span>
                    <span className="text-xs text-blue-600">
                      {activity.nextActionType || 'Follow-up'} on{' '}
                      {new Date(activity.nextActionAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

