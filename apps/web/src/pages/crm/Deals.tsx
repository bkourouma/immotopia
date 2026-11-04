import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DealForm } from '../../components/crm/DealForm';
import { ActivityForm } from '../../components/crm/ActivityForm';
import { Button } from '../../components/ui/button';
import {
  listDeals,
  createDeal,
  updateDeal,
  createActivity,
  CrmDeal,
  CrmDealDetail,
  CreateCrmDealRequest,
  UpdateCrmDealRequest,
  CreateCrmActivityRequest,
  DealFilters
} from '../../services/crm-service';
import { CrmDealStage } from '../../types/crm-types';
import { Briefcase, Plus, Edit, Eye, LayoutGrid, Activity, Calendar, Download, FileSpreadsheet } from 'lucide-react';
import { DealKanban } from '../../components/crm/DealKanban';
import { useDealKanban } from '../../components/crm/use-deal-kanban';
import { ListSearch } from '../../components/primitives/ListSearch';
import { useListSearch } from '../../hooks/useListSearch';
import { listAssignableMembers } from '../../services/membership-service';
import { collectAllPages } from '../../utils/table-export/collect';
import { exportToCSV, exportToExcel } from '../../utils/export-utils';
import { App } from 'antd';
import { t } from '../../i18n/t';
import { dealStageLabel, dealTypeLabel } from '../../utils/crm-labels';
import { formatFcfa } from '../../utils/crm-utils';

