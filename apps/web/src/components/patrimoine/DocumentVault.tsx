import React, { useState } from 'react';
import { Button, Card, Popconfirm, Space, Tag } from 'antd';
import { Table } from '../primitives';
import type { ExportableTableProps } from '../primitives/Table';
import type { PropertyDocument } from '../../types/property-types';
import { downloadPropertyDocumentFile } from '../../services/property-service';
import { feedback } from '../../lib/feedback';
import { saveBlob } from '../../utils/save-blob';
import { t } from '../../i18n/t';
import { activeLocale } from '../../i18n/format';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { apiErrorMessage, documentTypeLabel, documentTypeOptions } from './patrimoine-labels';

interface Props {
  documents: PropertyDocument[];
  /** Agence et bien : le fichier se télécharge par la route authentifiée. */
  tenantId: string;
  propertyId: string;
  /** Absent quand l'utilisateur ne peut pas modifier le bien : pas de bouton Supprimer. */
  onDelete?: (documentId: string) => void;
  deletingId?: string | null;
  /** Action d'en-tête (bouton « Ajouter »), absente en lecture seule. */
  extra?: React.ReactNode;
  /**
   * Opt-in : active la barre de recherche multicritères (filtrage local, 10 par
   * page, export de la liste filtrée). La valeur est le préfixe des paramètres
   * d'URL (`doc` donne `doc.q`, `doc.type`…) ; elle suppose un routeur.
   * Absente : le coffre-fort s'affiche comme avant, sans barre (5 par page).
   */
  searchPrefix?: string;
}

type ExpiryCode = 'none' | 'expired' | 'soon' | 'valid';

/** Statut d'expiration : une seule règle pour le badge et pour le critère de recherche. */
function expiryStatus(expiresAt?: string | null): { code: ExpiryCode; diffDays: number } {
  if (!expiresAt) return { code: 'none', diffDays: 0 };
  const diffDays = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { code: 'expired', diffDays };
  if (diffDays <= 30) return { code: 'soon', diffDays };
  return { code: 'valid', diffDays };
}

function expiryInfo(expiresAt?: string | null): { label: string; color: string } {
  const { code, diffDays } = expiryStatus(expiresAt);
  if (code === 'none') return { label: t('Sans expiration'), color: 'default' };
  if (code === 'expired') return { label: t('Expiré'), color: 'red' };
  if (code === 'soon') return { label: t('Expire dans {{diffDays}}j', { diffDays }), color: 'orange' };
  return { label: t('Valide'), color: 'green' };
}

// Accesseurs stables (hors composant). Champ libre : nom du fichier et type tel qu'affiché.
const TEXTE_RECHERCHE = [
  (d: PropertyDocument) => d.fileName,
  (d: PropertyDocument) => documentTypeLabel(d.documentType)
];
const ACCESSEURS = { type: (d: PropertyDocument) => d.documentType };
const PREDICATS = {
  expiration: (d: PropertyDocument, value: unknown) => expiryStatus(d.expirationDate).code === value
};

type VaultTableProps = Partial<ExportableTableProps<PropertyDocument>>;

/**
 * Coffre-fort documentaire d'un bien.
 *
 * Les fichiers ne sont jamais servis en statique : « Télécharger » passe par
 * `GET .../documents/:documentId/file`, qui vérifie l'agence, le bien et la
 * permission `PROPERTIES_VIEW`.
 *
 * Sans `searchPrefix`, rendu historique (aucun hook de recherche, aucun routeur
 * requis). Avec, la variante `SearchableDocumentVault` ajoute la barre : deux
 * composants plutôt qu'un hook conditionnel.
 */
export const DocumentVault: React.FC<Props> = props =>
  props.searchPrefix ? (
    <SearchableDocumentVault {...props} searchPrefix={props.searchPrefix} />
  ) : (
    <DocumentVaultCard {...props} tableProps={{ dataSource: props.documents, pagination: { pageSize: 5 } }} />
  );

