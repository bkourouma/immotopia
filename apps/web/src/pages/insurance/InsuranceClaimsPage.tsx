import React from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Select } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { listInsuranceClaims } from '../../services/insurance-service';
import type { InsuranceClaimDto, InsuranceClaimStatus } from '../../types/insurance-types';
import { CLAIM_STATUS_VALUES, claimStatusLabel, options } from '../../components/insurance/insurance-labels';
import { useAuth } from '../../hooks/useAuth';
import { useListParams } from '../../hooks/useListParams';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, DataView, FilterSheet } from '../../components/primitives';
import { t } from '../../i18n/t';
import { ClaimCard, claimColumns } from './claims-columns';

/**
 * Sinistres de l'agence : vue d'ensemble en lecture seule. Les changements de
 * statut se font dans l'onglet « Assurances et sinistres » de la fiche du bien.
 * Le statut vit dans l'URL ; le filtrage est fait par l'API, qui plafonne la
 * liste (`CLAIMS_LIMIT`) : au plafond, la page le dit au lieu d'annoncer un
 * total exhaustif.
 */

type Filtres = { status: string };
const FILTER_KEYS = ['status'] as const;
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

  const {
    data,
    isPending,
    isFetching,
    error: erreur,
    refetch
  } = useQuery({
    queryKey: queryKey('insurance-claims', agence, { status, limit: CLAIMS_LIMIT }),
    queryFn: () => listInsuranceClaims(agence as string, { status, limit: CLAIMS_LIMIT }),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.list
  });

  if (!agence) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

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

      <FilterSheet activeCount={status ? 1 : 0} onClear={list.clearFilters} title={t('Filtrer les sinistres')}>
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
