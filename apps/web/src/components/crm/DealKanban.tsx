import { contactDisplayName } from '../../utils/contact-display';
import React, { useState } from 'react';
import { CrmDealDetail, CrmDealStage } from '../../types/crm-types';
import { Button } from '../ui/button';
import { Dropdown } from 'antd';
import { Plus, ArrowRightLeft } from 'lucide-react';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { t } from '../../i18n/t';
import { dealStageLabel, dealTypeLabel } from '../../utils/crm-labels';
import { formatFcfa } from '../../utils/crm-utils';
import { KANBAN_STAGES, type KanbanColumns, type KanbanDeal } from './use-deal-kanban';

import { activeLocale } from '../../i18n/format';
interface DealKanbanProps {
  /** Une entrée par étape : cartes chargées, total de l'étape et état de chargement. */
  columns: KanbanColumns;
  stages?: readonly CrmDealStage[];
  onDealClick?: (deal: KanbanDeal) => void;
  onStageChange?: (dealId: string, newStage: CrmDealStage) => void;
  onAddDeal?: (stage: CrmDealStage) => void;
  /** Charge la page suivante d'UNE colonne. */
  onLoadMore?: (stage: CrmDealStage) => void;
}

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
  // Jamais négatif : l'horloge du navigateur peut avancer sur celle du serveur.
  const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

  if (diffDays === 0) {
    return d.toLocaleTimeString(activeLocale(), { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays < 7) {
    return `${diffDays}j`;
  } else {
    return d.toLocaleDateString(activeLocale(), { month: '2-digit', day: '2-digit' });
  }
};

export const DealKanban: React.FC<DealKanbanProps> = ({
  columns,
  stages: pipelineStages = KANBAN_STAGES,
  onDealClick,
  onStageChange,
  onAddDeal,
  onLoadMore
}) => {
  const { isDesktop } = useBreakpoint();
  const deals: KanbanDeal[] = pipelineStages.flatMap(stage => columns[stage]?.deals ?? []);
  const [draggedDealId, setDraggedDealId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<CrmDealStage | null>(null);

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

    const deal = deals.find(d => d.id === draggedDealId);
    if (deal && deal.stage !== targetStage) {
      onStageChange(draggedDealId, targetStage);
    }

    setDraggedDealId(null);
  };

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
        {pipelineStages.map(stage => {
          const column = columns[stage];
          const stageDeals = column?.deals ?? [];
          const isDragOver = dragOverStage === stage;
          const budgetSum = stageDeals.reduce((sum, d) => sum + (Number(d.budgetMax) || 0), 0);
          const allLoaded = stageDeals.length >= (column?.total ?? 0);

          return (
            <div
              key={stage}
              className={`flex-shrink-0 w-64 rounded border border-gray-200 bg-gray-50 flex flex-col ${
                isDragOver ? 'border-primary bg-primary-bg' : ''
              }`}
              onDragOver={e => handleDragOver(e, stage)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, stage)}
            >
              {/* Stage Header */}
              <div className="p-2 border-b border-gray-200 bg-white rounded-t">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-gray-900 text-sm">{dealStageLabel(stage)}</h3>
                  <span
                    className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
                    data-testid={`kanban-total-${stage}`}
                  >
                    {column?.total ?? 0}
                  </span>
                </div>
                {budgetSum > 0 && (
                  <div className="mt-0.5 text-[11px] text-gray-500" data-testid={`kanban-budget-${stage}`}>
                    {t('Budget cumulé : {{montant}}', {
                      montant: `${formatFcfa(budgetSum)}${allLoaded ? '' : '+'}`
                    })}
                  </div>
                )}
                {onAddDeal && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 text-primary hover:text-primary-hover hover:bg-primary-bg w-full justify-start h-7 max-lg:h-11 text-xs px-2"
                    onClick={() => onAddDeal(stage)}
                  >
                    <Plus className="h-3 w-3 me-1" />
                    {t('Ajouter une affaire')}
                  </Button>
                )}
              </div>

              {/* Stage Content */}
              <div className="p-2 space-y-2 flex-1 overflow-y-auto">
                {column?.loading && stageDeals.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-xs">
                    <p>{t('Chargement des affaires...')}</p>
                  </div>
                ) : stageDeals.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-xs">
                    <p>{t('Il semble que cette étape soit vide')}</p>
                  </div>
                ) : (
                  stageDeals.map(deal => {
                    const dealDetail = deal as CrmDealDetail;
                    const contact = dealDetail.contact;
                    const contactName = contact
                      ? contactDisplayName(contact)
                      : t('Contact ID: {{contactId}}', { contactId: deal.contactId });
                    const initials = contact ? getInitials(contact.firstName, contact.lastName) : '?';

                    return (
                      <div
                        key={deal.id}
                        draggable
                        onDragStart={e => handleDragStart(e, deal.id)}
                        onDragEnd={handleDragEnd}
                        className={`bg-white rounded shadow-sm p-2.5 cursor-pointer hover:shadow-md transition-all border border-gray-200 ${
                          draggedDealId === deal.id ? 'opacity-50' : ''
                        }`}
                        onClick={() => onDealClick?.(deal)}
                        role="link"
                        tabIndex={0}
                        aria-label={`${contactName} — ${dealTypeLabel(deal.type)}`}
                        onKeyDown={e => {
                          if (e.target !== e.currentTarget) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onDealClick?.(deal);
                          }
                        }}
                      >
                        {/* Contact Info */}
                        <div className="flex items-start gap-2 mb-2">
                          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center text-xs font-medium text-gray-700">
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-900 truncate">{contactName}</div>
                            <div className="text-[10px] text-gray-500 mt-0.5">{formatDate(deal.createdAt)}</div>
                          </div>
                        </div>

                        {/* Deal Type Badge */}
                        <div className="mb-1.5">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              deal.type === 'ACHAT' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                            }`}
                          >
                            {dealTypeLabel(deal.type)}
                          </span>
                        </div>

                        {/* Budget */}
                        {deal.budgetMax && (
                          <div className="text-xs font-semibold text-gray-900 mb-1">{formatFcfa(deal.budgetMax)}</div>
                        )}

                        {/* Location */}
                        {deal.locationZone && (
                          <div className="text-[10px] text-gray-500 truncate">📍 {deal.locationZone}</div>
                        )}

                        {/* Changer d'étape sans glisser-déposer (tactile, clavier) : même appel que le dépôt d'une carte. */}
                        {onStageChange && (
                          <div className="mt-2" onClick={e => e.stopPropagation()}>
                            <Dropdown
                              trigger={['click']}
                              menu={{
                                items: pipelineStages
                                  .filter(target => target !== deal.stage)
                                  .map(target => ({
                                    key: target,
                                    label: dealStageLabel(target),
                                    onClick: () => onStageChange(deal.id, target)
                                  }))
                              }}
                            >
                              <button
                                type="button"
                                className={`inline-flex items-center gap-1 rounded border border-gray-300 px-2 text-xs text-gray-700 hover:bg-gray-50 ${
                                  isDesktop ? 'h-7' : 'h-11'
                                }`}
                                aria-label={t("Déplacer l'affaire de {{nom}} vers une autre étape", {
                                  nom: contactName
                                })}
                              >
                                <ArrowRightLeft className="h-3 w-3" aria-hidden="true" />
                                {t('Déplacer vers…')}
                              </button>
                            </Dropdown>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}

                {onLoadMore && stageDeals.length > 0 && stageDeals.length < (column?.total ?? 0) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-7 max-lg:h-11 text-xs"
                    disabled={column?.loadingMore}
                    onClick={() => onLoadMore(stage)}
                  >
                    {column?.loadingMore ? t('Chargement...') : t('Afficher plus')}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
