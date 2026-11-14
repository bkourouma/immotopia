import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Tabs, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { getSiteDetail } from '../../services/finance-lot2-service';
import { SITE_STATUS_LABELS } from '../../types/finance-lot2-types';
import { libelleNatureImputation } from '../../types/finance-natures-imputation';
import type { SiteAllocationLine, SiteDetail } from '../../types/finance-lot2-types';
import { detailKey, STALE_TIME } from '../../lib/query-keys';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { localizedList } from '../../i18n/localized';
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
const { Text } = Typography;

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
 * `<DataView>` pour chaque tableau, en onglets (`?onglet=postes|imputations`).
 * Le contrat rend le détail entier d'un chantier en une requête : la
 * pagination (20 par page) est locale.
 *
 * **Recherche.** Les imputations ont leur barre (`useLocalListSearch`, préfixe
 * d'URL `imp`) dans `SectionImputations`, montée avec son onglet. Les
 * sous-totaux par poste restent sans barre : un récapitulatif de quelques
 * lignes, déjà agrégé par le serveur.
 */

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale());
}

function dateCourteOuTiret(iso: string | null): string {
  return iso ? dateCourte(iso) : '—';
}

/**
 * La nature d'une imputation, en clair.
 *
 * Passe par `libelleNatureImputation` et non par `DOCUMENT_TYPE_LABELS` : la
 * seconde ne nomme que les pièces **annulables**, trois valeurs, alors qu'une
 * imputation vient de sept sources. Les quatre absentes — note de salaire,
 * situation de tâcheron, sortie de stock, loyer de terrain — s'affichaient
 * donc sous leur code technique, `SALARY_NOTE` à côté de « Facture
 * fournisseur ».
 */
function libelleNature(type: SiteAllocationLine['sourceType']): string {
  return libelleNatureImputation(type);
}

type LignePoste = SiteDetail['byCostCategory'][number];

// Natures d'une imputation (les sept sources du schéma), dans l'ordre d'usage.
const NATURES_IMPUTATION = localizedList(() =>
  [
    'SUPPLIER_INVOICE',
    'SUPPLIER_PAYMENT',
    'CASH_VOUCHER',
    'SALARY_NOTE',
    'PROGRESS_STATEMENT',
    'STOCK_ISSUE',
    'LAND_LEASE_ACCRUAL'
  ].map(value => ({ value, label: libelleNatureImputation(value) }))
);

// Champ libre : poste, nature (libellé affiché) et pièce d'origine.
const TEXTE_IMPUTATIONS = [
  (l: SiteAllocationLine) => l.costCategoryLabel,
  (l: SiteAllocationLine) => libelleNature(l.sourceType),
  (l: SiteAllocationLine) => l.sourceLabel
];

// Valeur lue par les critères non textuels, par clé de critère.
const ACCESSEURS_IMPUTATIONS = {
  nature: (l: SiteAllocationLine) => l.sourceType,
  poste: (l: SiteAllocationLine) => l.costCategoryId,
  date: (l: SiteAllocationLine) => l.allocationDate,
  montant: (l: SiteAllocationLine) => l.amount
};

/**
 * Tableau des imputations d'un chantier, avec sa barre de recherche.
 * Monté seulement quand son onglet est affiché (`destroyOnHidden`).
 */
const SectionImputations: React.FC<{ allocations: SiteAllocationLine[] }> = ({ allocations }) => {
  const postes = useMemo(() => {
    const parId = new Map<string, string>();
    for (const l of allocations) if (!parId.has(l.costCategoryId)) parId.set(l.costCategoryId, l.costCategoryLabel);
    return Array.from(parId, ([value, label]) => ({ value, label }));
  }, [allocations]);

  // Déclarés dans le corps : les libellés se retraduisent au changement de langue.
  const criteres: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Poste, nature, pièce d’origine…')
    },
    { key: 'nature', type: 'select', label: t('Nature'), primary: true, options: NATURES_IMPUTATION },
    { key: 'poste', type: 'select', label: t('Poste'), primary: true, options: postes },
    { key: 'date', type: 'dateRange', label: t('Date') },
    { key: 'montant', type: 'numberRange', label: t('Montant'), unit: 'FCFA' }
  ];
  const local = useLocalListSearch<SiteAllocationLine>(allocations, {
    paramPrefix: 'imp',
    criteria: criteres,
    text: TEXTE_IMPUTATIONS,
    accessors: ACCESSEURS_IMPUTATIONS
  });

  const colonnes: ColumnsType<SiteAllocationLine> = [
    { title: t('Date'), key: 'date', width: 120, render: (_, l) => dateCourte(l.allocationDate) },
    { title: t('Poste'), key: 'poste', render: (_, l) => l.costCategoryLabel },
    { title: t('Nature'), key: 'nature', render: (_, l) => libelleNature(l.sourceType) },
    // Libellé lisible, jamais l'identifiant de la pièce (l.sourceId).
    { title: t('Pièce d’origine'), key: 'piece', render: (_, l) => l.sourceLabel },
    {
      title: t('Montant'),
      key: 'montant',
      align: 'end',
      exportValue: l => l.amount,
      render: (_, l) => <MoneyValue value={l.amount} />
    }
  ];

  return (
    <DataView<SiteAllocationLine>
      helpId="finance.chantier.imputations"
      scrollX={880}
      {...local.dataViewProps}
      emptyDescription={t('Aucune imputation n’a encore été enregistrée sur ce chantier.')}
      columns={colonnes}
      rowKey={l => l.id}
      aria-label={t('Imputations du chantier')}
      export={{ filename: t('Imputations du chantier'), fetchAll: local.exportAll }}
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
  );
};

