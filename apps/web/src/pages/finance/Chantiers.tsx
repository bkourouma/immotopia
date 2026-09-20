import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Button, DatePicker, Input, Modal, Select, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Dayjs } from 'dayjs';
import { createConstructionSite, listConstructionSites } from '../../services/finance-lot2-service';
import { SITE_STATUS_LABELS } from '../../types/finance-lot2-types';
import type { ConstructionSite } from '../../types/finance-lot2-types';
import { listProperties } from '../../services/property-service';
import { useListParams } from '../../hooks/useListParams';
import { entityKeyPrefix, queryKey, STALE_TIME } from '../../lib/query-keys';
import {
  PageHeader,
  StateBlock,
  MoneyValue,
  DataView,
  DataCard,
  FilterSheet,
  StatusTag
} from '../../components/primitives';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
/**
 * Chantiers — récit B7 du lot 2 (specs/017-finance-fournisseurs-chantiers/spec.md,
 * User Story 7).
 *
 * L'écran qui débloque le cas de la cliente : un chantier se crée **sans bien
 * préexistant**, pour un terrain loué où rien au patrimoine ne pouvait encore
 * l'accueillir. `propertyId` reste facultatif à la création — le bien pourra
 * être posé à la clôture, hors périmètre de ce lot.
 *
 * Construit sur le même modèle que `BalanceClients.tsx` et `WorkProgramsPage.tsx` :
 * mêmes primitives, même état de liste porté par l'URL (`useListParams`), mêmes
 * trois états délégués à `<DataView>`. Le parc des biens est chargé pour la
 * seule option facultative du formulaire de création, exactement comme
 * `BalanceClients.tsx` le fait pour son filtre « Bien ».
 *
 * **Le contrat de création est celui de `finance-lot2-service.ts`, gelé.**
 * `createConstructionSite` n'accepte que `name`, `zone`, `propertyId`,
 * `startDate`, `plannedEndDate` — aucun champ « responsable » n'y figure,
 * contrairement à ce que `ConstructionSite.managerLabel` pourrait laisser
 * attendre côté lecture. Le formulaire n'invente donc pas de champ que la
 * frontière réseau n'accepterait pas : la colonne « Responsable » de la liste
 * affiche `managerLabel` tel que le serveur le renseigne, sans qu'un geste de
 * cet écran ne puisse encore le poser.
 *
 * **Vocabulaire (P-1).** On *impute*, jamais « débit » ni « crédit ».
 *
 * **Aucune saisie du coût réel (P-4).** `ConstructionSite.actualCost` est
 * calculé côté serveur ; ce formulaire de création ne le propose évidemment
 * pas, et aucun autre écran de ce module ne l'offre non plus.
 */

type Filters = { status: string };
const FILTER_KEYS = ['status'] as const;

const OPTIONS_STATUT = Object.entries(SITE_STATUS_LABELS).map(([value, label]) => ({ value, label }));

function dateCourte(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(activeLocale()) : '—';
}

