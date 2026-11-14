import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Button, Form, Input, Modal, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { listSuppliersPage, createSupplier } from '../../services/finance-lot2-service';
import { SUPPLIER_KIND_LABELS } from '../../types/finance-lot2-types';
import type { Supplier, SupplierKind } from '../../types/finance-lot2-types';
import { useListSearch } from '../../hooks/useListSearch';
import type { SearchCriterion } from '../../utils/list-search';
import { collectAllPages } from '../../utils/table-export/collect';
import { queryKey, entityKeyPrefix, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, StatusTag, DataView, DataCard } from '../../components/primitives';
import { t } from '../../i18n/t';
import { localizedList } from '../../i18n/localized';
import { HelpSectionTitle } from '../../help';

/**
 * Fournisseurs — liste et création, récit 2 du lot 2
 * (`specs/017-finance-fournisseurs-chantiers/spec.md`).
 *
 * Les critères URL (`q`, `nature`, `actif`) et la pagination sont appliqués par
 * l'API. L'export relit toutes les pages qui correspondent aux critères.
 *
 * **La nature décide de la suite.** Un fournisseur MATERIALS ou MIXED devra
 * obligatoirement rattacher chacune de ses factures à un chantier
 * (`FactureFournisseur.tsx`) ; un fournisseur SERVICES ne le devra jamais.
 * Cet écran ne fait qu'enregistrer cette nature — la contrainte s'applique
 * plus loin.
 */

const OPTIONS_NATURE = localizedList(() =>
  (Object.keys(SUPPLIER_KIND_LABELS) as SupplierKind[]).map(kind => ({
    value: kind,
    label: SUPPLIER_KIND_LABELS[kind]
  }))
);

interface FormulaireFournisseur {
  name: string;
  kind: SupplierKind;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
}

export const Fournisseurs: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [ouvert, setOuvert] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [formulaire] = Form.useForm<FormulaireFournisseur>();

  // Déclarés dans le corps : les libellés se retraduisent au changement de langue.
  const criteres: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Raison sociale, contact, téléphone, e-mail…'),
      api: 'search'
    },
    { key: 'nature', type: 'multiSelect', label: t('Nature'), primary: true, options: OPTIONS_NATURE, api: 'kind' },
    {
      key: 'actif',
      type: 'boolean',
      label: t('Statut'),
      primary: true,
      tristate: true,
      trueLabel: t('Actif'),
      falseLabel: t('Inactif'),
      api: 'isActive'
    }
  ];
  const search = useListSearch({ criteria: criteres, apiNames: { sort: false } });
  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('suppliers', tenantId, search.apiParams),
    queryFn: () => listSuppliersPage(tenantId as string, search.apiParams),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });
  const total = data?.total ?? 0;
  const fournisseurs = data?.items ?? [];

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
        helpId="finance.fournisseurs.page"
        title={t('Fournisseurs')}
        subtitle={
          // Deux clés plutôt qu'un « s » collé : chaque langue accorde à sa façon.
          total === 0 ? undefined : total === 1 ? t('1 fournisseur') : t('{{count}} fournisseurs', { count: total })
        }
        primaryAction={{ label: t('Nouveau fournisseur'), icon: <PlusOutlined />, onClick: () => setOuvert(true) }}
      />

      <DataView<Supplier>
        helpId="finance.fournisseurs.tableau"
        items={fournisseurs}
        total={total}
        search={search.searchProps}
        {...search.dataViewProps}
        export={{
          filename: t('Fournisseurs'),
          fetchAll: () =>
            collectAllPages<Supplier>(async (page, limit) => {
              const result = await listSuppliersPage(tenantId, { ...search.filterParams, page, limit });
              return result;
            })
        }}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? t('Impossible de charger les fournisseurs.') : null}
        errorCause={erreurRequete}
        onRetry={() => refetch()}
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
        title={<HelpSectionTitle title={t('Nouveau fournisseur')} helpId="finance.fournisseurs.nouveau" />}
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