export const ChantierDetail: React.FC = () => {
  const { tenantId, siteId } = useParams<{ tenantId: string; siteId: string }>();
  const navigate = useNavigate();

  // Onglet actif dans l'URL (?onglet=postes|imputations) ; inconnu -> postes.
  // Une seule requête alimente les deux : changer d'onglet n'en lance aucune.
  const [searchParams, setSearchParams] = useSearchParams();
  const onglet = searchParams.get('onglet') === 'imputations' ? 'imputations' : 'postes';
  const changerOnglet = (cle: string) => {
    const suivants = new URLSearchParams(searchParams);
    suivants.set('onglet', cle);
    setSearchParams(suivants, { replace: true });
  };

  // Pagination locale (20 par page) du récapitulatif par poste : le contrat
  // rend le détail entier. Les imputations paginent avec leur barre de recherche.
  const [pagePostes, setPagePostes] = useState(1);
  const [taillePagePostes, setTaillePagePostes] = useState(20);

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

  const nbPostes = data?.byCostCategory.length;
  useEffect(() => setPagePostes(1), [nbPostes]);

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
      exportValue: p => p.amount,
      render: (_, p) => <MoneyValue value={p.amount} />
    }
  ];

  return (
    <>
      <PageHeader
        helpId="finance.chantier.page"
        title={site.name}
        breadcrumbs={[...filAriane, { label: site.name }]}
        subtitle={[site.zone, site.propertyLabel ?? t('Sans bien (terrain loué)'), site.managerLabel]
          .filter(Boolean)
          .join(' · ')}
        primaryAction={{
          label: t('Nouvelle pièce de caisse'),
          onClick: () => navigate(`/tenant/${tenantId}/finance/pieces-de-caisse?chantierId=${siteId}`),
          // Le garde-fou serveur (`assertSiteOpenTx`) refuse déjà la
          // validation d'une pièce sur un chantier clôturé, mais trop tard :
          // rien n'empêchait jusqu'ici de SAISIR un brouillon qu'on ne pouvait
          // ensuite ni valider ni supprimer. On remonte donc la prévention
          // ici, au moment même où le geste part.
          disabled: site.status === 'CLOSED',
          disabledReason: t(
            "Ce chantier est clôturé : son coût est figé et n'accepte plus de dépense. Rouvrez-le d'abord."
          )
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
        extra={<StatusTag status={site.status} label={SITE_STATUS_LABELS[site.status]} />}
      />

      {/* Discret : ce chantier n'a peut-être jamais basculé au stock (lot 5),
          auquel cas `stockEnabledAt` est nul et rien ne s'affiche ici. Ajouté
          le 20 septembre 2026 — jusque-là, seul l'écran Stock du chantier lui-
          même portait cette date, introuvable depuis la fiche. */}
      {site.stockEnabledAt && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 'var(--space-4)' }}>
          {t('Passé au stock le {{date}}', { date: dateCourte(site.stockEnabledAt) })}{' '}
          <Button
            type="link"
            style={{ padding: 0, height: 'auto' }}
            onClick={() => navigate(`/tenant/${tenantId}/finance/chantiers/${siteId}/stock`)}
          >
            {t('Voir le stock')}
          </Button>
        </Text>
      )}

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
        <StatCard
          helpId="finance.chantier.indicateurs"
          label={t('Coût réel')}
          value={<MoneyValue value={site.actualCost} />}
          tone="positive"
        />
        <StatCard label={t('Avancement')} value={`${site.progressPercent} %`} />
        <StatCard label={t('Début')} value={dateCourteOuTiret(site.startDate)} />
        <StatCard
          label={site.status === 'CLOSED' ? t('Clôturé le') : t('Fin prévue')}
          value={dateCourteOuTiret(site.status === 'CLOSED' ? site.closedAt : site.plannedEndDate)}
        />
      </div>

      <Tabs
        activeKey={onglet}
        onChange={changerOnglet}
        destroyOnHidden
        items={[
          {
            key: 'postes',
            label: t('Sous-totaux par poste'),
            children: (
              <DataView<LignePoste>
                helpId="finance.chantier.postes"
                items={byCostCategory.slice((pagePostes - 1) * taillePagePostes, pagePostes * taillePagePostes)}
                total={byCostCategory.length}
                page={pagePostes}
                pageSize={taillePagePostes}
                onPageChange={(p, taille) => {
                  setPagePostes(taille !== taillePagePostes ? 1 : p);
                  setTaillePagePostes(taille);
                }}
                emptyDescription={t('Aucune imputation n’a encore été enregistrée sur ce chantier.')}
                columns={colonnesPostes}
                rowKey={p => p.costCategoryId}
                aria-label={t('Sous-totaux par poste')}
                export={{
                  filename: t('Sous-totaux par poste'),
                  fetchAll: async () => ({ items: byCostCategory, truncated: false })
                }}
                renderCard={p => (
                  <DataCard title={p.label} aria-label={p.label} highlight={<MoneyValue value={p.amount} />} />
                )}
              />
            )
          },
          {
            key: 'imputations',
            label: t('Imputations'),
            children: <SectionImputations allocations={allocations} />
          }
        ]}
      />
    </>
  );
};

export default ChantierDetail;
