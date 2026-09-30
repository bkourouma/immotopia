import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Button, Form, Input, Modal, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listSuppliers, createSupplier } from '../../services/finance-lot2-service';
import { SUPPLIER_KIND_LABELS } from '../../types/finance-lot2-types';
import type { Supplier, SupplierKind } from '../../types/finance-lot2-types';
import { useListParams } from '../../hooks/useListParams';
import { queryKey, entityKeyPrefix, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, StatusTag, DataView, DataCard, FilterSheet } from '../../components/primitives';
import { t } from '../../i18n/t';

/**
 * Fournisseurs — liste et création, récit 2 du lot 2
 * (`specs/017-finance-fournisseurs-chantiers/spec.md`).
 *
 * Construit sur le même modèle que les écrans du lot 1 (`BalanceClients.tsx`,
 * `Facturation.tsx`) : mêmes primitives, mêmes trois états délégués à
 * `<DataView>`, l'état de liste dans l'URL.
 *
 * `listSuppliers` n'est ni paginé ni filtrable côté serveur (contrat gelé,
 * `finance-lot2-service.ts`) : le champ de recherche ci-dessous filtre donc la
 * liste déjà reçue, côté écran — comme `BalanceAgee.tsx` le fait déjà pour son
 * tri. Le terme cherché vit malgré tout dans l'URL : une liste filtrée reste
 * partageable par copier-coller.
 *
 * **La nature décide de la suite.** Un fournisseur MATERIALS ou MIXED devra
 * obligatoirement rattacher chacune de ses factures à un chantier
 * (`FactureFournisseur.tsx`) ; un fournisseur SERVICES ne le devra jamais.
 * Cet écran ne fait qu'enregistrer cette nature — la contrainte s'applique
 * plus loin.
 */

type Filters = { q: string };
const FILTER_KEYS = ['q'] as const;

const OPTIONS_NATURE = (Object.keys(SUPPLIER_KIND_LABELS) as SupplierKind[]).map(kind => ({
  value: kind,
  label: SUPPLIER_KIND_LABELS[kind]
}));

interface FormulaireFournisseur {
  name: string;
  kind: SupplierKind;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
}

function correspond(fournisseur: Supplier, terme: string): boolean {
  const cible = terme.toLowerCase();
  return [fournisseur.name, fournisseur.contactName, fournisseur.contactPhone, fournisseur.contactEmail]
    .filter((valeur): valeur is string => Boolean(valeur))
    .some(valeur => valeur.toLowerCase().includes(cible));
}

