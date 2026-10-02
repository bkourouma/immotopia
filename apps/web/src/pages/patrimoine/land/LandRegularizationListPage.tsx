import React, { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Progress, Select, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../hooks/useAuth';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { DataCard, DataView, FilterSheet, PageHeader, StateBlock } from '../../../components/primitives';
import { t } from '../../../i18n/t';
import { isForbiddenError } from '../../../components/patrimoine/patrimoine-labels';
import { PatrimoineForbidden } from '../../../components/patrimoine/PatrimoineForbidden';
import { LandCreateModal } from './LandCreateModal';
import { listLandRegularizations } from './land-regularization-service';
import {
  formatLandDate,
  formatXof,
  regularizationStatusColor,
  regularizationStatusLabel,
  parseRegularizationStatus,
  regularizationStatusOptions
} from './land-labels';
import type { LandRegularizationSummary } from './land-types';

/**
 * Dossiers de régularisation foncière (spec 033, lot B2).
 *
 * Le statut et le bien (`?propertyId=`) vivent dans l'URL : la liste des
 * dossiers d'un terrain se partage par lien. Le filtrage se fait côté serveur.
 */
export const LandRegularizationListPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const agence = tenantId || tenantMembership?.tenantId;
  const [searchParams, setSearchParams] = useSearchParams();
  const [creating, setCreating] = useState(false);

  const status = parseRegularizationStatus(searchParams.get('status'));
  const propertyId = searchParams.get('propertyId') || undefined;

  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: queryKey('land-regularizations', agence, { status, propertyId }),
    queryFn: () => listLandRegularizations(agence as string, { status, propertyId }),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.list
  });

  if (!agence) return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  // Sans droit sur les biens : un refus clair, sans titre ni bouton d'écriture.
  if (isForbiddenError(error)) return <PatrimoineForbidden />;

  const dossiers = data ?? [];
  const isFiltered = Boolean(status || propertyId);

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };
  const clearFilters = () => setSearchParams(new URLSearchParams(), { replace: true });

  const lien = (dossier: LandRegularizationSummary) => `/tenant/${agence}/patrimoine/land/${dossier.id}`;

  const colonnes: ColumnsType<LandRegularizationSummary> = [
    {
      title: t('Bien'),
      key: 'bien',
      render: (_, dossier) => (
        <>
          <Link to={lien(dossier)} style={{ fontWeight: 600 }}>
            {dossier.property.title}
          </Link>
          {dossier.property.internalReference && (
            <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              {dossier.property.internalReference}
            </div>
          )}
        </>
      )
    },
    {
      title: t('Filière'),
      key: 'filiere',
      render: (_, dossier) => <TrackCell dossier={dossier} />
    },
    {
      title: t('Avancement'),
      key: 'avancement',
      render: (_, dossier) => <ProgressCell dossier={dossier} />
    },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, dossier) => (
        <Tag color={regularizationStatusColor(dossier.status)}>{regularizationStatusLabel(dossier.status)}</Tag>
      )
    },
    {
      title: t('Frais engagés'),
      key: 'frais',
      align: 'end',
      render: (_, dossier) => formatXof(dossier.feesXof)
    },
    {
      title: t('Prochaine échéance'),
      key: 'echeance',
      render: (_, dossier) => formatLandDate(dossier.nextDueDate)
    },
    {
      title: t('Étapes en retard'),
      key: 'retard',
      align: 'end',
      render: (_, dossier) =>
        dossier.overdueSteps > 0 ? <Tag color="error">{dossier.overdueSteps}</Tag> : <span>0</span>
    }
  ];

  return (
    <>
      <PageHeader
        title={t('Régularisation foncière')}
        subtitle={t("Suivi des démarches de régularisation foncière, de l'attestation villageoise au titre foncier.")}
        breadcrumbs={[
          { label: t('Patrimoine'), to: `/tenant/${agence}/patrimoine` },
          { label: t('Régularisation foncière') }
        ]}
        primaryAction={{
          label: t('Nouveau dossier'),
          icon: <PlusOutlined />,
          onClick: () => setCreating(true)
        }}
      />

      {propertyId && (
        <div style={{ marginBottom: 12 }}>
          <Tag color="blue">
            {dossiers[0]?.property.internalReference
              ? t('Bien : {{reference}}', { reference: dossiers[0].property.internalReference })
              : t('Filtré sur un bien')}
          </Tag>
          <Button type="link" size="small" onClick={() => setParam('propertyId')}>
            {t('Effacer ce filtre')}
          </Button>
        </div>
      )}

      <FilterSheet activeCount={isFiltered ? 1 : 0} onClear={clearFilters} title={t('Filtrer les dossiers')}>
        <div style={{ minWidth: 220 }}>
          <label htmlFor="filtre-statut-foncier">{t('Statut')}</label>
          <Select
            id="filtre-statut-foncier"
            style={{ width: '100%' }}
            placeholder={t('Tous les statuts')}
            allowClear
            value={status}
            onChange={valeur => setParam('status', valeur)}
            options={regularizationStatusOptions()}
          />
        </div>
      </FilterSheet>

      <DataView<LandRegularizationSummary>
        items={dossiers}
        total={dossiers.length}
        page={1}
        pageSize={Math.max(dossiers.length, 1)}
        paginated={false}
        onPageChange={() => undefined}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={error ? t('Impossible de charger les dossiers de régularisation.') : null}
        onRetry={() => refetch()}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
        emptyAction={{ label: t('Nouveau dossier'), onClick: () => setCreating(true) }}
        emptyDescription={t("Aucun dossier de régularisation foncière n'est ouvert pour cette agence.")}
        columns={colonnes}
        rowKey={dossier => dossier.id}
        aria-label={t('Dossiers de régularisation foncière')}
        renderCard={dossier => (
          <DataCard
            title={dossier.property.title}
            subtitle={dossier.trackLabel}
            status={
              <>
                <Tag color={regularizationStatusColor(dossier.status)}>{regularizationStatusLabel(dossier.status)}</Tag>
                {dossier.validationStatus === 'A_VALIDER' && (
                  <Tooltip title={t('À valider par un juriste local')}>
                    <Tag color="warning">{t('À valider')}</Tag>
                  </Tooltip>
                )}
              </>
            }
            fields={[
              { label: t('Avancement'), value: <ProgressCell dossier={dossier} /> },
              { label: t('Frais engagés'), value: formatXof(dossier.feesXof) },
              { label: t('Prochaine échéance'), value: formatLandDate(dossier.nextDueDate) },
              { label: t('Étapes en retard'), value: String(dossier.overdueSteps) }
            ]}
            onOpen={() => navigate(lien(dossier))}
          />
        )}
      />

      <LandCreateModal
        open={creating}
        tenantId={agence}
        defaultPropertyId={propertyId}
        onClose={() => setCreating(false)}
        onCreated={detail => {
          setCreating(false);
          navigate(`/tenant/${agence}/patrimoine/land/${detail.id}`);
        }}
      />
    </>
  );
};

/**
 * Filière du dossier. Une filière « à valider » (CI_ACD) ne se présente jamais
 * comme certaine (FR-009, FR-033) : l'étiquette suit le nom partout.
 */
const TrackCell: React.FC<{ dossier: LandRegularizationSummary }> = ({ dossier }) => (
  <span>
    {dossier.trackLabel}
    {dossier.validationStatus === 'A_VALIDER' && (
      <Tooltip title={t('À valider par un juriste local')}>
        <Tag color="warning" style={{ marginInlineStart: 8 }}>
          {t('À valider')}
        </Tag>
      </Tooltip>
    )}
  </span>
);

const ProgressCell: React.FC<{ dossier: LandRegularizationSummary }> = ({ dossier }) => (
  <div style={{ minWidth: 140 }}>
    <Progress
      percent={dossier.progress.percent}
      size="small"
      aria-label={t('Avancement du dossier')}
      status={dossier.status === 'TERMINEE' ? 'success' : undefined}
    />
    <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
      {t('{{done}} étape(s) sur {{total}}', { done: dossier.progress.completed, total: dossier.progress.total })}
    </div>
  </div>
);
