import React, { useState } from 'react';
import { CrmDeal, CrmDealDetail, CrmDealStage } from '../../types/crm-types';
import { Button } from '../ui/button';
import { Plus } from 'lucide-react';

interface DealKanbanProps {
  deals: (CrmDeal | CrmDealDetail)[];
  onDealClick?: (deal: CrmDeal | CrmDealDetail) => void;
  onStageChange?: (dealId: string, newStage: CrmDealStage) => void;
  onAddDeal?: (stage: CrmDealStage) => void;
  loading?: boolean;
}

// Pipeline stages - excluding WON and LOST from main pipeline
const pipelineStages: CrmDealStage[] = ['NEW', 'QUALIFIED', 'VISIT', 'NEGOTIATION'];

const stageLabels: Record<CrmDealStage, string> = {
  NEW: 'Nouveau',
  QUALIFIED: 'Qualifié',
  VISIT: 'Visite',
  NEGOTIATION: 'Négociation',
  WON: 'Gagné',
  LOST: 'Perdu',
};

// Get contact initials for avatar
const getInitials = (firstName?: string, lastName?: string): string => {
  const first = firstName?.charAt(0)?.toUpperCase() || '';
  const last = lastName?.charAt(0)?.toUpperCase() || '';
  return first + last || '?';
};

// Format date - compact format
const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffTime = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays < 7) {
    return `${diffDays}j`;
  } else {
    return d.toLocaleDateString('fr-FR', { month: '2-digit', day: '2-digit' });
  }
};

export const DealKanban: React.FC<DealKanbanProps> = ({
  deals,
  onDealClick,
  onStageChange,
  onAddDeal,
  loading = false,
}) => {
  const [draggedDealId, setDraggedDealId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<CrmDealStage | null>(null);

  const dealsByStage = pipelineStages.reduce((acc, stage) => {
    acc[stage] = deals.filter((deal) => deal.stage === stage);
    return acc;
  }, {} as Record<CrmDealStage, (CrmDeal | CrmDealDetail)[]>);

  const handleDragStart = (e: React.DragEvent, dealId: string) => {
    setDraggedDealId(dealId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dealId);
    // Add visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedDealId(null);
    setDragOverStage(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  };

  const handleDragOver = (e: React.DragEvent, stage: CrmDealStage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stage);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = (e: React.DragEvent, targetStage: CrmDealStage) => {
    e.preventDefault();
    setDragOverStage(null);

    if (!draggedDealId || !onStageChange) return;

    const deal = deals.find((d) => d.id === draggedDealId);
    if (deal && deal.stage !== targetStage) {
      onStageChange(draggedDealId, targetStage);
    }

    setDraggedDealId(null);
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <p className="mt-2 text-gray-600">Chargement des affaires...</p>
      </div>
    );
  }

  // Calculate minimum width needed for all stages (256px column + 12px gap)
  const minWidth = pipelineStages.length * 268;
  
  return (
    <div 
      className="w-full pb-2" 
      style={{ 
        overflowX: 'auto', 
        overflowY: 'visible',
        WebkitOverflowScrolling: 'touch'
      }}
    >
      <div className="flex gap-3 pb-2" style={{ width: 'max-content', minWidth: `${minWidth}px` }}>
        {pipelineStages.map((stage) => {
          const stageDeals = dealsByStage[stage] || [];
          const isDragOver = dragOverStage === stage;

          return (
            <div
              key={stage}
              className={`flex-shrink-0 w-64 rounded border border-gray-200 bg-gray-50 flex flex-col ${
                isDragOver ? 'border-blue-400 bg-blue-50' : ''
              }`}
              onDragOver={(e) => handleDragOver(e, stage)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage)}
            >
              {/* Stage Header */}
              <div className="p-2 border-b border-gray-200 bg-white rounded-t">
                <h3 className="font-semibold text-gray-900 text-sm">
                  {stageLabels[stage]}
                </h3>
                {onAddDeal && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 w-full justify-start h-7 text-xs px-2"
                    onClick={() => onAddDeal(stage)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Ajouter une affaire
                  </Button>
                )}
              </div>

              {/* Stage Content */}
              <div className="p-2 space-y-2 flex-1 overflow-y-auto">
                {stageDeals.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-xs">
                    <p>Il semble que cette étape soit vide</p>
                  </div>
                ) : (
                  stageDeals.map((deal) => {
                    const dealDetail = deal as CrmDealDetail;
                    const contact = dealDetail.contact;
                    const contactName = contact
                      ? `${contact.firstName} ${contact.lastName}`
                      : `Contact ID: ${deal.contactId}`;
                    const initials = contact
                      ? getInitials(contact.firstName, contact.lastName)
                      : '?';

                    return (
                      <div
                        key={deal.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, deal.id)}
                        onDragEnd={handleDragEnd}
                        className={`bg-white rounded shadow-sm p-2.5 cursor-pointer hover:shadow-md transition-all border border-gray-200 ${
                          draggedDealId === deal.id ? 'opacity-50' : ''
                        }`}
                        onClick={() => onDealClick?.(deal)}
                      >
                        {/* Contact Info */}
                        <div className="flex items-start gap-2 mb-2">
                          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center text-xs font-medium text-gray-700">
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-900 truncate">
                              {contactName}
                            </div>
                            <div className="text-[10px] text-gray-500 mt-0.5">
                              {formatDate(deal.createdAt)}
                            </div>
                          </div>
                        </div>

                        {/* Deal Type Badge */}
                        <div className="mb-1.5">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              deal.type === 'ACHAT'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-green-100 text-green-800'
                            }`}
                          >
                            {deal.type}
                          </span>
                        </div>

                        {/* Budget */}
                        {deal.budgetMax && (
                          <div className="text-xs font-semibold text-gray-900 mb-1">
                            {deal.budgetMax.toLocaleString('fr-FR')} FCFA
                          </div>
                        )}

                        {/* Location */}
                        {deal.locationZone && (
                          <div className="text-[10px] text-gray-500 truncate">
                            📍 {deal.locationZone}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