export const Chantiers: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useListParams<Filters>({ filterKeys: FILTER_KEYS });

  const [modalOuvert, setModalOuvert] = useState(false);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [nom, setNom] = useState('');
  const [zone, setZone] = useState('');
  const [propertyId, setPropertyId] = useState<string | undefined>(undefined);
  const [dateDebut, setDateDebut] = useState<Dayjs | null>(null);
  const [dateFinPrevue, setDateFinPrevue] = useState<Dayjs | null>(null);

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('construction-sites', tenantId, { status: list.filters.status || '' }),
    queryFn: () => listConstructionSites(tenantId as string, { status: list.filters.status || undefined }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  // Options du bien, facultatif : mêmes raisons qu'au filtre « Bien » de
  // `BalanceClients.tsx` — il faut un identifiant, et la liste des chantiers
  // n'en porte pas dans ses libellés.
  const { data: parc } = useQuery({
    queryKey: queryKey('finance-parc', tenantId, {}),
    queryFn: () => listProperties(tenantId as string, { page: 1, limit: 200 }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const optionsBiens = useMemo(
    () =>
      (parc?.properties ?? [])
        .map(bien => ({ value: bien.id, label: bien.title }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [parc]
  );

  const chantiers = data ?? [];

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const reinitialiserFormulaire = () => {
    setNom('');
    setZone('');
    setPropertyId(undefined);
    setDateDebut(null);
    setDateFinPrevue(null);
  };

  const ouvrirCreation = () => {
    reinitialiserFormulaire();
    setModalOuvert(true);
  };

  const fermerCreation = () => {
    if (!creationEnCours) setModalOuvert(false);
  };

  const validerCreation = async () => {
    if (!nom.trim()) {
      message.error(t('Le nom du chantier est obligatoire.'));
      return;
    }
    setCreationEnCours(true);
    try {
      const chantier = await createConstructionSite(tenantId, {
        name: nom.trim(),
        zone: zone.trim() || undefined,
        propertyId,
        startDate: dateDebut ? dateDebut.format('YYYY-MM-DD') : undefined,
        plannedEndDate: dateFinPrevue ? dateFinPrevue.format('YYYY-MM-DD') : undefined
      });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('construction-sites', tenantId) });
      message.success(t('Chantier « {{name}} » créé.', { name: chantier.name }));
      setModalOuvert(false);
      navigate(`/tenant/${tenantId}/finance/chantiers/${chantier.id}`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La création du chantier a échoué.'));
    } finally {
      setCreationEnCours(false);
    }
  };

  const ouvrirDetail = (chantier: ConstructionSite) => navigate(`/tenant/${tenantId}/finance/chantiers/${chantier.id}`);

  const colonnes: ColumnsType<ConstructionSite> = [
    { title: t('Chantier'), key: 'nom', render: (_, c) => c.name },
    { title: t('Zone'), key: 'zone', render: (_, c) => c.zone || '—' },
    { title: t('Bien'), key: 'bien', render: (_, c) => c.propertyLabel ?? t('Sans bien (terrain loué)') },
    { title: t('Responsable'), key: 'responsable', render: (_, c) => c.managerLabel ?? '—' },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, c) => <StatusTag status={c.status} label={SITE_STATUS_LABELS[c.status]} />
    },
    {
      title: t('Coût réel'),
      key: 'cout',
      align: 'end',
      // Calculé côté serveur (P-4) : cette colonne se contente de l'afficher.
      render: (_, c) => <MoneyValue value={c.actualCost} />
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, c) => (
        <Button type="link" onClick={() => ouvrirDetail(c)}>
          {t('Voir le détail')}
        </Button>
      )
    }
  ];

  return (
    <>
      <PageHeader
        title={t('Chantiers')}
        subtitle={
          chantiers.length > 0
            ? t('{{nombre}} chantier{{s}}', { nombre: chantiers.length, s: chantiers.length > 1 ? 's' : '' })
            : undefined
        }
        primaryAction={{ label: t('Nouveau chantier'), icon: <PlusOutlined />, onClick: ouvrirCreation }}
      />

      <FilterSheet
        activeCount={list.filters.status ? 1 : 0}
        onClear={() => list.setFilters({ status: undefined })}
        title={t('Filtrer les chantiers')}
      >
        <div style={{ minWidth: 220 }}>
          <label htmlFor="filtre-statut-chantier">{t('Statut')}</label>
          <Select
            id="filtre-statut-chantier"
            style={{ width: '100%' }}
            placeholder={t('Tous les statuts')}
            allowClear
            value={list.filters.status || undefined}
            onChange={valeur => list.setFilters({ status: valeur })}
            options={OPTIONS_STATUT}
          />
        </div>
      </FilterSheet>

      <DataView<ConstructionSite>
        // Le contrat de `listConstructionSites` ne pagine pas : l'API rend
        // l'ensemble des chantiers du tenant (au plus une dizaine, cf. spec).
        paginated={false}
        scrollX={960}
        items={chantiers}
        total={chantiers.length}
        page={1}
        pageSize={Math.max(chantiers.length, 1)}
        onPageChange={() => {}}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? t('Impossible de charger les chantiers.') : null}
        onRetry={() => refetch()}
        isFiltered={list.isFiltered}
        onClearFilters={() => list.setFilters({ status: undefined })}
        emptyDescription={t("Aucun chantier n'est encore enregistré.")}
        emptyAction={{ label: t('Nouveau chantier'), onClick: ouvrirCreation }}
        columns={colonnes}
        rowKey={c => c.id}
        aria-label={t('Chantiers')}
        renderCard={c => (
          <DataCard
            title={c.name}
            aria-label={c.name}
            subtitle={[c.zone, c.propertyLabel ?? t('Sans bien (terrain loué)')].filter(Boolean).join(' · ')}
            status={<StatusTag status={c.status} label={SITE_STATUS_LABELS[c.status]} />}
            highlight={<MoneyValue value={c.actualCost} />}
            fields={[
              { label: 'Responsable', value: c.managerLabel ?? '—' },
              { label: t('Début'), value: dateCourte(c.startDate) }
            ]}
            onOpen={() => ouvrirDetail(c)}
          />
        )}
      />

      <Modal
        title={t('Nouveau chantier')}
        open={modalOuvert}
        onCancel={fermerCreation}
        confirmLoading={creationEnCours}
        onOk={validerCreation}
        okText={t('Créer le chantier')}
        cancelText={t('Annuler')}
        destroyOnHidden
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <label htmlFor="chantier-nom">{t('Nom du chantier')}</label>
            <Input
              id="chantier-nom"
              value={nom}
              onChange={event => setNom(event.target.value)}
              placeholder={t('Ex. Villa duplex — Angré Centre')}
            />
          </div>
          <div>
            <label htmlFor="chantier-zone">{t('Zone')}</label>
            <Input
              id="chantier-zone"
              value={zone}
              onChange={event => setZone(event.target.value)}
              placeholder={t('Ex. Angré, Cocody')}
            />
          </div>
          <div>
            <label htmlFor="chantier-bien">{t('Bien (facultatif)')}</label>
            <Select
              id="chantier-bien"
              style={{ width: '100%' }}
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('Aucun bien — pourra en recevoir un à la clôture')}
              value={propertyId}
              onChange={setPropertyId}
              options={optionsBiens}
            />
          </div>
          <Space style={{ width: '100%' }} size="middle">
            <div style={{ flex: 1 }}>
              <label htmlFor="chantier-debut">{t('Début')}</label>
              <DatePicker
                id="chantier-debut"
                style={{ width: '100%' }}
                format="DD/MM/YYYY"
                value={dateDebut}
                onChange={setDateDebut}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="chantier-fin">{t('Fin prévue')}</label>
              <DatePicker
                id="chantier-fin"
                style={{ width: '100%' }}
                format="DD/MM/YYYY"
                value={dateFinPrevue}
                onChange={setDateFinPrevue}
                disabledDate={current => (dateDebut ? current.isBefore(dateDebut, 'day') : false)}
              />
            </div>
          </Space>
        </Space>
      </Modal>
    </>
  );
};

export default Chantiers;