const SearchableDocumentVault: React.FC<Props & { searchPrefix: string }> = props => {
  const criteres: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Nom du fichier, type…') },
    { key: 'type', type: 'multiSelect', label: t('Type'), primary: true, options: documentTypeOptions() },
    {
      key: 'expiration',
      type: 'select',
      label: t('Expiration'),
      primary: true,
      options: [
        { value: 'expired', label: t('Expiré') },
        { value: 'soon', label: t('Expire dans 30 jours') },
        { value: 'valid', label: t('Valide') },
        { value: 'none', label: t('Sans expiration') }
      ]
    }
  ];
  const local = useLocalListSearch<PropertyDocument>(props.documents, {
    paramPrefix: props.searchPrefix,
    ariaLabel: t('Rechercher dans les documents'),
    defaultPageSize: 10,
    criteria: criteres,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS,
    predicates: PREDICATS
  });
  return (
    <DocumentVaultCard
      {...props}
      tableProps={{
        ...local.tableProps,
        exportFetchAll: local.exportAll,
        locale: local.isFiltered ? undefined : { emptyText: t('Aucun document pour ce bien.') }
      }}
    />
  );
};

const DocumentVaultCard: React.FC<Props & { tableProps: VaultTableProps }> = ({
  tenantId,
  propertyId,
  onDelete,
  deletingId,
  extra,
  tableProps
}) => {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const download = async (document: PropertyDocument) => {
    setDownloadingId(document.id);
    try {
      const { blob, filename } = await downloadPropertyDocumentFile(
        tenantId,
        propertyId,
        document.id,
        document.fileName || 'document'
      );
      saveBlob(blob, filename);
    } catch (error) {
      feedback.error(apiErrorMessage(error, t('Téléchargement impossible.')));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Card title={t('Coffre-fort documentaire')} extra={extra}>
      <Table<PropertyDocument>
        helpId="patrimoine.bien.coffre-fort"
        exportFilename={t('Coffre-fort documentaire')}
        scroll={{ x: 'max-content' }}
        rowKey="id"
        locale={{ emptyText: t('Aucun document pour ce bien.') }}
        {...tableProps}
        columns={[
          { title: t('Nom du fichier'), dataIndex: 'fileName' },
          {
            title: t('Type'),
            dataIndex: 'documentType',
            render: (value: string) => <Tag>{documentTypeLabel(value)}</Tag>
          },
          {
            title: t('Expiration'),
            dataIndex: 'expirationDate',
            exportValue: (record: PropertyDocument) =>
              `${record.expirationDate ? new Date(record.expirationDate).toLocaleDateString(activeLocale()) : '—'} — ${expiryInfo(record.expirationDate).label}`,
            render: (value?: string | null) => {
              const info = expiryInfo(value);
              return (
                <Space>
                  {value ? new Date(value).toLocaleDateString(activeLocale()) : '—'}
                  <Tag color={info.color}>{info.label}</Tag>
                </Space>
              );
            }
          },
          {
            title: t('Ajouté le'),
            dataIndex: 'createdAt',
            render: (value?: string) => (value ? new Date(value).toLocaleDateString(activeLocale()) : '—')
          },
          {
            title: t('Actions'),
            key: 'actions',
            render: (_: unknown, record: PropertyDocument) => (
              <Space>
                <Button size="small" loading={downloadingId === record.id} onClick={() => download(record)}>
                  {t('Télécharger')}
                </Button>
                {onDelete ? (
                  <Popconfirm title={t('Supprimer ce document ?')} onConfirm={() => onDelete(record.id)}>
                    <Button danger size="small" loading={deletingId === record.id}>
                      {t('Supprimer')}
                    </Button>
                  </Popconfirm>
                ) : null}
              </Space>
            )
          }
        ]}
      />
    </Card>
  );
};
