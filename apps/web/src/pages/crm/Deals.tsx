import React, { useState, useEffect, useRef } from 'react';
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
import { Plus, Edit, Eye, LayoutGrid, Activity, Calendar } from 'lucide-react';
import { PageHeader, StateBlock, SkeletonList, DataCard } from '../../components/primitives';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { contactDisplayName } from '../../utils/contact-display';
import { DealKanban } from '../../components/crm/DealKanban';
import { KANBAN_STAGES, useDealKanban } from '../../components/crm/use-deal-kanban';
import { ListSearch } from '../../components/primitives/ListSearch';
import { useListSearch } from '../../hooks/useListSearch';
import { listAssignableMembers } from '../../services/membership-service';
import { collectAllPages } from '../../utils/table-export/collect';
import { exportToCSV, exportToExcel } from '../../utils/export-utils';
import { App } from 'antd';
import { t } from '../../i18n/t';
import { dealStageLabel, dealTypeLabel } from '../../utils/crm-labels';
import { formatFcfa } from '../../utils/crm-utils';
import { HelpButton, helpAnchor } from '../../help';

import { activeLocale, formatNumber } from '../../i18n/format';

const VIEW_MODE_KEY = 'immotopia.crm.deals.viewMode';

/** Dernière vue choisie (Pipeline par défaut) : un rechargement ne ramène pas à l'écran de départ. */
const readViewMode = (): 'list' | 'kanban' => {
  try {
    return window.localStorage.getItem(VIEW_MODE_KEY) === 'list' ? 'list' : 'kanban';
  } catch {
    return 'kanban';
  }
};

