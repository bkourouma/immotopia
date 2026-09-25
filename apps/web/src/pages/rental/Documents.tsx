import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { App, Button, Select, Modal, Drawer, Space, Dropdown } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, DownloadOutlined, MoreOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listDocuments,
  generateDocument,
  regenerateDocument,
  downloadDocument,
  RentalDocument,
  RentalDocumentType,
  RentalDocumentStatus,
  GenerateDocumentRequest
} from '../../services/rental-service';
import { DocumentForm } from '../../components/rental/DocumentForm';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useListParams } from '../../hooks/useListParams';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import {
  PageHeader,
  StateBlock,
  StatusTag,
  DataView,
  DataCard,
  FilterSheet,
  useConfirmAction
} from '../../components/primitives';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
/**
 * Documents de location — cinquième des six écrans hybrides (§9.7).
 *
 * **Le téléchargement contournait `apiClient`.** Trente lignes de `fetch` brut
 * écrites à même le gestionnaire de clic d'une colonne : pas de délai maximal,
 * pas de rafraîchissement de session sur 401, pas de nouvelle tentative. Une
 * session expirée pendant un téléchargement affichait « Failed to download
 * document: 401 Unauthorized » au lieu de se renouveler. Le téléchargement
 * passe maintenant par le service, donc par `apiClient`.
 *
 * **L'extension était forcée à `.docx`** pour tous les documents, y compris
 * ceux rendus en PDF : le fichier arrivait avec une extension qui ne
 * correspondait pas à son contenu et ne s'ouvrait pas. Elle vient désormais de
 * l'en-tête `Content-Disposition`.
 *
 * **Deux actions en icône seule** avec un `title` HTML natif, invisible au
 * clavier et muet au lecteur d'écran. Une action nommée, le reste derrière
 * « ⋮ ». **Six colonnes derrière `scroll={{ x: 'max-content' }}`** passent à
 * cinq. Le formulaire de génération, ouvert en pleine page, devient une boîte
 * de dialogue.
 *
 * `handleStatusChange`, défini et jamais appelé, est retiré — comme sur l'écran
 * des paiements, dont celui-ci est visiblement une copie.
 */

interface DocumentsProps {
  /** Fourni quand l'écran est monté en onglet d'un bail. */
  leaseId?: string;
}

type Filters = { type: string; status: string };
const FILTER_KEYS = ['type', 'status'] as const;

function TYPE_LABELS(): Record<string, string> {
  return {
    LEASE_CONTRACT: t('Contrat de bail'),
    LEASE_ADDENDUM: t('Avenant'),
    RENT_RECEIPT: t('Reçu de loyer'),
    RENT_QUITTANCE: t('Quittance de loyer'),
    DEPOSIT_RECEIPT: t('Reçu de dépôt'),
    STATEMENT: t('Relevé'),
    OTHER: t('Autre')
  };
}

function STATUS_OPTIONS() {
  return [
    { value: 'DRAFT', label: t('Brouillon') },
    { value: 'FINAL', label: t('Final') },
    { value: 'VOID', label: t('Annulé') }
  ];
}

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale());
}

