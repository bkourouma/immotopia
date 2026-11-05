import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listInsuranceClaimsPage, listInsurancePolicies } from '../../services/insurance-service';
import type { ColumnsType } from 'antd/es/table';
import type { InsuranceClaimDto, InsuranceClaimStatus } from '../../types/insurance-types';
import { CLAIM_STATUS_VALUES, claimStatusLabel, options } from '../../components/insurance/insurance-labels';
import { useAuth } from '../../hooks/useAuth';
import { useListSearch } from '../../hooks/useListSearch';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, DataView } from '../../components/primitives';
import { propertyCriterion } from '../rental/rental-search-criteria';
import { t } from '../../i18n/t';
import { isForbiddenError } from '../../components/patrimoine/patrimoine-labels';
import { PatrimoineForbidden } from '../../components/patrimoine/PatrimoineForbidden';
import { ClaimCard, claimColumns } from './claims-columns';
import { collectAllPages } from '../../utils/table-export/collect';

/**
 * Sinistres de l'agence : vue d'ensemble en lecture seule. Les changements de
 * statut se font dans l'onglet « Assurances et sinistres » de la fiche du bien.
 * La recherche (champ libre, statut, bien, police — spec 032 US4.2) vit dans l'URL
 * et part à l'API, qui filtre PUIS plafonne la liste (`CLAIMS_LIMIT`, sans
 * total) : la liste reçue est donc entière pour les critères posés, et seule la
 * pagination est locale. Au plafond, la page le dit au lieu d'annoncer un
 * total exhaustif.
 */

/** Maximum accepté par l'API pour une liste de sinistres. */

/** Les montants s'exportent en nombres purs (Excel peut les sommer), pas en texte formaté. */
const VALEURS_EXPORT: Record<string, (claim: InsuranceClaimDto) => number | null> = {
  reclame: claim => claim.claimedAmount,
  indemnise: claim => claim.indemnifiedAmount,
  reste: claim => claim.outOfPocketAmount
};

function colonnesExport(tenantId: string): ColumnsType<InsuranceClaimDto> {
  return claimColumns(tenantId).map(colonne => {
    const valeur = colonne.key !== undefined ? VALEURS_EXPORT[String(colonne.key)] : undefined;
    return valeur ? { ...colonne, exportValue: valeur } : colonne;
  });
}

function sousTitre(total: number): string {
  if (total <= 0) return t('Déclarations et suivi des sinistres');
  return total > 1 ? t('{{total}} sinistres', { total }) : t('{{total}} sinistre', { total });
}

export const InsuranceClaimsPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenantMembership } = useAuth();
  const agence = tenantId || tenantMembership?.tenantId;

  // Polices de l'agence (liste courte, non paginée) : options du critère « Police ».
  const { data: polices } = useQuery({
    queryKey: queryKey('insurance-policies', agence, {}),
    queryFn: () => listInsurancePolicies(agence as string),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.list
  });
  const optionsPolice = useMemo(
    () =>
      (polices ?? []).map(police => ({
        value: police.id,
        label: t('{{assureur}} · n° {{numero}}', { assureur: police.insurer, numero: police.policyNumber })
      })),
    [polices]
  );

  const search = useListSearch({
    defaultPageSize: 25,
    apiNames: { sort: false },
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Bien, police, assureur, description…'),
        api: 'search'
      },
      {
        key: 'status',
        type: 'select',
        label: t('Statut'),
        placeholder: t('Tous les statuts'),
        primary: true,
        options: options(CLAIM_STATUS_VALUES, claimStatusLabel)
      },
      propertyCriterion(agence, { api: 'propertyId', primary: true }),
      {
        key: 'policyId',
        type: 'select',
        label: t('Police'),
        placeholder: t('Toutes les polices'),
        options: optionsPolice
      }
    ]
  });
  const filtres = search.filterParams as {
    search?: string;
    status?: InsuranceClaimStatus;
    propertyId?: string;
    policyId?: string;
  };

  const {
    data,
    isPending,
    isFetching,
    error: erreur,
    refetch
  } = useQuery({
    queryKey: queryKey('insurance-claims', agence, search.apiParams),
    queryFn: () =>
      listInsuranceClaimsPage(agence as string, {
        ...filtres,
        page: search.page,
        limit: Math.min(search.pageSize, 100)
      }),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });

  if (!agence) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  if (isForbiddenError(erreur)) return <PatrimoineForbidden />;

  const sinistres = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <>
      <PageHeader title={t('Sinistres')} subtitle={sousTitre(total)} />

      <DataView<InsuranceClaimDto>
        export={{
          filename: t('Sinistres'),
          columns: colonnesExport(agence),
          fetchAll: () =>
            collectAllPages(async (page, limit) => listInsuranceClaimsPage(agence, { ...filtres, page, limit }))
        }}
        items={sinistres}
        total={total}
        search={search.searchProps}
        {...search.dataViewProps}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreur ? t('Impossible de charger les sinistres.') : null}
        errorCause={erreur}
        onRetry={() => refetch()}
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
