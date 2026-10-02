import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Select } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { listInsuranceClaims, listInsurancePolicies } from '../../services/insurance-service';
import type { InsuranceClaimDto, InsuranceClaimStatus } from '../../types/insurance-types';
import { CLAIM_STATUS_VALUES, claimStatusLabel, options } from '../../components/insurance/insurance-labels';
import { useAuth } from '../../hooks/useAuth';
import { useListParams } from '../../hooks/useListParams';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, DataView, FilterSheet } from '../../components/primitives';
import { t } from '../../i18n/t';
import { isForbiddenError } from '../../components/patrimoine/patrimoine-labels';
import { PatrimoineForbidden } from '../../components/patrimoine/PatrimoineForbidden';
import { ClaimCard, claimColumns } from './claims-columns';

/**
 * Sinistres de l'agence : vue d'ensemble en lecture seule. Les changements de
 * statut se font dans l'onglet « Assurances et sinistres » de la fiche du bien.
 * Le statut, le bien et la police (spec 032 US4.2) vivent dans l'URL ; le filtrage est fait par l'API, qui plafonne la
 * liste (`CLAIMS_LIMIT`) : au plafond, la page le dit au lieu d'annoncer un
 * total exhaustif.
 */

type Filtres = { status: string; propertyId: string; policyId: string };
const FILTER_KEYS = ['status', 'propertyId', 'policyId'] as const;
/** Maximum accepté par l'API pour une liste de sinistres. */
const CLAIMS_LIMIT = 500;

function sousTitre(total: number, tronque: boolean): string {
  if (total <= 0) return t('Déclarations et suivi des sinistres');
  if (tronque) return t('{{total}} sinistres affichés (liste limitée)', { total });
  return total > 1 ? t('{{total}} sinistres', { total }) : t('{{total}} sinistre', { total });
}

export const InsuranceClaimsPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenantMembership } = useAuth();
  const agence = tenantId || tenantMembership?.tenantId;

  const list = useListParams<Filtres>({ filterKeys: FILTER_KEYS, defaultPageSize: 25 });
  const status = (list.filters.status || undefined) as InsuranceClaimStatus | undefined;
  const propertyId = list.filters.propertyId || undefined;
  const policyId = list.filters.policyId || undefined;

  const {
    data,
    isPending,
    isFetching,
    error: erreur,
    refetch
  } = useQuery({
    queryKey: queryKey('insurance-claims', agence, { status, propertyId, policyId, limit: CLAIMS_LIMIT }),
    queryFn: () => listInsuranceClaims(agence as string, { status, propertyId, policyId, limit: CLAIMS_LIMIT }),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.list
  });

  // Les polices de l'agence alimentent les deux filtres : un sinistre dépend
  // toujours d'une police, donc tout bien à filtrer en porte au moins une.
  const { data: polices } = useQuery({
    queryKey: queryKey('insurance-policies', agence, {}),
    queryFn: () => listInsurancePolicies(agence as string),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.list
  });
  const optionsBien = useMemo(() => {
    const parId = new Map<string, string>();
    for (const police of polices ?? []) {
      if (police.propertyId && !parId.has(police.propertyId)) {
        parId.set(police.propertyId, police.propertyReference || police.propertyId);
      }
    }
    return Array.from(parId, ([value, label]) => ({ value, label }));
  }, [polices]);
  const optionsPolice = useMemo(
    () =>
      (polices ?? [])
        .filter(police => !propertyId || police.propertyId === propertyId)
        .map(police => ({
          value: police.id,
          label: t('{{assureur}} · n° {{numero}}', { assureur: police.insurer, numero: police.policyNumber })
        })),
    [polices, propertyId]
  );

  if (!agence) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  if (isForbiddenError(erreur)) return <PatrimoineForbidden />;

  const tous = data ?? [];
  const tronque = tous.length >= CLAIMS_LIMIT;
  const debut = (list.page - 1) * list.pageSize;
  const sinistres = tous.slice(debut, debut + list.pageSize);

  return (
    <>
      <PageHeader title={t('Sinistres')} subtitle={sousTitre(tous.length, tronque)} />

      {tronque && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBlockEnd: 16 }}
          message={t(
            'La liste est limitée aux {{limit}} sinistres les plus récents : d’autres existent. Affinez avec le filtre de statut.',
            { limit: CLAIMS_LIMIT }
          )}
        />
      )}

      <FilterSheet
        activeCount={[status, propertyId, policyId].filter(Boolean).length}
        onClear={list.clearFilters}
        title={t('Filtrer les sinistres')}
      >
        <div style={{ minWidth: 220 }}>
          <label htmlFor="filtre-statut-sinistre">{t('Statut')}</label>
          <Select
            id="filtre-statut-sinistre"
            style={{ width: '100%' }}
            placeholder={t('Tous les statuts')}
            allowClear
            value={status}
            onChange={valeur => list.setFilters({ status: valeur })}
            options={options(CLAIM_STATUS_VALUES, claimStatusLabel)}
          />
        </div>
        <div style={{ minWidth: 220 }}>
          <label htmlFor="filtre-bien-sinistre">{t('Bien')}</label>
          <Select
            id="filtre-bien-sinistre"
            style={{ width: '100%' }}
            placeholder={t('Tous les biens')}
            allowClear
            showSearch
            optionFilterProp="label"
            value={propertyId}
            // Changer de bien invalide la police choisie : elle peut en dépendre.
            onChange={valeur => list.setFilters({ propertyId: valeur, policyId: undefined })}
            options={optionsBien}
          />
        </div>
        <div style={{ minWidth: 220 }}>
          <label htmlFor="filtre-police-sinistre">{t('Police')}</label>
          <Select
            id="filtre-police-sinistre"
            style={{ width: '100%' }}
            placeholder={t('Toutes les polices')}
            allowClear
            showSearch
            optionFilterProp="label"
            value={policyId}
            onChange={valeur => list.setFilters({ policyId: valeur })}
            options={optionsPolice}
          />
        </div>
      </FilterSheet>

      <DataView<InsuranceClaimDto>
        items={sinistres}
        total={tous.length}
        page={list.page}
        pageSize={list.pageSize}
        onPageChange={(page, taille) => (taille !== list.pageSize ? list.setPageSize(taille) : list.setPage(page))}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreur ? t('Impossible de charger les sinistres.') : null}
        onRetry={() => refetch()}
        isFiltered={list.isFiltered}
        onClearFilters={list.clearFilters}
        emptyDescription={t("Aucun sinistre n'est déclaré pour cette agence.")}
        columns={claimColumns(agence)}
        rowKey={claim => claim.id}
        aria-label={t('Sinistres')}
        renderCard={claim => <ClaimCard claim={claim} />}
      />
    </>
  );
};

export default InsuranceClaimsPage;