export const Documents: React.FC<DocumentsProps> = ({ leaseId: propLeaseId }) => {
  const { message } = App.useApp();
  const { tenantId, leaseId: paramLeaseId } = useParams<{ tenantId: string; leaseId?: string }>();
  const leaseId = propLeaseId || paramLeaseId;
  const queryClient = useQueryClient();
  const confirmAction = useConfirmAction();
  const { isDesktop } = useBreakpoint();

  const list = useListParams<Filters>({ filterKeys: FILTER_KEYS, defaultPageSize: 50 });
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [telechargementEnCours, setTelechargementEnCours] = useState<string | null>(null);

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('documents', tenantId, { ...list.queryParams, leaseId: leaseId ?? '' }),
    queryFn: () =>
      listDocuments(tenantId as string, {
        leaseId,
        type: (list.filters.type as RentalDocumentType) || undefined,
        status: (list.filters.status as RentalDocumentStatus) || undefined,
        page: list.page,
        limit: list.pageSize
      }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const documents = data?.data ?? [];
  const total = data?.pagination?.total ?? 0;

  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ['documents', tenantId] });

  const handleGenerate = async (donnees: GenerateDocumentRequest) => {
    if (!tenantId) return;
    // Les erreurs remontent au formulaire, qui les affiche lui-même.
    await generateDocument(tenantId, donnees);
    setFormulaireOuvert(false);
    await rafraichir();
    message.success(t('Document généré.'));
  };

  const handleRegenerate = (doc: RentalDocument) => {
    if (!tenantId) return;
    confirmAction({
      title: t('Régénérer ce document ?'),
      description: t(
        'Le document {{document_number}} sera reconstruit à partir des données actuelles du bail. La version précédente est remplacée.',
        { document_number: doc.document_number }
      ),
      okText: t('Régénérer'),
      onConfirm: async () => {
        try {
          await regenerateDocument(tenantId, doc.id);
          await rafraichir();
          message.success(t('Document régénéré.'));
        } catch (err: any) {
          message.error(err?.response?.data?.message || t('La régénération a échoué.'));
        }
      }
    });
  };

  const handleDownload = async (doc: RentalDocument) => {
    if (!tenantId) return;
    setTelechargementEnCours(doc.id);
    try {
      const { blob, filename } = await downloadDocument(tenantId, doc.id, doc.document_number || 'document');
      const url = window.URL.createObjectURL(blob);
      const lien = window.document.createElement('a');
      lien.href = url;
      lien.download = filename;
      window.document.body.appendChild(lien);
      lien.click();
      // L'URL d'objet est révoquée APRÈS le retrait du lien : l'inverse laisse
      // au navigateur une référence vers une URL déjà libérée.
      window.document.body.removeChild(lien);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('Le téléchargement a échoué.'));
    } finally {
      setTelechargementEnCours(null);
    }
  };

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const actionsSecondaires = (doc: RentalDocument) => [
    { key: 'regen', label: t('Régénérer à partir des données actuelles'), onClick: () => handleRegenerate(doc) }
  ];

  const colonnes: ColumnsType<RentalDocument> = [
    {
      title: t('Document'),
      key: 'document',
      render: (_, doc) => (
        <>
          <div style={{ fontWeight: 600 }}>{doc.document_number}</div>
          {/* Le titre rejoint le numéro plutôt que d'occuper sa propre
              colonne : les deux nomment le même document, et le titre est
              souvent vide. */}
          {doc.title && (
            <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>{doc.title}</div>
          )}
        </>
      )
    },
    { title: t('Type'), key: 'type', render: (_, doc) => TYPE_LABELS()[doc.type] || doc.type },
    { title: t('Émis le'), key: 'emis', render: (_, doc) => dateCourte(doc.issued_at) },
    { title: t('Statut'), key: 'statut', render: (_, doc) => <StatusTag status={doc.status} /> },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, doc) => (
        <Space>
          <Button
            icon={<DownloadOutlined />}
            loading={telechargementEnCours === doc.id}
            onClick={() => handleDownload(doc)}
          >
            {t('Télécharger')}
          </Button>
          <Dropdown menu={{ items: actionsSecondaires(doc) }} trigger={['click']} placement="bottomRight">
            {/* Nom accessible explicite : le numéro du document distingue ce
                menu des autres de la liste. */}
            <Button
              icon={<MoreOutlined />}
              aria-label={t('Autres actions pour {{document_number}}', { document_number: doc.document_number })}
            />
          </Dropdown>
        </Space>
      )
    }
  ];

  const formulaire = (
    <DocumentForm
      tenantId={tenantId}
      leaseId={leaseId}
      onSubmit={handleGenerate}
      onCancel={() => setFormulaireOuvert(false)}
    />
  );

  return (
    <>
      <PageHeader
        title={t('Documents')}
        subtitle={total > 0 ? `${total} document${total > 1 ? 's' : ''}` : undefined}
        primaryAction={{
          label: t('Générer un document'),
          icon: <PlusOutlined />,
          onClick: () => setFormulaireOuvert(true)
        }}
      />

      <FilterSheet
        activeCount={Object.keys(list.filters).length}
        onClear={list.clearFilters}
        title={t('Filtrer les documents')}
      >
        <div style={{ minWidth: 200 }}>
          <label htmlFor="filtre-type-document">{t('Type')}</label>
          <Select
            id="filtre-type-document"
            style={{ width: '100%' }}
            placeholder={t('Tous les types')}
            allowClear
            value={list.filters.type || undefined}
            onChange={valeur => list.setFilters({ type: valeur })}
            options={Object.entries(TYPE_LABELS()).map(([value, label]) => ({ value, label }))}
          />
        </div>
        <div style={{ minWidth: 200 }}>
          <label htmlFor="filtre-statut-document">{t('Statut')}</label>
          <Select
            id="filtre-statut-document"
            style={{ width: '100%' }}
            placeholder={t('Tous les statuts')}
            allowClear
            value={list.filters.status || undefined}
            onChange={valeur => list.setFilters({ status: valeur })}
            options={STATUS_OPTIONS()}
          />
        </div>
      </FilterSheet>

      <DataView<RentalDocument>
        items={documents}
        total={total}
        page={list.page}
        pageSize={list.pageSize}
        onPageChange={(page, taille) => (taille !== list.pageSize ? list.setPageSize(taille) : list.setPage(page))}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? t('Impossible de charger les documents.') : null}
        onRetry={() => refetch()}
        isFiltered={list.isFiltered}
        onClearFilters={list.clearFilters}
        emptyDescription={
          leaseId
            ? t('Aucun document pour ce bail. Générez-en un depuis l’action ci-dessus.')
            : t('Aucun document enregistré.')
        }
        emptyAction={{ label: t('Générer un document'), onClick: () => setFormulaireOuvert(true) }}
        columns={colonnes}
        rowKey={doc => doc.id}
        aria-label={t('Documents de location')}
        renderCard={doc => (
          <DataCard
            title={doc.document_number}
            aria-label={t('Document {{document_number}}', { document_number: doc.document_number })}
            subtitle={doc.title || TYPE_LABELS()[doc.type] || doc.type}
            status={<StatusTag status={doc.status} />}
            fields={[
              { label: 'Type', value: TYPE_LABELS()[doc.type] || doc.type },
              { label: t('Émis le'), value: dateCourte(doc.issued_at) }
            ]}
            primaryAction={{
              label: t('Télécharger'),
              icon: <DownloadOutlined />,
              loading: telechargementEnCours === doc.id,
              onClick: () => handleDownload(doc)
            }}
            secondaryActions={actionsSecondaires(doc)}
          />
        )}
      />

      {/* Modale au-dessus de 992 px, feuille pleine hauteur en dessous (§10.1) :
          le formulaire de génération dépasse trois champs. */}
      {isDesktop ? (
        <Modal
          open={formulaireOuvert}
          title={t('Générer un document')}
          onCancel={() => setFormulaireOuvert(false)}
          footer={null}
          width={720}
          destroyOnHidden
        >
          {formulaire}
        </Modal>
      ) : (
        <Drawer
          open={formulaireOuvert}
          title={t('Générer un document')}
          onClose={() => setFormulaireOuvert(false)}
          placement="bottom"
          height="92%"
          destroyOnHidden
        >
          {formulaire}
        </Drawer>
      )}
    </>
  );
};