export const Fournisseurs: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useListParams<Filters>({ filterKeys: FILTER_KEYS });

  const [ouvert, setOuvert] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [formulaire] = Form.useForm<FormulaireFournisseur>();

  const {
    data: fournisseurs,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('suppliers', tenantId),
    queryFn: () => listSuppliers(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const toutes = fournisseurs ?? [];
  const terme = list.filters.q ?? '';
  const lignes = terme ? toutes.filter(f => correspond(f, terme)) : toutes;

  const fermer = () => {
    setOuvert(false);
    formulaire.resetFields();
  };

  const soumettre = async () => {
    if (!tenantId) return;
    try {
      const valeurs = await formulaire.validateFields();
      setEnregistrement(true);
      await createSupplier(tenantId, {
        name: valeurs.name,
        kind: valeurs.kind,
        contactName: valeurs.contactName || undefined,
        contactPhone: valeurs.contactPhone || undefined,
        contactEmail: valeurs.contactEmail || undefined
      });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('suppliers', tenantId) });
      message.success(t('Fournisseur « {{name}} » créé.', { name: valeurs.name }));
      fermer();
    } catch (err: any) {
      if (err?.errorFields) return; // Échec de validation du formulaire : déjà signalé par les champs.
      message.error(err?.response?.data?.message || t('La création du fournisseur a échoué.'));
    } finally {
      setEnregistrement(false);
    }
  };

  const ouvrirFactures = (fournisseur: Supplier) =>
    navigate(`/tenant/${tenantId}/finance/factures-fournisseurs?fournisseur=${fournisseur.id}`);

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const colonnes: ColumnsType<Supplier> = [
    { title: t('Raison sociale'), key: 'nom', render: (_, f) => f.name },
    {
      title: t('Nature'),
      key: 'nature',
      render: (_, f) => SUPPLIER_KIND_LABELS[f.kind]
    },
    {
      title: t('Contact'),
      key: 'contact',
      render: (_, f) => [f.contactName, f.contactPhone, f.contactEmail].filter(Boolean).join(' · ') || '—'
    },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, f) => (
        <StatusTag
          status={f.isActive ? 'ACTIVE' : 'INACTIVE'}
          tone={f.isActive ? 'success' : 'neutral'}
          label={f.isActive ? t('Actif') : t('Inactif')}
        />
      )
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, f) => (
        <Button type="link" onClick={() => ouvrirFactures(f)}>
          {t('Voir ses factures')}
        </Button>
      )
    }
  ];

  return (
    <>
      <PageHeader
        title={t('Fournisseurs')}
        subtitle={toutes.length > 0 ? `${toutes.length} fournisseur${toutes.length > 1 ? 's' : ''}` : undefined}
        primaryAction={{ label: t('Nouveau fournisseur'), icon: <PlusOutlined />, onClick: () => setOuvert(true) }}
      />

      <FilterSheet activeCount={terme ? 1 : 0} onClear={list.clearFilters} title={t('Filtrer les fournisseurs')}>
        <div style={{ minWidth: 260 }}>
          <label htmlFor="filtre-fournisseurs-q">{t('Rechercher')}</label>
          <Input
            id="filtre-fournisseurs-q"
            allowClear
            placeholder={t('Raison sociale, contact, téléphone…')}
            value={terme}
            onChange={event => list.setFilters({ q: event.target.value || undefined })}
          />
        </div>
      </FilterSheet>

      <DataView<Supplier>
        paginated={false}
        items={lignes}
        total={lignes.length}
        page={1}
        pageSize={Math.max(lignes.length, 1)}
        onPageChange={() => {}}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? t('Impossible de charger les fournisseurs.') : null}
        onRetry={() => refetch()}
        isFiltered={list.isFiltered}
        onClearFilters={list.clearFilters}
        emptyDescription={t('Aucun fournisseur enregistré.')}
        emptyAction={{ label: t('Nouveau fournisseur'), onClick: () => setOuvert(true) }}
        columns={colonnes}
        rowKey={f => f.id}
        aria-label={t('Fournisseurs')}
        renderCard={f => (
          <DataCard
            title={f.name}
            aria-label={f.name}
            subtitle={SUPPLIER_KIND_LABELS[f.kind]}
            status={
              <StatusTag
                status={f.isActive ? 'ACTIVE' : 'INACTIVE'}
                tone={f.isActive ? 'success' : 'neutral'}
                label={f.isActive ? t('Actif') : t('Inactif')}
              />
            }
            fields={[
              {
                label: t('Contact'),
                value: [f.contactName, f.contactPhone, f.contactEmail].filter(Boolean).join(' · ') || '—'
              }
            ]}
            onOpen={() => ouvrirFactures(f)}
          />
        )}
      />

      <Modal
        title={t('Nouveau fournisseur')}
        open={ouvert}
        onCancel={fermer}
        onOk={soumettre}
        okText={t('Créer')}
        cancelText={t('Annuler')}
        confirmLoading={enregistrement}
        destroyOnHidden
      >
        <Form form={formulaire} layout="vertical" requiredMark={false}>
          <Form.Item
            name="name"
            label={t('Raison sociale')}
            rules={[{ required: true, message: t('La raison sociale est obligatoire.') }]}
          >
            <Input placeholder={t('Ex. Matériaux du Bandama SARL')} />
          </Form.Item>
          <Form.Item
            name="kind"
            label={t('Nature')}
            rules={[{ required: true, message: t('La nature est obligatoire.') }]}
            // La nature décide, plus loin, si le rattachement à un chantier
            // sera obligatoire pour les factures de ce fournisseur.
            extra={t('Décide si le rattachement à un chantier sera obligatoire pour ses factures.')}
          >
            <Select showSearch optionFilterProp="label" options={OPTIONS_NATURE} placeholder={t('Choisir…')} />
          </Form.Item>
          <Form.Item name="contactName" label={t('Contact')}>
            <Input placeholder={t('Nom du contact')} />
          </Form.Item>
          <Form.Item name="contactPhone" label={t('Téléphone')}>
            <Input placeholder="+225 …" />
          </Form.Item>
          <Form.Item name="contactEmail" label={t('E-mail')}>
            <Input type="email" placeholder="contact@fournisseur.tld" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