export const Deals: React.FC = () => {
  const { message } = App.useApp();
  const { isDesktop } = useBreakpoint();
  const formRef = useRef<HTMLDivElement>(null);
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
  const [viewMode, setViewModeState] = useState<'list' | 'kanban'>(readViewMode);
  const setViewMode = (mode: 'list' | 'kanban') => {
    setViewModeState(mode);
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // Stockage indisponible (navigation privée) : la vue reste valable pour la session.
    }
  };
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

  // Un formulaire s'ouvre en haut de page : on l'amène à l'écran, sinon rien ne semble se passer.
  useEffect(() => {
    formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [showForm, editingDeal, showActivityForm]);

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
      setError(t('Impossible de charger les affaires. Vérifiez votre connexion puis réessayez.'));
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
        const response = await listDeals(tenantId, {
          ...search.filterParams,
          ...(isKanban && !search.filterParams.stage ? { stage: KANBAN_STAGES.join(',') } : {}),
          page,
          limit
        } as DealFilters);
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

  const dealContactName = (deal: CrmDeal): string => {
    const contact = (deal as CrmDealDetail).contact;
    return contact ? contactDisplayName(contact) : t('Contact ID: {{contactId}}', { contactId: deal.contactId });
  };

  const mobileCards = (
    <div role="list" aria-label={t('Affaires')} style={{ padding: 'var(--space-3)' }}>
      {deals.map(deal => {
        const dealDetail = deal as CrmDealDetail;
        const nom = dealDetail.contact
          ? contactDisplayName(dealDetail.contact)
          : t('Contact ID: {{contactId}}', { contactId: deal.contactId });
        return (
          <div role="listitem" key={deal.id}>
            <DataCard
              title={nom}
              subtitle={dealTypeLabel(deal.type)}
              status={getStageBadge(deal.stage)}
              highlight={deal.budgetMax ? formatFcfa(deal.budgetMax) : undefined}
              fields={deal.locationZone ? [{ label: t('Localisation'), value: deal.locationZone }] : []}
              onOpen={() => navigate(`/tenant/${tenantId}/crm/deals/${deal.id}`)}
              secondaryActions={[
                { key: 'activity', label: t('Ajouter une activité'), onClick: () => handleAddActivity(deal) },
                { key: 'edit', label: t('Modifier'), onClick: () => setEditingDeal(deal) }
              ]}
            />
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="space-y-3 w-full">
        <PageHeader
          title={t('Affaires')}
          subtitle={t('Gérez votre pipeline de ventes')}
          primaryAction={{
            label: t('Nouvelle affaire'),
            icon: <Plus className="h-4 w-4" />,
            onClick: () => setShowForm(true),
            helpAnchor: 'affaires-nouvelle'
          }}
          secondaryActions={[
            { key: 'csv', label: t('Exporter en CSV'), onClick: () => void exportDeals('csv') },
            { key: 'excel', label: t('Exporter en Excel'), onClick: () => void exportDeals('excel') }
          ]}
        />

        {showForm && (
          <div ref={formRef} className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-3">{t('Créer une nouvelle affaire')}</h2>
            <DealForm tenantId={tenantId!} onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
          </div>
        )}

        {editingDeal && (
          <div ref={formRef} className="bg-white rounded-lg shadow p-4">
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
          <div ref={formRef} className="bg-white rounded-lg shadow p-6">
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
        <div {...helpAnchor('affaires-recherche')}>
          <ListSearch
            {...search.searchProps}
            resultCount={isLoading ? undefined : resultCount}
            extra={
              <div className="flex items-center gap-1" {...helpAnchor('affaires-vues')}>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  aria-pressed={viewMode === 'list'}
                  size="sm"
                  className="text-xs h-8 max-lg:h-11"
                  onClick={() => setViewMode('list')}
                >
                  {t('Liste')}
                </Button>
                <Button
                  variant={viewMode === 'kanban' ? 'default' : 'outline'}
                  aria-pressed={viewMode === 'kanban'}
                  size="sm"
                  className="text-xs h-8 max-lg:h-11"
                  onClick={() => setViewMode('kanban')}
                >
                  <LayoutGrid className="h-3 w-3 me-1" />
                  {t('Pipeline')}
                </Button>
                <HelpButton helpId="commercial.affaires.liste.recherche" size="small" />
              </div>
            }
          />
        </div>

        {/* Deals View */}
        {loadError && !hasNoDeals && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded flex flex-wrap items-center justify-between gap-2"
          >
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              {t('Réessayer')}
            </Button>
          </div>
        )}

        {isLoading && (!isKanban || hasNoDeals) ? (
          <SkeletonList rows={5} aria-label={t('Chargement des affaires...')} />
        ) : loadError && hasNoDeals ? (
          <StateBlock variant="error" description={loadError} onRetry={() => void refresh()} />
        ) : hasNoDeals && (search.isFiltered || search.page > 1) ? (
          <StateBlock
            variant="no-results"
            actions={[{ label: t('Effacer les critères'), onClick: search.clear, primary: true }]}
          />
        ) : hasNoDeals ? (
          <StateBlock
            variant="empty"
            title={t('Aucune affaire trouvée')}
            description={t('Commencez par créer votre première affaire.')}
            actions={[{ label: t('Créer une affaire'), onClick: () => setShowForm(true), primary: true }]}
          />
        ) : isKanban ? (
          <div className="bg-white rounded-lg shadow p-3 w-full overflow-x-auto" {...helpAnchor('affaires-pipeline')}>
            <div className="flex justify-end">
              <HelpButton helpId="commercial.affaires.liste.kanban" size="small" />
            </div>
            <DealKanban
              stages={kanban.stages}
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
                    message.success(t('Affaire déplacée vers « {{etape}} »', { etape: getStageLabel(newStage) }));
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
          <div className="bg-white rounded-lg shadow overflow-hidden" {...helpAnchor('affaires-tableau')}>
            <div className="flex justify-end px-3 pt-2">
              <HelpButton helpId="commercial.affaires.liste.tableau" size="small" />
            </div>
            {!isDesktop ? (
              mobileCards
            ) : (
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
                            aria-label={t('Ajouter une activité')}
                          >
                            <Activity className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAddActivity(deal)}
                            title={t('Ajouter un rendez-vous')}
                            aria-label={t('Ajouter un rendez-vous')}
                          >
                            <Calendar className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/tenant/${tenantId}/crm/deals/${deal.id}`)}
                            title={t('Voir les détails')}
                            aria-label={t("Voir l'affaire de {{nom}}", { nom: dealContactName(deal) })}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingDeal(deal)}
                            title={t('Modifier')}
                            aria-label={t("Modifier l'affaire de {{nom}}", { nom: dealContactName(deal) })}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <nav
                aria-label={t('Pagination')}
                className="bg-gray-50 px-6 py-3 flex flex-wrap gap-2 items-center justify-between border-t border-gray-200"
              >
                <div className="text-sm text-gray-700">
                  {t('Affichage de {{debut}} à {{fin}} sur {{total}} affaires', {
                    debut: formatNumber((pagination.page - 1) * pagination.limit + 1),
                    fin: formatNumber(Math.min(pagination.page * pagination.limit, pagination.total)),
                    total: formatNumber(pagination.total)
                  })}
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
              </nav>
            )}
          </div>
        )}
      </div>
    </>
  );
};
