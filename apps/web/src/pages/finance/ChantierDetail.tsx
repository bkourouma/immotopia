import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { getSiteDetail } from '../../services/finance-lot2-service';
import { DOCUMENT_TYPE_LABELS, SITE_STATUS_LABELS } from '../../types/finance-lot2-types';
import type { SiteAllocationLine, SiteDetail } from '../../types/finance-lot2-types';
import { detailKey, STALE_TIME } from '../../lib/query-keys';
import {
  PageHeader,
  StateBlock,
  MoneyValue,
  DataView,
  DataCard,
  StatCard,
  StatusTag
} from '../../components/primitives';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Title } = Typography;

/**
 * Détail d'un chantier — récits B8 et B9 du lot 2
 * (specs/017-finance-fournisseurs-chantiers/spec.md, User Stories 8 et 9).
 *
 * **Le point qui compte le plus (P-4).** `site.actualCost` arrive déjà
 * calculé par le serveur, comme somme des imputations validées. Cet écran ne
 * l'additionne jamais lui-même et n'offre **aucun champ** pour le saisir ou le
 * corriger — c'est l'exigence explicite de l'agent qui a commandé cet écran, et
 * la métrique de succès du PRD (« coût réel de chantier saisi à la main : 0 »).
 * Un chiffre qu'on tape à la main est un chiffre qu'on oublie de mettre à jour.
 *
 * **Chaque imputation porte un libellé lisible de sa pièce d'origine**
 * (`sourceLabel`), jamais son identifiant (`sourceId`, présent dans la donnée
 * pour la traçabilité, mais jamais affiché) — la leçon retenue du lot 1, où un
 * compte rendu affichait des identifiants bruts. La nature de la pièce
 * (facture ou pièce de caisse) est rendue par `DOCUMENT_TYPE_LABELS`, la table
 * du contrat gelé, jamais recomposée ici.
 *
 * **Les sous-totaux par poste** sont ceux que le serveur restitue
 * (`SiteDetail.byCostCategory`), dans son ordre d'affichage — pas un
 * regroupement recalculé côté client, pour la même raison que le coût réel
 * n'est jamais recalculé : une seule source de vérité.
 *
 * Construit sur le modèle de `Releve.tsx` : un en-tête qui porte les totaux,
 * `<DataView>` pour chaque tableau, aucune pagination puisque le contrat rend
 * le détail entier d'un chantier (au plus quelques dizaines d'imputations).
 */

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale());
}

function dateCourteOuTiret(iso: string | null): string {
  return iso ? dateCourte(iso) : '—';
}

function libelleNature(type: SiteAllocationLine['sourceType']): string {
  return DOCUMENT_TYPE_LABELS()[type] ?? type;
}

type LignePoste = SiteDetail['byCostCategory'][number];