import { activeLocale, formatNumber } from '../../i18n/format';
export const Deals: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [deals, setDeals] = useState<CrmDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingDeal, setEditingDeal] = useState<CrmDeal | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [selectedDealForActivity, setSelectedDealForActivity] = useState<CrmDeal | null>(null);
  const [members, setMembers] = useState<{ value: string; label: string }[]>([]);

  // Collaborateurs de l'agence (liste bornée) : options du critère « Collaborateur ».
  useEffect(() => {
    if (!tenantId) return;
    listAssignableMembers(tenantId)
      .then(response => {
        if (response.success) {
          setMembers(
            (response.data?.members ?? []).map(member => ({
              value: member.user.id,
              label: member.user.fullName || member.user.email
            }))
          );
        }
      })
      .catch(() => undefined);
  }, [tenantId]);

  // Recherche multicritères : l'état vit dans l'URL, tout part à l'API (liste et colonnes du pipeline).
  const search = useListSearch({
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Contact, e-mail, téléphone, zone, collaborateur…')
      },
      {
        key: 'stage',
        type: 'multiSelect',
        label: t('Étape'),
        primary: true,
        options: (['NEW', 'QUALIFIED', 'VISIT', 'NEGOTIATION', 'WON', 'LOST'] as const).map(stage => ({
          value: stage,
          label: dealStageLabel(stage)
        }))
      },
      {
        key: 'type',
        type: 'multiSelect',
        label: t('Type'),
        primary: true,
        options: (['ACHAT', 'LOCATION', 'VENTE', 'GESTION', 'MANDAT'] as const).map(type => ({
          value: type,
          label: dealTypeLabel(type)
        }))
      },
      { key: 'assignedTo', type: 'select', label: t('Collaborateur'), primary: true, options: members },
      { key: 'created', type: 'dateRange', label: t('Date de création'), api: ['startDate', 'endDate'] },
      { key: 'budget', type: 'numberRange', label: t('Budget'), unit: 'FCFA', api: ['budgetMin', 'budgetMax'] }
    ]
  });

  const isKanban = viewMode === 'kanban';
  // Le pipeline interroge une colonne par étape : le critère « Étape » devient la liste des colonnes demandées.
  const { stage: _stageParam, ...kanbanCriteria } = search.filterParams;
  const kanban = useDealKanban({
    tenantId,
    enabled: isKanban,
    criteria: kanbanCriteria,
    stages: (search.values.stage as string[] | undefined) ?? []
  });

  // Vue Liste : une page serveur. Le pipeline charge ses colonnes lui-même.
  useEffect(() => {
    if (tenantId && !isKanban) {
      loadDeals();
    }
  }, [tenantId, isKanban, search.apiParams]);

  const loadDeals = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listDeals(tenantId, search.apiParams as DealFilters);
      if (response.success) {
        setDeals(response.deals);
        setPagination(response.pagination);
      } else {
        setError(t('Erreur lors du chargement des affaires'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement des affaires'));
    } finally {
      setLoading(false);
    }
  };

  /** Recharge la vue affichée (après création ou modification). */
  const refresh = async () => {
    if (isKanban) kanban.reloadAll();
    else await loadDeals();
  };

  const resultCount = isKanban ? kanban.total : pagination.total;
  const isLoading = isKanban ? kanban.loading : loading;
  const hasNoDeals = isKanban ? kanban.total === 0 : deals.length === 0;
  const loadError = error ?? (isKanban && kanban.hasError ? t('Erreur lors du chargement des affaires') : null);

  const exportRow = (deal: CrmDeal) => {
    const contact = (deal as CrmDealDetail).contact;
    return {
      Type: dealTypeLabel(deal.type),
      Contact: contact
        ? `${contact.firstName} ${contact.lastName}`
        : t('Contact ID: {{contactId}}', { contactId: deal.contactId }),
      Email: contact?.email || '',
      Téléphone: contact?.phone || '',
      Stade: getStageLabel(deal.stage),
      'Budget min': deal.budgetMin ? deal.budgetMin.toLocaleString() + ' FCFA' : '',
      'Budget max': deal.budgetMax ? deal.budgetMax.toLocaleString() + ' FCFA' : '',
      Localisation: deal.locationZone || '',
      'Date de création': new Date(deal.createdAt).toLocaleDateString(activeLocale())
    };
  };

  /** Exporte TOUTES les affaires qui répondent aux critères affichés, pas seulement la page chargée. */
  const exportDeals = async (format: 'csv' | 'excel') => {
    if (!tenantId) return;
    try {
      const { items } = await collectAllPages<CrmDeal>(async (page, limit) => {
        const response = await listDeals(tenantId, { ...search.filterParams, page, limit } as DealFilters);
        return { items: response.deals ?? [], total: response.pagination?.total ?? 0 };
      });
      const rows = items.map(exportRow);
      if (format === 'csv') exportToCSV(rows, 'affaires');
      else exportToExcel(rows, 'affaires', 'Affaires');
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Erreur lors du chargement des affaires'));
    }
  };

  const handleCreate = async (data: CreateCrmDealRequest | UpdateCrmDealRequest) => {
    if (!tenantId) return;
    try {
      await createDeal(tenantId, data as CreateCrmDealRequest);
      setShowForm(false);
      await refresh();
    } catch (err: any) {
      throw err;
    }
  };

  const handleUpdate = async (data: CreateCrmDealRequest | UpdateCrmDealRequest) => {
    if (!tenantId || !editingDeal) return;
    try {
      await updateDeal(tenantId, editingDeal.id, data as UpdateCrmDealRequest);
      setEditingDeal(null);
      await refresh();
    } catch (err: any) {
      throw err;
    }
  };

  const handleAddActivity = (deal: CrmDeal) => {
    setSelectedDealForActivity(deal);
    setShowActivityForm(true);
  };

  const handleCreateActivity = async (data: CreateCrmActivityRequest) => {
    if (!tenantId) return;
    try {
      await createActivity(tenantId, data);
      setShowActivityForm(false);
      setSelectedDealForActivity(null);
      // Optionally reload deals or show success message
    } catch (err: any) {
      throw err;
    }
  };

  const getStageLabel = (stage: string): string => (stage === 'APPOINTMENT' ? t('Rendez-vous') : dealStageLabel(stage));

  const getStageBadge = (stage: string) => {
    // Echelle CATEGORIELLE (voir PropertySearchResults) : palette brute
    // assumee, les roles du systeme n'exprimant que du semantique. Seul
    // l'orange a bouge, pour ne pas se lire comme l'accent de marque.
    const styles: Record<string, string> = {
      NEW: 'bg-gray-100 text-gray-800',
      QUALIFIED: 'bg-blue-100 text-blue-800',
      APPOINTMENT: 'bg-yellow-100 text-yellow-800',
      VISIT: 'bg-teal-100 text-teal-800',
      NEGOTIATION: 'bg-purple-100 text-purple-800',
      WON: 'bg-green-100 text-green-800',
      LOST: 'bg-red-100 text-red-800'
    };
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          styles[stage] || styles.NEW
        }`}
      >
        {getStageLabel(stage)}
      </span>
    );
  };

  return (
    <>
      <div className="space-y-3 w-full">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t('Affaires')}</h1>
            <p className="text-gray-600 mt-0.5 text-sm">{t('Gérez votre pipeline de ventes')}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => exportDeals('csv')}>
              <Download className="h-3 w-3 me-1" />
              CSV
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => exportDeals('excel')}>
              <FileSpreadsheet className="h-3 w-3 me-1" />
              {'Excel'}
            </Button>
            <Button onClick={() => setShowForm(true)} size="sm" className="h-8 text-xs">
              <Plus className="h-3 w-3 me-1" />
              {t('Nouvelle affaire')}
            </Button>
          </div>
        </div>

        {showForm && (
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-3">{t('Créer une nouvelle affaire')}</h2>
            <DealForm tenantId={tenantId!} onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
          </div>
        )}

        {editingDeal && (
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-3">{t("Modifier l'affaire")}</h2>
            <DealForm
              tenantId={tenantId!}
              deal={editingDeal}
              onSubmit={handleUpdate}
              onCancel={() => setEditingDeal(null)}
            />
          </div>
        )}

        {showActivityForm && selectedDealForActivity && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">{t("Ajouter une activité à l'affaire")}</h2>
            <ActivityForm
              tenantId={tenantId!}
              contactId={selectedDealForActivity.contactId}
              dealId={selectedDealForActivity.id}
              onSubmit={handleCreateActivity}
              onCancel={() => {
                setShowActivityForm(false);
                setSelectedDealForActivity(null);
              }}
            />
          </div>
        )}

        {/* Recherche multicritères (champ libre + critères) et choix de la vue */}
        <ListSearch
          {...search.searchProps}
          resultCount={isLoading ? undefined : resultCount}
          extra={
            <div className="flex gap-1">
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                className="text-xs h-8"
                onClick={() => setViewMode('list')}
              >
                {t('Liste')}
              </Button>
              <Button
                variant={viewMode === 'kanban' ? 'default' : 'outline'}
                size="sm"
                className="text-xs h-8"
                onClick={() => setViewMode('kanban')}
              >
                <LayoutGrid className="h-3 w-3 me-1" />
                {t('Pipeline')}
              </Button>
            </div>
          }
        />

        {/* Deals View */}
        {loadError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{loadError}</div>}

        {isLoading && (!isKanban || hasNoDeals) ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-2 text-gray-600">{t('Chargement des affaires...')}</p>
          </div>
        ) : hasNoDeals && (search.isFiltered || search.page > 1) ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Briefcase className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-4">{t('Aucun résultat')}</h3>
            <Button variant="outline" onClick={search.clear}>
              {t('Effacer les critères')}
            </Button>
          </div>
        ) : hasNoDeals ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Briefcase className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">{t('Aucune affaire trouvée')}</h3>
            <p className="text-gray-600 mb-4">{t('Commencez par créer votre première affaire.')}</p>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 me-2" />
              {t('Créer une affaire')}
            </Button>
          </div>
        ) : isKanban ? (
          <div className="bg-white rounded-lg shadow p-3 w-full overflow-x-auto">
            <DealKanban
              columns={kanban.columns}
              onLoadMore={kanban.loadMore}
              onDealClick={deal => navigate(`/tenant/${tenantId}/crm/deals/${deal.id}`)}
              onStageChange={async (dealId, newStage) => {
                const deal = kanban.findDeal(dealId);
                if (deal && tenantId) {
                  try {
                    await updateDeal(tenantId, dealId, {
                      stage: newStage,
                      version: deal.version
                    });
                    // Les deux colonnes touchées (départ et arrivée) sont rechargées.
                    kanban.reloadStages([deal.stage, newStage]);
                  } catch (err: any) {
                    message.error(
                      err.response?.data?.message || t("Erreur lors de la mise à jour du stade de l'affaire")
                    );
                  }
                }
              }}
              onAddDeal={stage => {
                // Set the stage in the form and show it
                setShowForm(true);
                // You could pre-fill the stage in the form if needed
              }}
            />
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500">{t('Type')}</th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500">{t('Contact')}</th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500">{t('Stade')}</th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500">{t('Budget')}</th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500">{t('Localisation')}</th>
                  <th className="px-6 py-3 text-end text-xs font-medium text-gray-500">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {deals.map(deal => (
                  <tr key={deal.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{dealTypeLabel(deal.type)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {(() => {
                          const dealDetail = deal as CrmDealDetail;
                          return dealDetail.contact
                            ? `${dealDetail.contact.firstName} ${dealDetail.contact.lastName}`
                            : t('Contact ID: {{contactId}}', { contactId: deal.contactId });
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{getStageBadge(deal.stage)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {deal.budgetMin && deal.budgetMax
                          ? t('{{value}} - {{value2}}', {
                              value: formatNumber(deal.budgetMin),
                              value2: formatFcfa(deal.budgetMax)
                            })
                          : deal.budgetMax
                            ? t("Jusqu'à {{value}}", { value: formatFcfa(deal.budgetMax) })
                            : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{deal.locationZone || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-end text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAddActivity(deal)}
                          title={t('Ajouter une activité')}
                        >
                          <Activity className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAddActivity(deal)}
                          title={t('Ajouter un rendez-vous')}
                        >
                          <Calendar className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/tenant/${tenantId}/crm/deals/${deal.id}`)}
                          title={t('Voir les détails')}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingDeal(deal)} title={t('Modifier')}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="bg-gray-50 px-6 py-3 flex items-center justify-between border-t border-gray-200">
                <div className="text-sm text-gray-700">
                  {t('Affichage de')} {(pagination.page - 1) * pagination.limit + 1} à{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} sur {pagination.total} affaires
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => search.setPage(pagination.page - 1)}
                    disabled={pagination.page === 1}
                  >
                    {t('Précédent')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => search.setPage(pagination.page + 1)}
                    disabled={pagination.page === pagination.totalPages}
                  >
                    {t('Suivant')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};
