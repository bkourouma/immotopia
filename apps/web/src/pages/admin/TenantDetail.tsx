import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  getTenant,
  getTenantStats,
  Tenant,
  TenantStats,
  suspendTenant,
  activateTenant
} from '../../services/tenant-service';
import type { TenantWithBranding } from '../../services/tenant-branding-service';
import { SubscriptionTab } from '../../components/admin/tenant-detail/SubscriptionTab';
import { InvoicesTab } from '../../components/admin/tenant-detail/InvoicesTab';
import { ActivityTab } from '../../components/admin/tenant-detail/ActivityTab';
import { DataExportTab } from '../../components/admin/tenant-detail/DataExportTab';
import { CollaboratorsTab } from '../../components/admin/tenant-detail/CollaboratorsTab';
import {
  Building2,
  ArrowLeft,
  Edit,
  CreditCard,
  Receipt,
  Activity,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Users,
  DatabaseBackup
} from 'lucide-react';
import { App } from 'antd';
import { StatusTag, useConfirmAction } from '../../components/primitives';
import { getModuleKeyLabelFr } from '../../constants/module-labels';
import { t } from '../../i18n/t';
import { HelpButton } from '../../help';

import { activeLocale } from '../../i18n/format';

function formatDateTime(value: string | null | undefined): string {
  if (!value) return t('Jamais');
  return new Date(value).toLocaleDateString(activeLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
const TENANT_DETAIL_TABS = [
  'overview',
  'collaborators',
  'subscription',
  'invoices',
  'activity',
  'stats',
  'data-export'
] as const;
type TenantDetailTab = (typeof TENANT_DETAIL_TABS)[number];
const isTenantDetailTab = (value: string | null): value is TenantDetailTab =>
  value !== null && (TENANT_DETAIL_TABS as readonly string[]).includes(value);

export const TenantDetail: React.FC = () => {
  const { message } = App.useApp();
  const confirmAction = useConfirmAction();
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [stats, setStats] = useState<TenantStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // L'ancien onglet « Modules » est absorbé par « Abonnement » (vague 2,
  // lot C, docs/architecture/PLAN-ABONNEMENTS.md §2) : les modules ouverts
  // sont désormais déduits des packs et affichés en lecture seule dans
  // <SubscriptionTab>.
  // L'onglet actif vit dans l'URL (`?onglet=`) : lien partageable, retour arrière
  // et rechargement le retrouvent. Chaque onglet n'est monté (et ses requêtes
  // lancées) que lorsqu'il est affiché.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('onglet');
  const activeTab: TenantDetailTab = isTenantDetailTab(requestedTab) ? requestedTab : 'overview';
  const setActiveTab = (next: TenantDetailTab) => {
    // Les critères d'un onglet n'ont pas de sens dans un autre : on repart de l'onglet seul.
    setSearchParams(next === 'overview' ? {} : { onglet: next }, { replace: true });
  };

  useEffect(() => {
    if (tenantId) {
      loadTenant();
    }
  }, [tenantId]);

  const loadTenant = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [tenantResponse, statsResponse] = await Promise.all([
        getTenant(tenantId),
        getTenantStats(tenantId).catch(() => null)
      ]);
      if (tenantResponse.success) {
        setTenant(tenantResponse.data);
        if (statsResponse?.success) {
          setStats(statsResponse.data);
        }
      } else {
        setError(t('Erreur lors du chargement du tenant'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement du tenant'));
    } finally {
      setLoading(false);
    }
  };

  const handleSuspend = () => {
    if (!tenantId) return;
    confirmAction({
      title: t("Suspendre l'agence « {{value}} » ?", { value: tenant?.name ?? tenantId }),
      description: t("Ses collaborateurs perdent l'accès jusqu'à réactivation."),
      okText: t('Suspendre'),
      danger: true,
      onConfirm: async () => {
        try {
          await suspendTenant(tenantId);
          await loadTenant();
          message.success(t('Agence suspendue'));
        } catch (err: any) {
          message.error(err.response?.data?.message || t('Erreur lors de la suspension'));
        }
      }
    });
  };
  const handleActivate = () => {
    if (!tenantId) return;
    confirmAction({
      title: t("Activer l'agence « {{value}} » ?", { value: tenant?.name ?? tenantId }),
      okText: t('Activer'),
      onConfirm: async () => {
        try {
          await activateTenant(tenantId);
          await loadTenant();
          message.success(t('Agence activée'));
        } catch (err: any) {
          message.error(err.response?.data?.message || t("Erreur lors de l'activation"));
        }
      }
    });
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      ACTIVE: 'bg-green-100 text-green-800',
      SUSPENDED: 'bg-red-100 text-red-800',
      INACTIVE: 'bg-gray-100 text-gray-800'
    };
    return (
      <span
        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
          styles[status as keyof typeof styles] || styles.INACTIVE
        }`}
      >
        {status === 'ACTIVE' ? t('Actif') : status === 'SUSPENDED' ? t('Suspendu') : t('Inactif')}
      </span>
    );
  };

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </>
    );
  }

  if (error || !tenant) {
    return (
      <>
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-800">{error || t('Tenant introuvable')}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/admin/tenants')} className="text-gray-600 hover:text-gray-900">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{tenant.name}</h1>
              <p className="mt-2 text-sm text-slate-600">{tenant.legalName || tenant.slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge(tenant.status)}
            {tenant.status === 'ACTIVE' ? (
              <button
                onClick={handleSuspend}
                className="inline-flex items-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50"
              >
                <AlertTriangle className="h-4 w-4 me-2" />
                {t('Suspendre')}
              </button>
            ) : (
              <button
                onClick={handleActivate}
                className="inline-flex items-center px-4 py-2 border border-green-300 rounded-md shadow-sm text-sm font-medium text-green-700 bg-white hover:bg-green-50"
              >
                <CheckCircle className="h-4 w-4 me-2" />
                {t('Activer')}
              </button>
            )}
            <button
              onClick={() => navigate(`/admin/tenants/${tenantId}/edit`)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-hover"
            >
              <Edit className="h-4 w-4 me-2" />
              {t('Modifier')}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex gap-8 overflow-x-auto" aria-label={t("Sections de l'agence")}>
            {[
              { id: 'overview', label: t("Vue d'ensemble"), icon: Building2 },
              { id: 'collaborators', label: t('Collaborateurs'), icon: Users },
              { id: 'subscription', label: t('Abonnement'), icon: CreditCard },
              { id: 'invoices', label: t('Factures'), icon: Receipt },
              { id: 'activity', label: t('Activité'), icon: Activity },
              { id: 'stats', label: t('Statistiques'), icon: BarChart3 },
              { id: 'data-export', label: t('Export des données'), icon: DatabaseBackup }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TenantDetailTab)}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="h-5 w-5" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg shadow p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="flex justify-end">
                <HelpButton helpId="administration.plateforme-agences.detail.apercu" />
              </div>
              <div className="flex items-center gap-4">
                {(tenant as TenantWithBranding).logoUrl ? (
                  <img
                    src={(tenant as TenantWithBranding).logoUrl ?? undefined}
                    alt={t("Logo de l'agence")}
                    style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 'var(--radius-sm)' }}
                  />
                ) : (
                  <div className="h-16 w-16 rounded bg-gray-100 flex items-center justify-center">
                    <Building2 className="h-8 w-8 text-gray-400" />
                  </div>
                )}
                {tenant.brandingPrimaryColor && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">{t('Couleur de marque')}</label>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        style={{
                          display: 'inline-block',
                          width: 20,
                          height: 20,
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: tenant.brandingPrimaryColor,
                          border: '1px solid var(--border-default)'
                        }}
                      />
                      <span className="text-sm text-gray-900">{tenant.brandingPrimaryColor}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('Nom')}</label>
                  <p className="mt-1 text-sm text-gray-900">{tenant.name}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('Nom légal')}</label>
                  <p className="mt-1 text-sm text-gray-900">{tenant.legalName || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('Email')}</label>
                  <p className="mt-1 text-sm text-gray-900">{tenant.contactEmail || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('Téléphone')}</label>
                  <p className="mt-1 text-sm text-gray-900">{tenant.contactPhone || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('Ville')}</label>
                  <p className="mt-1 text-sm text-gray-900">{tenant.city || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('Pays')}</label>
                  <p className="mt-1 text-sm text-gray-900">{tenant.country || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('Site web')}</label>
                  <p className="mt-1 text-sm text-gray-900">{tenant.website || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('Statut')}</label>
                  <p className="mt-1 text-sm text-gray-900">{getStatusBadge(tenant.status)}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'collaborators' && (
            <div>
              <CollaboratorsTab tenantId={tenantId!} />
            </div>
          )}

          {activeTab === 'subscription' && (
            <div>
              <SubscriptionTab tenantId={tenantId!} tenantName={tenant.name} />
            </div>
          )}

          {activeTab === 'invoices' && (
            <div>
              <InvoicesTab tenantId={tenantId!} />
            </div>
          )}

          {activeTab === 'activity' && (
            <div>
              <ActivityTab tenantId={tenantId!} />
            </div>
          )}

          {activeTab === 'data-export' && (
            <div>
              <DataExportTab tenantId={tenantId!} />
            </div>
          )}

          {activeTab === 'stats' && stats && (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="flex justify-end md:col-span-2">
                <HelpButton helpId="administration.plateforme-agences.detail.statistiques" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('Collaborateurs actifs')}</label>
                <p className="mt-1 text-2xl font-bold text-gray-900">{stats.activeCollaborators}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('Collaborateurs désactivés')}</label>
                <p className="mt-1 text-2xl font-bold text-gray-900">{stats.disabledCollaborators}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('Modules actifs')}</label>
                <p className="mt-1 text-sm text-gray-900">
                  {stats.enabledModules.length > 0
                    ? stats.enabledModules.map(key => getModuleKeyLabelFr(key)).join(', ')
                    : '—'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('Abonnement')}</label>
                <p className="mt-1 text-sm text-gray-900">
                  {stats.subscription ? <StatusTag status={stats.subscription.status} /> : t('Aucun abonnement')}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('Dernière connexion')}</label>
                <p className="mt-1 text-sm text-gray-900">{formatDateTime(stats.lastLoginAt)}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