export const ChantierDetail: React.FC = () => {
  const { tenantId, siteId } = useParams<{ tenantId: string; siteId: string }>();
  const navigate = useNavigate();

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: detailKey('construction-sites', tenantId, siteId ?? ''),
    queryFn: () => getSiteDetail(tenantId as string, siteId as string),
    enabled: Boolean(tenantId && siteId),
    staleTime: STALE_TIME.list
  });

  if (!tenantId || !siteId) {
    return <StateBlock variant="empty" title={t('Aucun chantier sélectionné')} />;
  }

  const filAriane = [
    { label: t('Finance'), to: `/tenant/${tenantId}/finance/chantiers` },
    { label: t('Chantiers'), to: `/tenant/${tenantId}/finance/chantiers` }
  ];

  if (erreurRequete) {
    return (
      <>
        <PageHeader title={t('Détail du chantier')} breadcrumbs={[...filAriane, { label: t('Détail') }]} />
        <StateBlock
          variant="error"
          description={t('Impossible de charger ce chantier.')}
          actions={[{ label: t('Réessayer'), onClick: () => refetch(), primary: true }]}
        />
      </>
    );
  }

  if (isPending || !data) {
    return <StateBlock variant="loading" />;
  }

  const { site, allocations, byCostCategory } = data;

  const colonnesPostes: ColumnsType<LignePoste> = [
    { title: t('Poste'), key: 'poste', render: (_, p) => p.label },
    {
      title: t('Sous-total'),
      key: 'montant',
      align: 'end',
      render: (_, p) => <MoneyValue value={p.amount} />
    }
  ];

  const colonnesImputations: ColumnsType<SiteAllocationLine> = [
    { title: t('Date'), key: 'date', width: 120, render: (_, l) => dateCourte(l.allocationDate) },
    { title: t('Poste'), key: 'poste', render: (_, l) => l.costCategoryLabel },
    { title: t('Nature'), key: 'nature', render: (_, l) => libelleNature(l.sourceType) },
    // Libellé lisible, jamais l'identifiant de la pièce (l.sourceId).
    { title: t('Pièce d’origine'), key: 'piece', render: (_, l) => l.sourceLabel },
    {
      title: t('Montant'),
      key: 'montant',
      align: 'end',
      render: (_, l) => <MoneyValue value={l.amount} />
    }
  ];

  return (
    <>
      <PageHeader
        title={site.name}
        breadcrumbs={[...filAriane, { label: site.name }]}
        subtitle={[site.zone, site.propertyLabel ?? t('Sans bien (terrain loué)'), site.managerLabel]
          .filter(Boolean)
          .join(' · ')}
        primaryAction={{
          label: t('Nouvelle pièce de caisse'),
          onClick: () => navigate(`/tenant/${tenantId}/finance/caisse?chantierId=${siteId}`)
        }}
        // Les lots et la clôture vivent sur leur propre écran (lot 4,
        // sous-lot 6). Sans ce chemin, il n'était atteignable que par le
        // menu, qui ne connaît pas le chantier qu'on regarde — et l'écran
        // serait resté aussi introuvable que la caisse l'était au lot 2.
        secondaryActions={[
          {
            key: 'cloture',
            label: t('Lots et clôture'),
            onClick: () => navigate(`/tenant/${tenantId}/finance/chantiers/${siteId}/cloture`)
          },
          {
            key: 'stock',
            label: t('Stock du chantier'),
            onClick: () => navigate(`/tenant/${tenantId}/finance/chantiers/${siteId}/stock`)
          }
        ]}
        extra={<StatusTag status={site.status} label={SITE_STATUS_LABELS()[site.status]} />}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-6)'
        }}
      >
        {/* Calculé côté serveur : aucun de ces indicateurs n'est un champ de
            saisie, en particulier pas le coût réel (P-4). */}
        <StatCard label={t('Coût réel')} value={<MoneyValue value={site.actualCost} />} tone="positive" />
        <StatCard label={t('Avancement')} value={`${site.progressPercent} %`} />
        <StatCard label={t('Début')} value={dateCourteOuTiret(site.startDate)} />
        <StatCard
          label={site.status === 'CLOSED' ? t('Clôturé le') : t('Fin prévue')}
          value={dateCourteOuTiret(site.status === 'CLOSED' ? site.closedAt : site.plannedEndDate)}
        />
      </div>

      <Title level={4}>{t('Sous-totaux par poste')}</Title>
      <DataView<LignePoste>
        paginated={false}
        items={byCostCategory}
        total={byCostCategory.length}
        page={1}
        pageSize={Math.max(byCostCategory.length, 1)}
        onPageChange={() => {}}
        emptyDescription={t('Aucune imputation n’a encore été enregistrée sur ce chantier.')}
        columns={colonnesPostes}
        rowKey={p => p.costCategoryId}
        aria-label={t('Sous-totaux par poste')}
        renderCard={p => <DataCard title={p.label} aria-label={p.label} highlight={<MoneyValue value={p.amount} />} />}
      />

      <Title level={4} style={{ marginTop: 'var(--space-6)' }}>
        {t('Imputations')}
      </Title>
      <DataView<SiteAllocationLine>
        paginated={false}
        scrollX={880}
        items={allocations}
        total={allocations.length}
        page={1}
        pageSize={Math.max(allocations.length, 1)}
        onPageChange={() => {}}
        emptyDescription={t('Aucune imputation n’a encore été enregistrée sur ce chantier.')}
        columns={colonnesImputations}
        rowKey={l => l.id}
        aria-label={t('Imputations du chantier')}
        renderCard={l => (
          <DataCard
            title={l.costCategoryLabel}
            aria-label={`${l.costCategoryLabel}, ${dateCourte(l.allocationDate)}`}
            subtitle={`${dateCourte(l.allocationDate)} · ${libelleNature(l.sourceType)}`}
            highlight={<MoneyValue value={l.amount} />}
            fields={[{ label: t('Pièce d’origine'), value: l.sourceLabel }]}
          />
        )}
      />
    </>
  );
};

export default ChantierDetail;
