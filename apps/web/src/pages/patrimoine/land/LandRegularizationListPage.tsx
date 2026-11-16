import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Progress, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../hooks/useAuth';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { DataCard, DataView, PageHeader, StateBlock } from '../../../components/primitives';
import { normalizeText, useLocalListSearch } from '../../../utils/list-search';
import { getProperty } from '../../../services/property-service';
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
  regularizationStatusOptions
} from './land-labels';
import type { LandRegularizationSummary } from './land-types';

// Stables : déclarés HORS du composant (le filtrage local reste mémoïsé).
const TEXTE_RECHERCHE = [
  (d: LandRegularizationSummary) => d.property.title,
  (d: LandRegularizationSummary) => d.property.internalReference,
  (d: LandRegularizationSummary) => d.trackLabel,
  (d: LandRegularizationSummary) => d.currentStepLabel,
  (d: LandRegularizationSummary) => regularizationStatusLabel(d.status)
];
const ACCESSEURS = {
  status: (d: LandRegularizationSummary) => d.status,
  propertyId: (d: LandRegularizationSummary) => d.propertyId
};
const NO_DOSSIERS: LandRegularizationSummary[] = [];

const libelleBien = (bien: { internalReference: string | null; title: string }) =>
  bien.internalReference ? `${bien.internalReference} · ${bien.title}` : bien.title;

/**
 * Dossiers de régularisation foncière (spec 033, lot B2).
 *
 * L'API ne pagine pas : la liste arrive en entier et la recherche (texte,
 * statut, bien) la filtre ici. Les critères vivent dans l'URL (`?status=`,
 * `?propertyId=`) : la liste des dossiers d'un terrain se partage par lien.
 */
export const LandRegularizationListPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const agence = tenantId || tenantMembership?.tenantId;
  const [creating, setCreating] = useState(false);

  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: queryKey('land-regularizations', agence),
    queryFn: () => listLandRegularizations(agence as string),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.list
  });

  const dossiers = useMemo(() => data ?? NO_DOSSIERS, [data]);
  // Les biens qui ont un dossier : les seuls utiles à un filtre local.
  const biens = useMemo(() => {
    const parId = new Map<string, { value: string; label: string }>();
    for (const dossier of dossiers) {
      if (!parId.has(dossier.propertyId)) {
        parId.set(dossier.propertyId, { value: dossier.propertyId, label: libelleBien(dossier.property) });
      }
    }
    return [...parId.values()];
  }, [dossiers]);

  const local = useLocalListSearch<LandRegularizationSummary>(dossiers, {
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Bien, référence, filière, étape…')
      },
      {
        key: 'status',
        type: 'multiSelect',
        label: t('Statut'),
        primary: true,
        options: regularizationStatusOptions()
      },
      {
        key: 'propertyId',
        type: 'select',
        label: t('Bien'),
        primary: true,
        loadOptions: async terme => {
          const mots = normalizeText(terme).split(' ').filter(Boolean);
          return biens.filter(bien => mots.every(mot => normalizeText(bien.label).includes(mot))).slice(0, 20);
        },
        // Un lien `?propertyId=` peut viser un bien sans dossier : on le retrouve alors à la source.
        resolveLabel: async id => {
          const connu = biens.find(bien => bien.value === id);
          if (connu) return connu.label;
          try {
            return libelleBien(await getProperty(agence as string, id));
          } catch {
            return undefined;
          }
        }
      }
    ],
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });
  const propertyId = local.values.propertyId as string | undefined;

  if (!agence) return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  // Sans droit sur les biens : un refus clair, sans titre ni bouton d'écriture.
  if (isForbiddenError(error)) return <PatrimoineForbidden />;

  const lien = (dossier: LandRegularizationSummary) => `/tenant/${agence}/patrimoine/land/${dossier.id}`;

  const colonnes: ColumnsType<LandRegularizationSummary> = [
    {
      title: t('Bien'),
      key: 'bien',
      exportValue: dossier =>
        dossier.property.internalReference
          ? `${dossier.property.title} — ${dossier.property.internalReference}`
          : dossier.property.title,
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
      exportValue: dossier => dossier.progress.percent,
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
      exportValue: dossier => dossier.feesXof,
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
      exportValue: dossier => dossier.overdueSteps,
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

      <DataView<LandRegularizationSummary>
        helpId="patrimoine.terrains.liste"
        // L'API ne pagine pas : toute la liste est déjà chargée, la recherche la filtre ici.
        {...local.dataViewProps}
        export={{ filename: t('Dossiers de régularisation foncière'), fetchAll: local.exportAll }}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={error ? t('Impossible de charger les dossiers de régularisation.') : null}
        errorCause={error}
        onRetry={() => refetch()}
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
